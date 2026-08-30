import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createCatalogSearch, filterCatalogTools, sortCatalogTools } from "../assets/js/search-engine.js";
import {
  isValidUseCaseId,
  parseUseCases,
  resolveUseCaseTools,
  uniqueToolIds,
  useCaseById,
  useCaseCount
} from "../assets/js/use-cases.js";

const tools = JSON.parse(readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));
const toolById = new Map(tools.map((tool) => [tool.id, tool]));
const source = JSON.parse(readFileSync(new URL("../data/use-cases.json", import.meta.url), "utf8"));
const engine = createCatalogSearch(tools);

test("valid use-case data parses into the expected curated source", () => {
  const parsed = parseUseCases(source);
  assert.ok(parsed.length >= 6 && parsed.length <= 10, `expected 6-10 use cases, got ${parsed.length}`);
  for (const entry of parsed) {
    assert.ok(isValidUseCaseId(entry.id), `id must be URL-safe slug: ${entry.id}`);
    assert.ok(entry.name.trim().length > 0);
    assert.ok(Array.isArray(entry.toolIds));
    assert.equal(entry.description, entry.description || entry.shortDescription);
  }
});

test("every referenced tool ID exists in the current catalog (curated integrity)", () => {
  for (const entry of parseUseCases(source)) {
    for (const id of entry.toolIds) {
      assert.ok(toolById.has(id), `use case ${entry.id} references unknown tool ${id}`);
    }
  }
});

test("malformed roots do not crash: object, number, and invalid JSON strings", () => {
  assert.deepEqual(parseUseCases({}), []);
  assert.deepEqual(parseUseCases(42), []);
  assert.deepEqual(parseUseCases("{ nope"), []);
  assert.deepEqual(parseUseCases(null), []);
  assert.deepEqual(parseUseCases(undefined), []);
  assert.deepEqual(parseUseCases("not json"), []);
});

test("entries missing id or name are dropped", () => {
  const parsed = parseUseCases([{ id: "x", name: "Ok", toolIds: [] }, { name: "no id" }, { id: "y" }, 7, "str"]);
  assert.deepEqual(parsed.map((e) => e.id), ["x"]);
});

test("duplicate use-case IDs are collapsed deterministically, keeping the first", () => {
  const parsed = parseUseCases([{ id: "dup", name: "First", toolIds: [] }, { id: "dup", name: "Second", toolIds: ["a"] }]);
  assert.deepEqual(parsed.map((e) => e.name), ["First"]);
});

test("duplicate tool IDs within one use case are deduplicated preserving order", () => {
  const parsed = parseUseCases([{ id: "uc", name: "UC", toolIds: ["b", "a", "b", "a", "c"] }]);
  assert.deepEqual(parsed[0].toolIds, ["b", "a", "c"]);
  assert.deepEqual(uniqueToolIds(["b", "a", "b", "a", "c"]), ["b", "a", "c"]);
});

test("invalid tool IDs (numbers, empty strings) are filtered out", () => {
  assert.deepEqual(uniqueToolIds(["a", 1, "", " "]), ["a"]);
});

test("unknown tool IDs do not break resolution and do not count toward the visible count", () => {
  const useCase = { id: "uc", name: "UC", toolIds: ["aider", "ghost-tool", "opencode"] };
  const resolved = resolveUseCaseTools(useCase, toolById);
  assert.deepEqual(resolved.map((t) => t.id), ["aider", "opencode"]);
  assert.equal(useCaseCount(useCase, toolById), 2);
  assert.deepEqual(resolveUseCaseTools(useCase, new Map()), []);
  assert.equal(useCaseCount(useCase, new Map()), 0);
});

test("URL-safe use-case ID routing accepts valid slugs and rejects unsafe strings", () => {
  assert.ok(isValidUseCaseId("terminal-ai"));
  assert.ok(isValidUseCaseId("a0-b1"));
  assert.ok(!isValidUseCaseId("Use AI"));
  assert.ok(!isValidUseCaseId("use_ai"));
  assert.ok(!isValidUseCaseId("<script>"));
  assert.ok(!isValidUseCaseId(""));
  assert.ok(!isValidUseCaseId("-lead"));
  assert.ok(!isValidUseCaseId("trail-"));
});

test("unknown use-case route resolves to null (safe fallback)", () => {
  const parsed = parseUseCases(source);
  assert.equal(useCaseById(parsed, "terminal-ai").id, "terminal-ai");
  assert.equal(useCaseById(parsed, "not-a-real-slug"), null);
});

