import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createCatalogSearch, filterCatalogTools, parseCatalogQuery, toSearchDocument } from "../assets/js/search-engine.js";

const tools = JSON.parse(await readFile(new URL("../data/tools.json", import.meta.url), "utf8"));
const engine = createCatalogSearch(tools);

function tool(overrides = {}) {
  return {
    id: "sample",
    name: "Sample",
    category: "other",
    description: "",
    bestFor: [],
    strengths: [],
    gettingStarted: [],
    usageNotes: [],
    platforms: [],
    pricing: "free",
    tags: [],
    models: [],
    addedAt: "2026-01-01",
    ...overrides
  };
}

test("exact tool-name search ranks Cline first", () => {
  assert.equal(engine.search("cline").tools[0]?.id, "cline");
});

test("a conservative typo pass recovers clnie as Cline", () => {
  assert.equal(engine.search("clnie").tools[0]?.id, "cline");
});

test("prefix search finds OpenHands", () => {
  assert.equal(engine.search("openha").tools[0]?.id, "openhands");
});

test("multi-word cli claude search applies the CLI filter and model text", () => {
  const result = engine.search("cli claude");
  assert.deepEqual(result.parsed.filters.platforms, ["cli"]);
  assert.ok(result.tools.length > 0);
  assert.ok(result.tools.every((item) => item.platforms.includes("cli")));
  assert.ok(result.tools.some((item) => item.models.some((model) => /claude/i.test(model))));
});

test("pricing and coding-agent intent are extracted", () => {
  const parsed = parseCatalogQuery("free coding agent");
  assert.deepEqual(parsed.filters.pricing, ["free"]);
  assert.deepEqual(parsed.filters.categories, ["coding-agents"]);
  assert.equal(parsed.text, "");
});

test("freemium remains distinct from free", () => {
  assert.deepEqual(parseCatalogQuery("freemium agent").filters.pricing, ["freemium"]);
  assert.deepEqual(parseCatalogQuery("free agent").filters.pricing, ["free"]);
});

test("terminal is recognized as the CLI platform", () => {
  assert.deepEqual(parseCatalogQuery("terminal agent").filters.platforms, ["cli"]);
});

test("Visual Studio Code is recognized as the VS Code platform", () => {
  const parsed = parseCatalogQuery("visual studio code agent");
  assert.deepEqual(parsed.filters.platforms, ["vscode"]);
  assert.deepEqual(parsed.filters.categories, ["coding-agents"]);
});

test("multi agent framework is recognized as orchestration", () => {
  assert.deepEqual(parseCatalogQuery("multi agent framework").filters.categories, ["orchestration"]);
});

test("open-source and self-hosted concepts become conservative filters", () => {
  assert.deepEqual(parseCatalogQuery("open source agent").filters.concepts, ["open-source"]);
  assert.deepEqual(parseCatalogQuery("self hosted").filters.concepts, ["self-hosted"]);
  assert.ok(!engine.search("open source agent").tools.some((item) => item.id === "amp"));
  assert.ok(engine.search("open source agent").tools.every((item) => /open[\s-]+source/i.test([item.description, ...(item.tags || []), ...(item.strengths || []), ...(item.usageNotes || [])].join(" "))));
});

test("model names are searchable from the real catalog", () => {
  const result = engine.search("claude");
  assert.ok(result.tools.length > 0);
  assert.ok(result.tools.slice(0, 5).some((item) => item.models.some((model) => /claude/i.test(model))));
});

test("name matches rank above incidental description matches", () => {
  const local = createCatalogSearch([
    tool({ id: "name-match", name: "Nebula" }),
    tool({ id: "description-match", name: "Other", description: "Nebula is mentioned once in a long incidental description." })
  ]);
  assert.equal(local.search("nebula").tools[0]?.id, "name-match");
});

test("model-field matches rank above incidental usage-note matches", () => {
  const local = createCatalogSearch([
    tool({ id: "model-match", name: "Model Tool", models: ["Claude"] }),
    tool({ id: "note-match", name: "Notes Tool", usageNotes: ["This can incidentally connect to Claude in one workflow."] })
  ]);
  assert.equal(local.search("claude").tools[0]?.id, "model-match");
});

test("UI filters combine with query-derived filters", () => {
  const result = engine.search("claude", { category: "coding-agents", pricing: "free", platform: "cli" });
  assert.ok(result.tools.length > 0);
  assert.ok(result.tools.every((item) => item.category === "coding-agents" && item.pricing === "free" && item.platforms.includes("cli")));
});

test("conflicting UI and query-derived filters return no results", () => {
  assert.deepEqual(engine.search("free coding agent", { pricing: "paid" }).tools, []);
});

test("short tokens do not receive absurd fuzzy matches", () => {
  const local = createCatalogSearch([tool({ id: "amp", name: "Amp" })]);
  assert.deepEqual(local.search("anp").tools, []);
});

test("an empty query preserves source catalog membership and order", () => {
  const result = engine.search("");
  assert.equal(result.queryActive, false);
  assert.deepEqual(result.tools.map((item) => item.id), tools.map((item) => item.id));
});

test("no-results searches return cleanly", () => {
  const result = engine.search("term-that-does-not-exist-anywhere");
  assert.deepEqual(result.tools, []);
  assert.ok(["strict", "fallback"].includes(result.phase));
});

test("favorites can be combined with ranked search", () => {
  const result = engine.search("claude", { favoritesOnly: true, favoriteIds: new Set(["cline"]) });
  assert.deepEqual(result.tools.map((item) => item.id), ["cline"]);
});

test("existing category, pricing, and platform filtering remains exact", () => {
  const filtered = filterCatalogTools(tools, { category: "coding-agents", pricing: "free", platform: "vscode" });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((item) => item.category === "coding-agents" && item.pricing === "free" && item.platforms.includes("vscode")));
});

test("tools with empty optional arrays are safe to index", () => {
  const document = toSearchDocument(tool({ models: [], tags: [], platforms: [], bestFor: [], strengths: [], gettingStarted: [], usageNotes: [] }));
  assert.deepEqual(document.models, []);
  assert.doesNotThrow(() => createCatalogSearch([document]));
});

test("special characters are normalized without creating HTML", () => {
  const parsed = parseCatalogQuery('<img src=x onerror="alert(1)">');
  assert.doesNotMatch(parsed.text, /[<>]/);
  assert.doesNotThrow(() => engine.search(parsed.raw));
});

test("the unchanged hash route still resolves tool detail IDs", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(source, /location\.hash\.match\(\/\^#\\\/tools\\\//);
  assert.match(source, /renderDetail\(detailId\)/);
});

test("alternative-to intent uses catalog evidence rather than hard-coded tool names", () => {
  assert.equal(engine.search("free alternative to cursor").tools[0]?.id, "cline");
});
