import assert from "node:assert/strict";
import test from "node:test";
import { countKnownRefs, DEV_REF_PREFIX, entityRef, entityRefParts, isDevRef, isToolRef, KIND_DEV, KIND_TOOLS, refsOfKind, splitKnownRefs } from "../assets/js/entity-ids.js";

test("entity refs keep tools bare and dev resources prefixed", () => {
  assert.equal(entityRef(KIND_TOOLS, "aider"), "aider");
  assert.equal(entityRef(KIND_DEV, "uiverse"), `${DEV_REF_PREFIX}uiverse`);
});

test("parts parse both stored forms back correctly", () => {
  assert.deepEqual(entityRefParts("aider"), { kind: KIND_TOOLS, id: "aider" });
  assert.deepEqual(entityRefParts("dev:uiverse"), { kind: KIND_DEV, id: "uiverse" });
  assert.deepEqual(entityRefParts(""), { kind: KIND_TOOLS, id: "" });
});

test("kind predicates never collide because tool ids are kebab-only", () => {
  assert.ok(isToolRef("aider"));
  assert.ok(isDevRef("dev:uiverse"));
  assert.ok(!isDevRef("aider"));
  assert.ok(!isToolRef("dev:uiverse"));
});

test("refsOfKind filters mixed refs", () => {
  const refs = ["aider", "dev:uiverse", "cline", "dev:json-formatter"];
  assert.deepEqual(refsOfKind(refs, KIND_TOOLS), ["aider", "cline"]);
  assert.deepEqual(refsOfKind(refs, KIND_DEV), ["dev:uiverse", "dev:json-formatter"]);
});

test("splitKnownRefs reports known and missing per kind", () => {
  const refs = ["aider", "dev:uiverse", "dev:missing", "ghost"];
  const { known, missing } = splitKnownRefs(refs, ["aider"], ["uiverse"]);
  assert.deepEqual(known, ["aider", "dev:uiverse"]);
  assert.deepEqual(missing, ["dev:missing", "ghost"]);
});

test("countKnownRefs counts per kind", () => {
  const refs = ["aider", "dev:uiverse", "dev:icons", "ghost"];
  assert.equal(countKnownRefs(refs, KIND_TOOLS, ["aider"], ["uiverse", "icons"]), 1);
  assert.equal(countKnownRefs(refs, KIND_DEV, ["aider"], ["uiverse", "icons"]), 2);
  assert.equal(countKnownRefs([], KIND_DEV, [], []), 0);
});

test("storage without dev data behaves exactly like today (bare ids only)", () => {
  const toolRefs = ["aider", "cline", "aider"];
  assert.deepEqual(refsOfKind(toolRefs, KIND_TOOLS), ["aider", "cline", "aider"]);
  assert.deepEqual(refsOfKind(toolRefs, KIND_DEV), []);
});
