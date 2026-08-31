import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_SHARED_IDS,
  MAX_TOKEN_LENGTH,
  SHARED_VERSION,
  availableSharedName,
  createSharedCollectionPayload,
  decodeSharedCollection,
  encodeSharedCollection,
  importSharedCollection,
  normalizeSharedCollection,
  resolveSharedToolIds,
  sharedCollectionUrl,
  sharedFailureMessage
} from "../assets/js/shared-collections.js";
import { MAX_COLLECTION_NAME } from "../assets/js/saved-library.js";

const catalog = JSON.parse(readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));
const knownIds = new Set(catalog.map((tool) => tool.id));
const baseCollection = {
  id: "local-id-here",
  name: "Coding",
  toolIds: ["aider", "cline"],
  createdAt: "2020-01-01T00:00:00Z",
  updatedAt: "2020-01-01T00:00:00Z"
};

function escaped(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- codec ----------

test("valid shared collection round-trips through encode/decode", () => {
  const token = encodeSharedCollection(baseCollection);
  const decoded = decodeSharedCollection(token);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.payload, { v: SHARED_VERSION, name: "Coding", toolIds: ["aider", "cline"] });
});

test("encoding is deterministic for the same normalized input", () => {
  const a = encodeSharedCollection(baseCollection);
  const b = encodeSharedCollection({ ...baseCollection, id: "different", createdAt: "x", updatedAt: "y" });
  assert.equal(a, b);
  assert.equal(encodeSharedCollection(baseCollection), a);
});

test("Unicode name round-trips exactly", () => {
  const name = "ИИ для кода 🚀";
  const decoded = decodeSharedCollection(encodeSharedCollection({ ...baseCollection, name }));
  assert.equal(decoded.ok, true);
  assert.equal(decoded.payload.name, name);
});

test("special-character name round-trips and is HTML-escaped at render", () => {
  const name = 'Ampers& / slash <angle> "quotes"';
  const decoded = decodeSharedCollection(encodeSharedCollection({ ...baseCollection, name }));
  assert.equal(decoded.ok, true);
  assert.equal(decoded.payload.name, name);
  assert.doesNotMatch(escaped(name), /<[a-zA-Z]/); // ampersand/slash/angle brackets render inert
});

test("malicious HTML collection name stays plain data, never markup", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const decoded = decodeSharedCollection(encodeSharedCollection({ ...baseCollection, name: evil }));
  assert.equal(decoded.ok, true);
  assert.equal(decoded.payload.name, evil);
  assert.doesNotMatch(escaped(decoded.payload.name), /<[a-zA-Z]/); // no active tag can render
});

test("payload contains only version, name and toolIds", () => {
  const payload = createSharedCollectionPayload(baseCollection);
  assert.deepEqual(Object.keys(payload).sort(), ["name", "toolIds", "v"]);
});

test("local id and timestamps are excluded from the payload and therefore the token", () => {
  const payload = createSharedCollectionPayload(baseCollection);
  assert.equal("id" in payload, false);
  assert.equal("createdAt" in payload, false);
  assert.equal("updatedAt" in payload, false);
  assert.equal(encodeSharedCollection({ ...baseCollection, id: "zz", createdAt: "now", updatedAt: "later" }), encodeSharedCollection(baseCollection));
});

test("duplicate tool IDs normalize to deduplicated order-preserving list", () => {
  const decoded = decodeSharedCollection(encodeSharedCollection({ ...baseCollection, toolIds: ["aider", "aider", "cline", "aider"] }));
  assert.deepEqual(decoded.payload.toolIds, ["aider", "cline"]);
});

test("malformed base64 token is rejected safely", () => {
  assert.deepEqual(decodeSharedCollection("!!!not-base64!!!"), { ok: false, reason: "malformed" });
  assert.deepEqual(decodeSharedCollection("abc_%%%"), { ok: false, reason: "malformed" });
});

test("invalid JSON payload is rejected safely", () => {
  // "eyJ" ... is base64 of printable text that is not a valid JSON object shape.
  const junk = Buffer.from("{not valid json").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(decodeSharedCollection(junk).ok, false);
});

test("unsupported version is rejected with a specific reason", () => {
  const payload = createSharedCollectionPayload(baseCollection);
  const future = btoa(JSON.stringify({ ...payload, v: 2 }));
  const token = future.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.deepEqual(decodeSharedCollection(token), { ok: false, reason: "unsupported-version" });
});

test("missing name is rejected", () => {
  assert.equal(normalizeSharedCollection({ v: 1, name: "", toolIds: ["aider"] }), null);
  assert.equal(normalizeSharedCollection({ v: 1, name: "   ", toolIds: ["aider"] }), null);
});

test("non-array toolIds is rejected", () => {
  assert.equal(normalizeSharedCollection({ v: 1, name: "Coding", toolIds: "aider" }), null);
  assert.equal(decodeSharedCollection(encodeSharedCollection({ ...baseCollection })).ok, true);
});

test("nested/object/invalid tool IDs are dropped, valid strings kept", () => {
  const decoded = decodeSharedCollection(encodeSharedCollection({ ...baseCollection, toolIds: ["aider", { id: "x" }, ["cline"], "", "UPPER?bad!"] }));
  assert.deepEqual(decoded.payload.toolIds, ["aider"]);
});

