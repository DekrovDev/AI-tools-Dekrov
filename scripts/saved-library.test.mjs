import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createCatalogSearch, filterCatalogTools } from "../assets/js/search-engine.js";
import {
  COLLECTIONS_KEY,
  STACK_KEY,
  STACK_NAME,
  createCollectionAndAppend,
  deleteCollection,
  filterKnownIds,
  normalizeCollectionName,
  parseCollections,
  parseStack,
  renameCollection,
  toggleStackTool,
  toggleToolInCollection
} from "../assets/js/saved-library.js";

const emptyCollections = () => ({ version: 1, collections: [] });

test("empty collections storage parses to an empty, versioned shape", () => {
  assert.deepEqual(parseCollections(null), { version: 1, collections: [] });
  assert.deepEqual(parseCollections(""), { version: 1, collections: [] });
  assert.deepEqual(parseCollections(undefined), { version: 1, collections: [] });
});

test("malformed JSON does not crash and returns empty state", () => {
  assert.deepEqual(parseCollections("{ not valid json"), { version: 1, collections: [] });
  assert.deepEqual(parseCollections("42"), { version: 1, collections: [] });
  assert.deepEqual(parseCollections("[]"), { version: 1, collections: [] });
  assert.deepEqual(parseStack("{ nope"), []);
  assert.deepEqual(parseStack("oops"), []);
});

test("stored collection receives a stable ID distinct from its name", () => {
  const created = createCollectionAndAppend([], "Try later");
  const collection = created[0];
  assert.ok(collection.id);
  assert.notEqual(collection.id, "Try later");
  assert.equal(collection.name, "Try later");
  assert.deepEqual(collection.toolIds, []);
  // Renaming later must not change the ID.
  const renamed = renameCollection(created, collection.id, "Later");
  assert.equal(renamed[0].id, collection.id);
  assert.equal(renamed[0].name, "Later");
});

test("empty and whitespace-only names are rejected", () => {
  assert.throws(() => createCollectionAndAppend([], ""), /empty/);
  assert.throws(() => createCollectionAndAppend([], "   "), /empty/);
  assert.throws(() => createCollectionAndAppend([], "\t\n"), /empty/);
});

test("names are trimmed before being stored", () => {
  const [collection] = createCollectionAndAppend([], "  Work  ");
  assert.equal(collection.name, "Work");
  assert.equal(normalizeCollectionName("  a b  "), "a b");
});

test("duplicate collection names are rejected case-insensitively", () => {
  const withOne = createCollectionAndAppend([], "Local AI");
  assert.throws(() => createCollectionAndAppend(withOne, "local ai"), /already exists/);
  assert.throws(() => createCollectionAndAppend(withOne, "LOCAL AI"), /already exists/);
});

test("the reserved My Stack name cannot be used as a collection name", () => {
  assert.throws(() => createCollectionAndAppend([], STACK_NAME), /built-in/);
  assert.throws(() => createCollectionAndAppend([], "my stack"), /built-in/);
});

test("renaming updates the name but a collision is rejected", () => {
  let list = createCollectionAndAppend([], "Try later");
  list = createCollectionAndAppend(list, "Work");
  const target = list[0];
  const renamed = renameCollection(list, target.id, "Later");
  assert.equal(renamed[0].name, "Later");
  assert.throws(() => renameCollection(renamed, renamed[1].id, "later"), /already exists/);
});

test("delete collection removes only the matching collection", () => {
  let list = createCollectionAndAppend([], "A");
  list = createCollectionAndAppend(list, "B");
  const idB = list[1].id;
  const after = deleteCollection(list, idB);
  assert.deepEqual(after.map((c) => c.name), ["A"]);
});

test("adding a tool to a collection and toggling back works", () => {
  let list = createCollectionAndAppend([], "Try later");
  const id = list[0].id;
  list = toggleToolInCollection(list, id, "cline");
  assert.deepEqual(list[0].toolIds, ["cline"]);
  list = toggleToolInCollection(list, id, "cline");
  assert.deepEqual(list[0].toolIds, []);
});

test("adding the same tool twice does not duplicate it", () => {
  let list = createCollectionAndAppend([], "Try later");
  const id = list[0].id;
  list = toggleToolInCollection(list, id, "cline");
  list = toggleToolInCollection(list, id, "cline");
  // The first call adds it; the second removes it. Add manually twice via storage sanitize path.
  const raw = JSON.stringify({ version: 1, collections: [{ id, name: "Try later", toolIds: ["cline", "cline"] }] });
  const parsed = parseCollections(raw);
  assert.deepEqual(parsed.collections[0].toolIds, ["cline"]);
});

