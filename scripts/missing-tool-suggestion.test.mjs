import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createCatalogSearch, parseCatalogQuery } from "../assets/js/search-engine.js";
import { MAX_MISSING_TOOL_QUERY_LENGTH, SHARED_IDENTITY_HOSTS, existingToolMatchesUrl, isSuggestibleMissingToolQuery, matchingToolsForUrl, missingToolPrefill, normalizeMissingToolQuery, shouldOfferMissingToolSuggestion } from "../assets/js/missing-tool-suggestion.js";

const tools = JSON.parse(await readFile(new URL("../data/tools.json", import.meta.url), "utf8"));
const engine = createCatalogSearch(tools);
const unknownName = "SomeNewAgent";
const offer = (query, options = {}) => shouldOfferMissingToolSuggestion({
  query,
  parsed: parseCatalogQuery(query),
  globalMatchCount: engine.search(query).tools.length,
  isNormalCatalog: true,
  tools,
  ...options
});

test("empty, whitespace, punctuation, and overlong queries are never suggestible", () => {
  for (const query of ["", "   ", "!!! ---", "A", "x".repeat(MAX_MISSING_TOOL_QUERY_LENGTH + 1)]) assert.equal(offer(query), false, query || "empty");
  assert.equal(normalizeMissingToolQuery("  OpenHands\n  Agent  "), "OpenHands Agent");
});

test("a meaningful unknown name in the normal catalog offers a manual suggestion", () => {
  assert.equal(offer(unknownName), true);
  assert.deepEqual(missingToolPrefill(unknownName), { mode: "manual", name: unknownName });
});

test("global catalog matches prevent a suggestion even when current filters or allowedIds hide the tool", () => {
  assert.ok(engine.search("Aider").tools.some((tool) => tool.id === "aider"));
  assert.deepEqual(engine.search("Aider", { pricing: "paid" }).tools, []);
  assert.deepEqual(engine.search("Aider", { allowedIds: new Set() }).tools, []);
  assert.equal(offer("Aider", { globalMatchCount: engine.search("Aider").tools.length }), false);
});

test("scoped catalog views never offer a missing-tool suggestion", () => {
  for (const scope of ["favorites", "stack", "collection", "use-case", "shared", "start"]) {
    assert.equal(offer(unknownName, { isNormalCatalog: false }), false, scope);
  }
});

test("filter-only and explicit filter-syntax searches never offer a suggestion", () => {
  assert.equal(parseCatalogQuery("free").text, "");
  for (const query of ["free", "local", "cloud", "hybrid", "no signup", "no api key"]) assert.equal(offer(query), false, query);
  assert.equal(isSuggestibleMissingToolQuery("LocalAI", parseCatalogQuery("LocalAI")), true);
  assert.equal(isSuggestibleMissingToolQuery("category: coding-agents", parseCatalogQuery("category: coding-agents")), false);
});

test("an unknown official URL uses Smart Add, while known catalog identities are protected", () => {
  const unknownUrl = "https://some-unknown-tool.example/";
  assert.equal(offer(unknownUrl), true);
  assert.deepEqual(missingToolPrefill(unknownUrl), { mode: "smart", url: unknownUrl });
  assert.equal(existingToolMatchesUrl("https://aider.chat/docs/", tools), true);
  assert.deepEqual(matchingToolsForUrl("https://aider.chat/docs/", tools).map((tool) => tool.id), ["aider"]);
  assert.equal(offer("https://aider.chat/docs/", { globalMatchCount: 0 }), false);
});

test("shared hosts require the same project path or a subpath", () => {
  const fixtures = [
    { id: "aider-github", url: "https://github.com/Aider-AI/aider" },
    { id: "hf-model", url: "https://huggingface.co/org/model" }
  ];
  assert.deepEqual([...SHARED_IDENTITY_HOSTS], ["github.com", "gitlab.com", "huggingface.co", "vercel.app", "github.io"]);
  assert.equal(existingToolMatchesUrl("https://github.com/Aider-AI/aider/blob/main/README.md", fixtures), true);
  assert.equal(existingToolMatchesUrl("https://github.com/unrelated-project", fixtures), false);
  assert.equal(existingToolMatchesUrl("https://huggingface.co/org/model/tree/main", fixtures), true);
  assert.equal(existingToolMatchesUrl("https://huggingface.co/another/model", fixtures), false);
});

test("the UI assigns hostile query text with textContent instead of HTML insertion", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const markup = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const hostile = '"><script>alert(1)</script>';
  assert.equal(missingToolPrefill(hostile)?.name, hostile);
  assert.match(source, /missing-tool-query"\)\.textContent = missingPrefill\.name/);
  assert.doesNotMatch(source, /missing-tool-query"\)\.innerHTML/);
  assert.match(markup, /id="missing-tool-query"/);
});
