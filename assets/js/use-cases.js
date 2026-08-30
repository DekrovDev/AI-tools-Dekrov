// Pure use-cases logic: parse, validate, and resolve curated use-case data.
// No DOM, no framework. Membership is explicit via toolIds; nothing is inferred.

export const USE_CASES_PATH = "data/use-cases.json";

export function isValidUseCaseId(id) {
  return typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}

export function useCaseName(value) {
  return String(value ?? "").trim();
}

// Deduplicate an unknown tool ID list deterministically while preserving order.
export function uniqueToolIds(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== "string" || !value.trim() || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

// Parse a raw use-cases value (parsed array or JSON string) into a safe array.
// Never throws. Drops malformed entries and duplicate IDs; collapses the rest.
export function parseUseCases(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const id = entry.id;
    const name = useCaseName(entry.name);
    if (!isValidUseCaseId(id) || !name || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      name,
      shortDescription: useCaseName(entry.shortDescription),
      description: useCaseName(entry.description) || useCaseName(entry.shortDescription),
      icon: typeof entry.icon === "string" && entry.icon.trim() ? entry.icon : "folder",
      toolIds: uniqueToolIds(entry.toolIds)
    });
  }
  return result;
}

export function useCaseById(useCases, id) {
  return (Array.isArray(useCases) ? useCases : []).find((entry) => entry.id === id) || null;
}

// Resolve the tool objects for a use case from a tool-ID map, ignoring unknown IDs.
export function resolveUseCaseTools(useCase, toolById) {
  if (!useCase) return [];
  const map = toolById instanceof Map ? toolById : new Map();
  return (Array.isArray(useCase.toolIds) ? useCase.toolIds : [])
    .filter((id) => map.has(id))
    .map((id) => map.get(id));
}

// Count of tools that currently exist in the catalog for this use case.
export function useCaseCount(useCase, toolById) {
  return resolveUseCaseTools(useCase, toolById).length;
}