test("membership resolves by tool ID in the real catalog", () => {
  const parsed = parseUseCases(source);
  const terminal = useCaseById(parsed, "terminal-ai");
  const resolved = resolveUseCaseTools(terminal, toolById);
  assert.ok(resolved.length > 1);
  assert.ok(resolved.every((tool) => terminal.toolIds.includes(tool.id)));
});

test("use-case scoped search only returns members (no leak) even for a matching non-member", () => {
  const parsed = parseUseCases(source);
  const terminal = useCaseById(parsed, "terminal-ai");
  const allowed = new Set(resolveUseCaseTools(terminal, toolById).map((t) => t.id));
  // bolt-new is a full-catalog match for "web app" but is not in terminal-ai.
  const result = engine.search("aider", { allowedIds: allowed });
  assert.ok(result.tools.length > 0);
  assert.ok(result.tools.every((t) => allowed.has(t.id)));
  // github-copilot is a real catalog tool but not part of terminal-ai.
  const out = engine.search("copilot", { allowedIds: allowed });
  assert.ok(out.tools.length === 0);
});

test("empty search inside a use case returns exactly its members", () => {
  const parsed = parseUseCases(source);
  const build = useCaseById(parsed, "build-ai-agents");
  const allowed = new Set(resolveUseCaseTools(build, toolById).map((t) => t.id));
  const result = engine.search("", { allowedIds: allowed });
  assert.equal(result.queryActive, false);
  assert.ok(result.tools.length === allowed.size);
  assert.ok(result.tools.every((t) => allowed.has(t.id)));
});

test("platform filter combines with use-case scope", () => {
  const allowed = new Set([...engine.search("").tools.map((t) => t.id)]);
  const filtered = filterCatalogTools(tools, { allowedIds: allowed, platform: "cli" });
  assert.ok(filtered.every((t) => allowed.has(t.id)));
  assert.ok(filtered.every((t) => t.platforms.includes("cli")));
  // CLI is a real intersection for the terminal use case.
  const parsed = parseUseCases(source);
  const terminal = useCaseById(parsed, "terminal-ai");
  const ids = new Set(resolveUseCaseTools(terminal, toolById).map((t) => t.id));
  const cliOnly = filterCatalogTools(tools, { allowedIds: ids, platform: "cli" });
  assert.ok(cliOnly.length > 0);
  assert.ok(cliOnly.every((t) => ids.has(t.id) && t.platforms.includes("cli")));
});

test("pricing filter combines with use-case scope", () => {
  const parsed = parseUseCases(source);
  const terminal = useCaseById(parsed, "terminal-ai");
  const ids = new Set(resolveUseCaseTools(terminal, toolById).map((t) => t.id));
  const filtered = filterCatalogTools(tools, { allowedIds: ids, pricing: "free" });
  assert.ok(filtered.every((t) => ids.has(t.id) && t.pricing === "free"));
});

test("category filter combines with use-case scope", () => {
  const parsed = parseUseCases(source);
  const agents = useCaseById(parsed, "build-ai-agents");
  const ids = new Set(resolveUseCaseTools(agents, toolById).map((t) => t.id));
  const filtered = filterCatalogTools(tools, { allowedIds: ids, category: "orchestration" });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((t) => ids.has(t.id) && t.category === "orchestration"));
});

test("sorting still works within a scoped use case and keeps membership", () => {
  const parsed = parseUseCases(source);
  const terminal = useCaseById(parsed, "terminal-ai");
  const members = resolveUseCaseTools(terminal, toolById);
  const sorted = sortCatalogTools(members, "name");
  const names = sorted.map((t) => t.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  for (const t of sorted) assert.ok(terminal.toolIds.includes(t.id));
});

test("shared allowedIds scoping still confines My Stack and Collections search", () => {
  const stackIds = new Set(["opencode", "openrouter"]);
  const stackRes = engine.search("claude", { allowedIds: stackIds });
  assert.ok(stackRes.tools.every((t) => stackIds.has(t.id)));
  const collRes = engine.search("opencode", { allowedIds: new Set(["opencode", "windsurf"]) });
  assert.deepEqual(collRes.tools.map((t) => t.id), ["opencode"]);
  assert.equal(engine.search("groq", { allowedIds: new Set(["opencode", "openrouter"]) }).tools.length, 0);
});

test("favorites still combine with ranked search", () => {
  const result = engine.search("opencode", { favoritesOnly: true, favoriteIds: new Set(["opencode"]) });
  assert.deepEqual(result.tools.map((t) => t.id), ["opencode"]);
});