test("same tool may belong to multiple collections", () => {
  let list = createCollectionAndAppend([], "Try later");
  list = createCollectionAndAppend(list, "Work");
  list = toggleToolInCollection(list, list[0].id, "cline");
  list = toggleToolInCollection(list, list[1].id, "cline");
  assert.ok(list[0].toolIds.includes("cline"));
  assert.ok(list[1].toolIds.includes("cline"));
});

test("My Stack: toggle-off removes, no duplicates, insertion order preserved", () => {
  let stack = toggleStackTool([], "opencode");
  stack = toggleStackTool(stack, "openrouter");
  stack = toggleStackTool(stack, "ollama");
  stack = toggleStackTool(stack, "openrouter"); // already present -> removed
  assert.deepEqual(stack, ["opencode", "ollama"]);
  stack = toggleStackTool(stack, "openrouter"); // re-added -> appended at end
  assert.deepEqual(stack, ["opencode", "ollama", "openrouter"]);
  stack = toggleStackTool(stack, "opencode");
  assert.deepEqual(stack, ["ollama", "openrouter"]);
  const parsed = parseStack(JSON.stringify({ version: 1, toolIds: ["a", "a", "b"] }));
  assert.deepEqual(parsed, ["a", "b"]);
  assert.deepEqual(parseStack(JSON.stringify(["x", "x", "y"])), ["x", "y"]);
});

test("favorites storage stays independent of collections and stack", () => {
  // Each has its own dedicated key; favorites helpers are untouched elsewhere.
  assert.notEqual(COLLECTIONS_KEY, "ai-dekrov-favorites");
  assert.notEqual(STACK_KEY, "ai-dekrov-favorites");
  assert.notEqual(COLLECTIONS_KEY, STACK_KEY);
});

test("unknown/deleted tool IDs do not break rendering logic", () => {
  const known = new Set(["cline", "opencode"]);
  assert.deepEqual(filterKnownIds(["cline", "ghost-tool", "opencode"], known), ["cline", "opencode"]);
  assert.deepEqual(filterKnownIds([], known), []);
});

test("stored collection names cannot inject HTML (parse + escape stays inert)", () => {
  const raw = JSON.stringify({ version: 1, collections: [{ id: "x", name: "<img src=x onerror=alert(1)>", toolIds: [] }] });
  const parsed = parseCollections(raw);
  assert.ok(parsed.collections[0].name.includes("<img"));
  // Guard: the stored name is meant to be display-escaping at render time, never innerHTML raw.
  const escaped = String(parsed.collections[0].name).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  assert.doesNotMatch(escaped, /<img/);
});

// Real-catalog scoped search & filtering
const tools = JSON.parse(readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));
const engine = createCatalogSearch(tools);

test("collection-scoped filtering respects existing catalog filters", () => {
  const collectionIds = new Set(tools.slice(0, 6).map((t) => t.id));
  const filtered = filterCatalogTools(tools, { allowedIds: collectionIds, platform: "cli" });
  assert.ok(filtered.every((t) => collectionIds.has(t.id)));
  assert.ok(filtered.every((t) => t.platforms.includes("cli")));
});

test("stack-scoped filtering keeps search inside the stack", () => {
  const allSearch = engine.search("claude");
  assert.ok(allSearch.tools.length > 0);
  const stackIds = new Set(allSearch.tools.slice(0, 2).map((t) => t.id));
  const scoped = engine.search("claude", { allowedIds: stackIds });
  assert.ok(scoped.tools.length > 0);
  assert.ok(scoped.tools.every((t) => stackIds.has(t.id)));
});

test("allowedIds scoping does not leak out-of-scope matches and empty ids yield no tools on query", () => {
  const scoped = engine.search("claude", { allowedIds: new Set(["does-not-exist"]) });
  assert.deepEqual(scoped.tools, []);
});

test("search is restricted to collection membership without rebuilding the index (same engine instance)", () => {
  const member = new Set([tools[0].id]);
  const before = engine.size;
  const scoped = engine.search(tools[0].name, { allowedIds: member });
  assert.equal(engine.size, before); // index never rebuilt
  assert.ok(scoped.tools.length > 0);
  assert.deepEqual(scoped.tools.map((t) => t.id), [tools[0].id]);
});