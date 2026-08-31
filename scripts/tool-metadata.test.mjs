import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateTool } from "../.github/scripts/submission-lib.mjs";
import { applyApprovedSubmission } from "../.github/scripts/apply-submission-lib.mjs";
import { buildAnalysisComment, buildCanonicalBody } from "./smart-add.mjs";

const schema = JSON.parse(await readFile(new URL("../data/tool-schema.json", import.meta.url), "utf8"));
const catalog = JSON.parse(await readFile(new URL("../data/tools.json", import.meta.url), "utf8"));

function rawTool(overrides = {}) {
  return {
    id: "sample-tool",
    name: "Sample Tool",
    category: "dev-tools",
    description: "A sample tool.",
    bestFor: [],
    strengths: [],
    gettingStarted: [],
    usageNotes: [],
    url: "https://example.com/",
    domain: "example.com",
    favicon: "",
    platforms: ["web"],
    executionMode: "unknown",
    signupRequirement: "unknown",
    apiKeyRequirement: "unknown",
    pricing: "free",
    priceDetails: "",
    tags: [],
    install: "",
    start: "",
    commands: [],
    models: [],
    github: "",
    docs: "",
    ...overrides
  };
}

test("metadata schema exposes the exact canonical enums", () => {
  assert.deepEqual(schema.properties.executionMode.enum, ["local", "cloud", "hybrid", "unknown"]);
  assert.deepEqual(schema.properties.signupRequirement.enum, ["required", "optional", "not-required", "depends", "unknown"]);
  assert.deepEqual(schema.properties.apiKeyRequirement.enum, ["required", "optional", "not-required", "depends", "unknown"]);
});

test("validator accepts every execution-mode enum", () => {
  for (const executionMode of schema.properties.executionMode.enum) {
    assert.deepEqual(validateTool(rawTool({ executionMode }), schema).errors, [], executionMode);
  }
});

test("validator accepts every signup-requirement enum", () => {
  for (const signupRequirement of schema.properties.signupRequirement.enum) {
    assert.deepEqual(validateTool(rawTool({ signupRequirement }), schema).errors, [], signupRequirement);
  }
});

test("validator accepts every API-key-requirement enum", () => {
  for (const apiKeyRequirement of schema.properties.apiKeyRequirement.enum) {
    assert.deepEqual(validateTool(rawTool({ apiKeyRequirement }), schema).errors, [], apiKeyRequirement);
  }
});

test("missing and empty metadata normalize to unknown for old submissions", () => {
  const old = rawTool();
  delete old.executionMode;
  old.signupRequirement = "";
  delete old.apiKeyRequirement;
  const checked = validateTool(old, schema);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.tool.executionMode, "unknown");
  assert.equal(checked.tool.signupRequirement, "unknown");
  assert.equal(checked.tool.apiKeyRequirement, "unknown");
});

test("invalid metadata strings are rejected", () => {
  for (const [key, value] of [["executionMode", "desktop"], ["signupRequirement", "no"], ["apiKeyRequirement", "oauth"]]) {
    const checked = validateTool(rawTool({ [key]: value }), schema);
    assert.ok(checked.errors.some((error) => error === `${key} is invalid.`), key);
    assert.equal(checked.tool, null);
  }
});

test("non-string metadata types are rejected", () => {
  for (const [key, value] of [["executionMode", true], ["signupRequirement", false], ["apiKeyRequirement", 1]]) {
    const checked = validateTool(rawTool({ [key]: value }), schema);
    assert.ok(checked.errors.some((error) => error === `${key} must be a string.`), key);
    assert.equal(checked.tool, null);
  }
});

test("Smart Add canonical body contains all three metadata fields", () => {
  const body = buildCanonicalBody(rawTool({ executionMode: "local", signupRequirement: "optional", apiKeyRequirement: "required" }), "");
  assert.match(body, /"executionMode": "local"/);
  assert.match(body, /"signupRequirement": "optional"/);
  assert.match(body, /"apiKeyRequirement": "required"/);
});

test("Smart Add analysis comment shows concise access metadata", () => {
  const comment = buildAnalysisComment({ tool: rawTool({ executionMode: "hybrid", signupRequirement: "required", apiKeyRequirement: "depends" }), warnings: [], duplicates: [], errors: [], pages: [], context: "" });
  assert.match(comment, /Execution: Hybrid/);
  assert.match(comment, /Signup: Required/);
  assert.match(comment, /API key: Depends/);
});

test("new approved submissions preserve normalized metadata in the catalog record", () => {
  const checked = validateTool(rawTool({ executionMode: "local", signupRequirement: "not-required", apiKeyRequirement: "optional" }), schema);
  const result = applyApprovedSubmission({ submission: { type: "new" }, checkedTool: checked.tool, tools: [], today: "2026-08-31" });
  assert.deepEqual({ executionMode: result.record.executionMode, signupRequirement: result.record.signupRequirement, apiKeyRequirement: result.record.apiKeyRequirement }, { executionMode: "local", signupRequirement: "not-required", apiKeyRequirement: "optional" });
  assert.equal(result.tools[0], result.record);
});

test("approved updates preserve changed metadata and existing generated fields", () => {
  const old = { ...rawTool({ executionMode: "cloud", signupRequirement: "required", apiKeyRequirement: "not-required" }), addedAt: "2026-01-01", updatedAt: "2026-01-01", lastVerifiedAt: "2026-01-02", sources: ["https://example.com/"] };
  const checked = validateTool(rawTool({ executionMode: "hybrid", signupRequirement: "optional", apiKeyRequirement: "depends" }), schema);
  const result = applyApprovedSubmission({ submission: { type: "update", existingToolId: old.id }, checkedTool: checked.tool, tools: [old], today: "2026-08-31" });
  assert.equal(result.record.executionMode, "hybrid");
  assert.equal(result.record.signupRequirement, "optional");
  assert.equal(result.record.apiKeyRequirement, "depends");
  assert.equal(result.record.addedAt, "2026-01-01");
});

test("every catalog tool has canonical metadata values", () => {
  for (const tool of catalog) {
    for (const key of ["executionMode", "signupRequirement", "apiKeyRequirement"]) {
      assert.ok(schema.properties[key].enum.includes(tool[key]), `${tool.id}.${key}`);
    }
  }
});
