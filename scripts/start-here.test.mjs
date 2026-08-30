import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createCatalogSearch } from "../assets/js/search-engine.js";
import { parseUseCases } from "../assets/js/use-cases.js";
import {
  DEFAULT_PRIMARY_LIMIT,
  applyFilters,
  applyStartAnswer,
  computeCandidates,
  findOption,
  parseStartHere,
  resolveGoal
} from "../assets/js/start-here.js";

const tools = JSON.parse(readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));
const toolById = new Map(tools.map((tool) => [tool.id, tool]));
const useCases = parseUseCases(readFileSync(new URL("../data/use-cases.json", import.meta.url), "utf8"));
const schema = JSON.parse(readFileSync(new URL("../data/tool-schema.json", import.meta.url), "utf8"));
const ALLOWED = { platforms: schema.properties.platforms.items.enum, pricing: schema.properties.pricing.enum };
const source = JSON.parse(readFileSync(new URL("../data/start-here.json", import.meta.url), "utf8"));
const config = parseStartHere(source, ALLOWED);

test("valid Start Here config parses into three steps with goal options mapping to existing use cases", () => {
  assert.equal(config.version, 1);
  assert.equal(config.steps.length, 3);
  assert.deepEqual(config.steps.map((s) => s.id), ["goal", "platform", "pricing"]);
  for (const option of config.steps[0].options) {
    assert.ok(option.useCaseId);
    assert.ok(useCases.some((u) => u.id === option.useCaseId), `missing use case ${option.useCaseId}`);
  }
});

test("malformed config roots fail safely to an empty flow", () => {
  const empty = { version: 1, steps: [] };
  assert.deepEqual(parseStartHere("{ nope", ALLOWED), empty);
  assert.deepEqual(parseStartHere(42, ALLOWED), empty);
  assert.deepEqual(parseStartHere(null, ALLOWED), empty);
  assert.deepEqual(parseStartHere({}, ALLOWED), empty);
  assert.deepEqual(parseStartHere({ version: 1, steps: "nope" }, ALLOWED), empty);
});

test("duplicate step IDs are collapsed deterministically", () => {
  const parsed = parseStartHere({ steps: [{ id: "a", title: "A", options: [{ id: "x", label: "X" }] }, { id: "a", title: "B", options: [{ id: "y", label: "Y" }] }] }, ALLOWED);
  assert.deepEqual(parsed.steps.map((s) => s.title), ["A"]);
});

test("duplicate option IDs within a step are collapsed deterministically", () => {
  const parsed = parseStartHere({ steps: [{ id: "s", title: "S", options: [{ id: "x", label: "First" }, { id: "x", label: "Second" }] }] }, ALLOWED);
  assert.deepEqual(parsed.steps[0].options.map((o) => o.label), ["First"]);
});

test("options with missing labels or invalid platform/pricing values are dropped", () => {
  const parsed = parseStartHere({
    steps: [{
      id: "s", title: "S",
      options: [
        { id: "nolabel" },
        { id: "bad-platform", label: "Bad", platform: "not-a-platform" },
        { id: "bad-pricing", label: "Bad", pricing: ["free", "vip"] },
        { id: "good", label: "Good", platform: "cli", pricing: ["free", "freemium"] }
      ]
    }]
  }, ALLOWED);
  assert.deepEqual(parsed.steps[0].options.map((o) => o.id), ["good"]);
});

test("an option referencing a deleted use case resolves to null (no fake use case)", () => {
  const cfg = parseStartHere({ steps: [{ id: "goal", title: "G", options: [{ id: "gone", label: "Gone", useCaseId: "does-not-exist" }] }] }, ALLOWED);
  assert.equal(resolveGoal(cfg, useCases, "gone"), null);
  assert.equal(resolveGoal(config, useCases, "unknown-option"), null);
});

test("selected goal resolves to the correct existing use case", () => {
  const resolved = resolveGoal(config, useCases, "terminal-ai");
  assert.equal(resolved.useCase.id, "terminal-ai");
  assert.equal(resolved.useCase.name, "Use AI from the terminal");
});

test("use-case membership provides the initial candidate set", () => {
  const result = computeCandidates(config, { goal: "terminal-ai" }, useCases, toolById);
  const terminal = useCases.find((u) => u.id === "terminal-ai");
  assert.equal(result.total, terminal.toolIds.length);
  assert.deepEqual(result.matches.map((t) => t.id), terminal.toolIds.slice(0, DEFAULT_PRIMARY_LIMIT));
});

test("platform preference narrows candidates", () => {
  const result = computeCandidates(config, { goal: "build-ai-agents", platform: "vscode" }, useCases, toolById);
  assert.ok(result.total > 0);
  assert.ok(result.allMatches.every((t) => t.platforms.includes("vscode")));
});

test("pricing preference narrows candidates", () => {
  const result = computeCandidates(config, { goal: "terminal-ai", pricing: "free" }, useCases, toolById);
  assert.ok(result.total > 0);
  assert.ok(result.allMatches.every((t) => t.pricing === "free"));
});

