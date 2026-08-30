// Pure Start Here wizard logic: parse the static config, resolve the goal to an
// existing use case, and narrow its curated members by the user's structured
// platform/pricing preferences. No DOM, no LLM, no fuzzy inference.

import { resolveUseCaseTools } from "./use-cases.js";

export const START_HERE_PATH = "data/start-here.json";
export const DEFAULT_PRIMARY_LIMIT = 5;

function cleanId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
function cleanLabel(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

// Returns a safe option object, or null when the option is structurally invalid
// (missing id/label, or an unknown platform/pricing value).
function sanitizeOption(raw, allowed) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = cleanId(raw.id);
  const label = cleanLabel(raw.label);
  if (!id || !label) return null;
  const option = { id, label };
  if (typeof raw.icon === "string" && raw.icon.trim()) option.icon = raw.icon.trim();
  if (typeof raw.description === "string" && raw.description.trim()) option.description = raw.description.trim();
  if (typeof raw.useCaseId === "string" && raw.useCaseId.trim()) option.useCaseId = raw.useCaseId.trim();
  if (Object.prototype.hasOwnProperty.call(raw, "platform")) {
    if (raw.platform == null) option.platform = null;
    else if (allowed.platforms.includes(raw.platform)) option.platform = raw.platform;
    else return null; // invalid platform value: drop the option rather than guess
  }
  if (Object.prototype.hasOwnProperty.call(raw, "pricing")) {
    if (raw.pricing == null) {
      option.pricing = null;
    } else if (Array.isArray(raw.pricing)) {
      const values = [...new Set(raw.pricing.filter((value) => allowed.pricing.includes(value)))];
      if (values.length !== raw.pricing.length) return null; // any unknown value: drop
      option.pricing = values;
    } else {
      return null;
    }
  }
  return option;
}

// Parse a raw config (parsed object or JSON string) into a safe { version, steps }.
// Never throws: malformed roots collapse to an empty flow, duplicate step/option
// IDs are collapsed deterministically, and invalid options are dropped.
export function parseStartHere(raw, allowed = { platforms: [], pricing: [] }) {
  let source = raw;
  if (typeof raw === "string") {
    try {
      source = JSON.parse(raw);
    } catch {
      return { version: 1, steps: [] };
    }
  }
  if (Array.isArray(source)) source = { version: 1, steps: source };
  if (!source || typeof source !== "object" || Array.isArray(source)) return { version: 1, steps: [] };
  const rawSteps = Array.isArray(source.steps) ? source.steps : [];
  const seenSteps = new Set();
  const steps = [];
  for (const rawStep of rawSteps) {
    if (!rawStep || typeof rawStep !== "object" || Array.isArray(rawStep)) continue;
    const id = cleanId(rawStep.id);
    const title = cleanLabel(rawStep.title);
    if (!id || !title || seenSteps.has(id)) continue;
    seenSteps.add(id);
    const rawOptions = Array.isArray(rawStep.options) ? rawStep.options : [];
    const seenOptions = new Set();
    const options = [];
    for (const rawOption of rawOptions) {
      const option = sanitizeOption(rawOption, allowed);
      if (!option || seenOptions.has(option.id)) continue;
      seenOptions.add(option.id);
      options.push(option);
    }
    if (!options.length) continue;
    steps.push({ id, title, options });
  }
  return { version: Number.isFinite(source.version) ? source.version : 1, steps };
}

export function findOption(step, optionId) {
  return (Array.isArray(step?.options) ? step.options : []).find((option) => option.id === optionId) || null;
}

export function stepIndex(config, stepId) {
  return (Array.isArray(config?.steps) ? config.steps : []).findIndex((step) => step.id === stepId);
}

// The first step is the goal. Resolve a selected goal option to the existing
// curated use case it references. Returns null when the option or use case is gone.
export function resolveGoal(config, useCases, goalOptionId) {
  const step = config?.steps?.[0];
  const option = findOption(step, goalOptionId);
  if (!option?.useCaseId) return null;
  const useCase = (Array.isArray(useCases) ? useCases : []).find((entry) => entry.id === option.useCaseId) || null;
  if (!useCase) return null;
  return { option, useCase };
}

// Narrow an ordered tool list by structured platform/pricing preferences.
// "free" never includes "freemium": the pricing argument is an explicit allow-list.
export function applyFilters(tools, { platform = null, pricing = null } = {}) {
  let out = Array.isArray(tools) ? tools : [];
  if (platform) out = out.filter((tool) => Array.isArray(tool.platforms) && tool.platforms.includes(platform));
  if (Array.isArray(pricing) && pricing.length) {
    const allowed = new Set(pricing);
    out = out.filter((tool) => allowed.has(tool.pricing));
  }
  return out;
}

// Compute the recommendation set for the current answers.
// Ordering: curated use-case order (existing toolIds order), no opaque scoring.
// matches = up to primaryLimit; allMatches/total = the full filtered set.
export function computeCandidates(config, answers, useCases, toolById, { primaryLimit = DEFAULT_PRIMARY_LIMIT } = {}) {
  const resolved = resolveGoal(config, useCases, answers?.goal);
  if (!resolved) return { useCase: null, matches: [], allMatches: [], total: 0 };
  const base = resolveUseCaseTools(resolved.useCase, toolById);
  const platformOption = findOption(config?.steps?.[1], answers?.platform);
  const pricingOption = findOption(config?.steps?.[2], answers?.pricing);
  const allMatches = applyFilters(base, { platform: platformOption?.platform ?? null, pricing: pricingOption?.pricing ?? null });
  return { useCase: resolved.useCase, matches: allMatches.slice(0, primaryLimit), allMatches, total: allMatches.length };
}

// Record an answer and clear every dependent later answer so stale state can
// never survive an earlier choice being changed.
export function applyStartAnswer(config, answers, stepId, optionId) {
  const next = { ...(answers || {}) };
  const index = stepIndex(config, stepId);
  if (index === -1) return next;
  next[stepId] = optionId;
  for (let i = index + 1; i < (config?.steps || []).length; i += 1) {
    delete next[config.steps[i].id];
  }
  return next;
}