test("oversized token is rejected before decoding", () => {
  const big = "A".repeat(MAX_TOKEN_LENGTH + 1);
  assert.deepEqual(decodeSharedCollection(big), { ok: false, reason: "oversized" });
});

test("excessive tool count is bounded", () => {
  const ids = Array.from({ length: MAX_SHARED_IDS + 50 }, (_, i) => `tool${i}`);
  const payload = createSharedCollectionPayload({ ...baseCollection, toolIds: ids });
  assert.equal(payload.toolIds.length, MAX_SHARED_IDS);
});

test("invalid tool ID format is rejected (kept out of payload)", () => {
  assert.deepEqual(createSharedCollectionPayload({ ...baseCollection, toolIds: ["aider", "with space", "UPPER"] }).toolIds, ["aider"]);
});

test("every real catalog ID passes the validator and can be shared", () => {
  const decoded = decodeSharedCollection(encodeSharedCollection({ ...baseCollection, toolIds: catalog.map((tool) => tool.id) }));
  assert.equal(decoded.ok, true);
  assert.equal(decoded.payload.toolIds.length, catalog.length);
});

test("unknown tool IDs resolve safely and known order is preserved", () => {
  const payload = createSharedCollectionPayload({ ...baseCollection, toolIds: ["aider", "ghost-tool", "cline", "nope"] });
  const resolved = resolveSharedToolIds(payload, knownIds);
  assert.deepEqual(resolved.knownIds, ["aider", "cline"]);
  assert.equal(resolved.missingCount, 2);
});

test("canonical URL uses the supplied origin/path and carries no filters", () => {
  const url = sharedCollectionUrl(baseCollection, { origin: "https://ai.dekrov.com", pathname: "/tools/" });
  assert.ok(url.startsWith("https://ai.dekrov.com/tools/#/shared/"));
  assert.equal(url.includes("filter"), false);
  assert.equal(url.includes("?q"), false);
  assert.match(url, /#\/shared\/[A-Za-z0-9_-]+$/);
});

test("names truncated to the collection-name maximum", () => {
  const long = "x".repeat(200);
  const decoded = decodeSharedCollection(encodeSharedCollection({ ...baseCollection, name: long }));
  assert.equal(decoded.payload.name.length, MAX_COLLECTION_NAME);
});

// ---------- import / naming ----------

test("import creates a fresh local id and local timestamps, not the shared ones", () => {
  const existing = [{ id: "mine", name: "Work", toolIds: ["cline"], createdAt: "2020", updatedAt: "2020" }];
  const payload = createSharedCollectionPayload(baseCollection);
  const result = importSharedCollection(existing, payload, knownIds);
  assert.ok(result);
  assert.notEqual(result.collection.id, "local-id-here");
  assert.ok(result.collection.id);
  assert.deepEqual(result.collection.toolIds, ["aider", "cline"]);
  assert.match(result.collection.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(result.collection.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(result.collections.length, 2);
});

test("only known IDs are imported, order preserved", () => {
  const payload = createSharedCollectionPayload({ ...baseCollection, toolIds: ["aider", "ghost", "cline"] });
  const result = importSharedCollection([], payload, knownIds);
  assert.deepEqual(result.collection.toolIds, ["aider", "cline"]);
});

test("duplicate-safe name generation is deterministic and never overwrites", () => {
  const names = ["Coding"];
  assert.equal(availableSharedName(names, "Coding"), "Coding (shared)");
  assert.equal(availableSharedName(["Coding", "Coding (shared)"], "Coding"), "Coding (shared 2)");
  assert.equal(availableSharedName(["Coding", "Coding (shared)", "Coding (shared 2)"], "Coding"), "Coding (shared 3)");
});

test("same-name local collection is not overwritten on import", () => {
  const existing = [{ id: "a", name: "Coding", toolIds: [], createdAt: "x", updatedAt: "x" }];
  const payload = createSharedCollectionPayload(baseCollection);
  const result = importSharedCollection(existing, payload, knownIds);
  assert.equal(result.collections.length, 2);
  assert.equal(result.collection.name, "Coding (shared)");
  assert.equal(result.collections[0].name, "Coding");
});

test("reserved My Stack collision is handled without using the reserved name", () => {
  const payload = createSharedCollectionPayload({ ...baseCollection, name: "My Stack" });
  const result = importSharedCollection([], payload, knownIds);
  assert.ok(result);
  assert.notEqual(result.collection.name.toLowerCase(), "my stack");
  assert.ok(result.collection.name.startsWith("My Stack "));
});

test("importing an empty resolved shared collection is rejected", () => {
  const payload = createSharedCollectionPayload({ ...baseCollection, toolIds: ["ghost-one", "ghost-two"] });
  assert.equal(importSharedCollection([], payload, knownIds), null);
});

test("duplicate-safe name is bounded to the maximum collection-name length", () => {
  const base = "x".repeat(MAX_COLLECTION_NAME);
  const name = availableSharedName([base], base);
  assert.ok(name.length <= MAX_COLLECTION_NAME);
  assert.ok(name);
});

test("decoder never throws on adversarial input", () => {
  const inputs = ["", "%", "#/", "=", "a".repeat(30000), "\u0000", "й", "-__--", "AAAA==", "ab c+_"];
  for (const input of inputs) {
    assert.doesNotThrow(() => decodeSharedCollection(input));
  }
  assert.equal(typeof sharedFailureMessage("unsupported-version"), "string");
});