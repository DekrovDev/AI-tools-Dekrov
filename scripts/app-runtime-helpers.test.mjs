import assert from "node:assert/strict";
import test from "node:test";
import { parseRouteHash, readOptionalJson, requiredResponsesAreOk } from "../assets/js/app-runtime-helpers.js";

test("route parser keeps exact stack matching and safely decodes valid routes", () => {
  assert.deepEqual(parseRouteHash("#/stack"), { type: "stack" });
  assert.equal(parseRouteHash("#/stackfoo"), null);
  assert.deepEqual(parseRouteHash("#/tools/google-adk"), { type: "tool", id: "google-adk" });
  assert.deepEqual(parseRouteHash("#/category/coding-agents"), { type: "category", id: "coding-agents" });
  assert.deepEqual(parseRouteHash("#/use-cases/vscode-ai"), { type: "use-case", id: "vscode-ai" });
  assert.deepEqual(parseRouteHash("#/collections/my%20tools"), { type: "collection", id: "my tools" });
});

test("malformed route encoding fails safely without throwing", () => {
  assert.doesNotThrow(() => parseRouteHash("#/tools/%E0%A4%A"));
  assert.deepEqual(parseRouteHash("#/tools/%E0%A4%A"), { type: "tool", id: "" });
  assert.doesNotThrow(() => parseRouteHash("#/category/%"));
  assert.doesNotThrow(() => parseRouteHash("#/use-cases/%ZZ"));
  assert.doesNotThrow(() => parseRouteHash("#/collections/%"));
});

const response = (value, ok = true) => ({ ok, json: async () => value });

test("optional auxiliary JSON loads valid use-case and Start Here data", async () => {
  assert.deepEqual(await readOptionalJson(response({ useCases: true })), { useCases: true });
  assert.deepEqual(await readOptionalJson(response({ startHere: true })), { startHere: true });
});

test("optional auxiliary JSON failures disable only optional features", async () => {
  assert.equal(await readOptionalJson(null), null);
  assert.equal(await readOptionalJson(response({}, false)), null);
  assert.equal(await readOptionalJson({ ok: true, json: async () => { throw new Error("bad json"); } }), null);
});

test("required catalog responses remain critical", () => {
  assert.equal(requiredResponsesAreOk([response({}), response({}), response({})]), true);
  assert.equal(requiredResponsesAreOk([response({}), response({}, false), response({})]), false);
  assert.equal(requiredResponsesAreOk([response({}), null, response({})]), false);
});