test("platform and pricing are ANDed", () => {
  const result = computeCandidates(config, { goal: "terminal-ai", platform: "cli", pricing: "free" }, useCases, toolById);
  assert.ok(result.allMatches.every((t) => t.platforms.includes("cli") && t.pricing === "free"));
});

test("Free does not include freemium; Free-or-freemium includes both explicitly", () => {
  const freeOnly = applyFilters(tools, { pricing: ["free"] });
  assert.ok(freeOnly.length > 0);
  assert.ok(freeOnly.every((t) => t.pricing === "free"));
  assert.ok(!freeOnly.some((t) => t.pricing === "freemium"));
  const freeOrFreemium = applyFilters(tools, { pricing: ["free", "freemium"] });
  assert.ok(freeOrFreemium.some((t) => t.pricing === "free"));
  assert.ok(freeOrFreemium.some((t) => t.pricing === "freemium"));
});

test("no-preference leaves the candidate set unchanged", () => {
  const base = computeCandidates(config, { goal: "build-ai-agents" }, useCases, toolById);
  const any = computeCandidates(config, { goal: "build-ai-agents", platform: "any-platform", pricing: "any-pricing" }, useCases, toolById);
  assert.equal(any.total, base.total);
  assert.deepEqual(any.allMatches.map((t) => t.id), base.allMatches.map((t) => t.id));
});

test("a restrictive combination deterministically yields zero results", () => {
  const result = computeCandidates(config, { goal: "local-ai-models", platform: "web", pricing: "free" }, useCases, toolById);
  assert.equal(result.total, 0);
  assert.deepEqual(result.matches, []);
});

test("one-result states work", () => {
  // Cerebras is the only build-with-ai-apis member on the web platform.
  const result = computeCandidates(config, { goal: "build-with-ai-apis", platform: "web" }, useCases, toolById);
  assert.equal(result.total, 1);
  assert.deepEqual(result.matches.map((t) => t.id), ["cerebras"]);
});

test("result limit caps primary matches while the full count stays correct", () => {
  const result = computeCandidates(config, { goal: "terminal-ai" }, useCases, toolById);
  assert.ok(result.matches.length <= DEFAULT_PRIMARY_LIMIT);
  assert.equal(result.matches.length, Math.min(result.total, DEFAULT_PRIMARY_LIMIT));
  assert.equal(result.allMatches.length, result.total);
});

test("curated use-case ordering is preserved in results", () => {
  const result = computeCandidates(config, { goal: "vscode-ai" }, useCases, toolById);
  const vscode = useCases.find((u) => u.id === "vscode-ai");
  assert.deepEqual(result.allMatches.map((t) => t.id), vscode.toolIds);
});

test("applyStartAnswer clears dependent later answers", () => {
  let answers = applyStartAnswer(config, {}, "goal", "terminal-ai");
  answers = applyStartAnswer(config, answers, "platform", "cli");
  answers = applyStartAnswer(config, answers, "pricing", "free");
  assert.deepEqual(answers, { goal: "terminal-ai", platform: "cli", pricing: "free" });
  // changing the goal clears platform and pricing
  const changed = applyStartAnswer(config, answers, "goal", "build-ai-agents");
  assert.deepEqual(changed, { goal: "build-ai-agents" });
  // changing platform clears pricing but not goal
  const partial = applyStartAnswer(config, { goal: "terminal-ai", platform: "cli", pricing: "free" }, "platform", "vscode");
  assert.deepEqual(partial, { goal: "terminal-ai", platform: "vscode" });
});

test("Start Over clears wizard state (no goal => no results)", () => {
  const result = computeCandidates(config, {}, useCases, toolById);
  assert.equal(result.useCase, null);
  assert.equal(result.total, 0);
});

test("goal options expose a resolvable use-case reference via the config option", () => {
  const option = findOption(config.steps[0], "local-ai-models");
  assert.equal(option.useCaseId, "local-ai-models");
  assert.ok(useCases.some((u) => u.id === option.useCaseId));
});

// Shared scoping must remain intact for existing surfaces.
test("use-case / My Stack / Collections scoped search still confine results, and favorites still combine", () => {
  const engine = createCatalogSearch(tools);
  const agents = useCases.find((u) => u.id === "build-ai-agents");
  const allowed = new Set(agents.toolIds);
  const scoped = engine.search("claude", { allowedIds: allowed });
  assert.ok(scoped.tools.every((t) => allowed.has(t.id)));
  // windsurf matches the full catalog but is not a build-ai-agents member.
  assert.ok(engine.search("windsurf").tools.length > 0);
  assert.equal(engine.search("windsurf", { allowedIds: allowed }).tools.length, 0);
  assert.ok(engine.search("opencode", { allowedIds: new Set(["opencode", "windsurf"]) }).tools.every((t) => ["opencode", "windsurf"].includes(t.id)));
  const fav = engine.search("opencode", { favoritesOnly: true, favoriteIds: new Set(["opencode"]) });
  assert.deepEqual(fav.tools.map((t) => t.id), ["opencode"]);
});