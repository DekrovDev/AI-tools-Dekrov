import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCommandRecipeText,
  buildCommandSequence,
  buildEnvText,
  hasUnresolvedPlaceholders,
  listAvailableCommands,
  parseOptionalSetupRecipes,
  parseSetupRecipes,
  setupForTool
} from "../assets/js/setup-recipes.js";

const catalog = JSON.parse(readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));
const knownToolIds = new Set(catalog.map((tool) => tool.id));
const setupSource = JSON.parse(readFileSync(new URL("../data/setup-recipes.json", import.meta.url), "utf8"));

function envVar(overrides = {}) {
  return {
    name: "OPENAI_API_KEY",
    label: "OpenAI API key",
    description: "Key used for the selected provider.",
    requirement: "depends",
    secret: true,
    valueHint: "sk-...",
    source: "https://example.com/docs",
    ...overrides
  };
}

function commandRecipe(overrides = {}) {
  return {
    id: "run-with-model",
    label: "Run with model",
    description: "Build a verified model command.",
    template: "tool --model {{model}}",
    inputs: [{ key: "model", label: "Model", type: "text", required: true, placeholder: "provider/model" }],
    source: "https://example.com/docs",
    ...overrides
  };
}

function setupFile(setup = { envVars: [envVar()], commandRecipes: [] }) {
  return { version: 1, tools: { aider: setup } };
}

test("valid empty setup file and JSON string parse to version 1", () => {
  const empty = { version: 1, tools: {} };
  assert.deepEqual(parseSetupRecipes(empty, knownToolIds), empty);
  assert.deepEqual(parseSetupRecipes(JSON.stringify(empty), knownToolIds), empty);
});

test("valid tool setup resolves by tool ID and missing tools stay empty", () => {
  const parsed = parseSetupRecipes(setupFile(), knownToolIds);
  assert.equal(setupForTool(parsed, "aider").envVars[0].name, "OPENAI_API_KEY");
  assert.deepEqual(setupForTool(parsed, "windsurf"), { envVars: [], commandRecipes: [] });
});

test("unknown and deleted tool IDs are rejected", () => {
  assert.throws(() => parseSetupRecipes({ version: 1, tools: { "ghost-tool": { envVars: [], commandRecipes: [] } } }, knownToolIds), /unknown tool ghost-tool/);
});

test("malformed roots and unsupported setup structures are rejected", () => {
  for (const value of [null, [], 3, "{ nope", { version: 2, tools: {} }, { version: 1, tools: [] }]) {
    assert.throws(() => parseSetupRecipes(value, knownToolIds));
  }
  assert.throws(() => parseSetupRecipes({ version: 1, tools: {}, extra: true }, knownToolIds), /not supported/);
  assert.throws(() => parseSetupRecipes(setupFile({ envVars: "no", commandRecipes: [] }), knownToolIds), /envVars must be an array/);
  assert.throws(() => parseSetupRecipes(setupFile({ envVars: [], commandRecipes: {}, unsafe: true }), knownToolIds));
});

test("duplicate environment variable names are rejected", () => {
  assert.throws(() => parseSetupRecipes(setupFile({ envVars: [envVar(), envVar()], commandRecipes: [] }), knownToolIds), /duplicate name OPENAI_API_KEY/);
});

test("invalid environment variable names are rejected conservatively", () => {
  for (const name of ["OPENAI API KEY", "OPENAI_API_KEY=x", "OPENAI-API-KEY", "OPENAI_API_KEY\nNEXT", "1OPENAI_API_KEY", "OPENAI_API_KEY;rm"]) {
    assert.throws(() => parseSetupRecipes(setupFile({ envVars: [envVar({ name })], commandRecipes: [] }), knownToolIds), /environment variable name|single-line/);
  }
});

test("invalid requirements and non-boolean secret flags are rejected", () => {
  assert.throws(() => parseSetupRecipes(setupFile({ envVars: [envVar({ requirement: "unknown" })], commandRecipes: [] }), knownToolIds), /requirement is invalid/);
  assert.throws(() => parseSetupRecipes(setupFile({ envVars: [envVar({ secret: "yes" })], commandRecipes: [] }), knownToolIds), /secret must be a boolean/);
});

test("valid empty envVars and commandRecipes arrays are accepted", () => {
  const parsed = parseSetupRecipes(setupFile({ envVars: [], commandRecipes: [] }), knownToolIds);
  assert.deepEqual(parsed.tools.aider, { envVars: [], commandRecipes: [] });
});

test("env text preserves metadata order, supports explicit blanks, and skips missing values", () => {
  const vars = [
    envVar({ name: "FIRST", secret: false }),
    envVar({ name: "SECOND" }),
    envVar({ name: "THIRD" })
  ];
  assert.equal(buildEnvText(vars, { SECOND: "", FIRST: "one", THIRD: null }), "FIRST=one\nSECOND=");
});

test("secret and non-secret variables use the same text format and hints are never inserted", () => {
  const vars = [envVar({ name: "SECRET_VALUE", secret: true, valueHint: "never-copy-this" }), envVar({ name: "PUBLIC_VALUE", secret: false, valueHint: "example" })];
  assert.equal(buildEnvText(vars, { SECRET_VALUE: "actual", PUBLIC_VALUE: "normal" }), "SECRET_VALUE=actual\nPUBLIC_VALUE=normal");
  assert.equal(buildEnvText(vars, {}), "");
});

test("env output rejects duplicates, CR/LF, and null bytes", () => {
  assert.throws(() => buildEnvText([envVar(), envVar()], { OPENAI_API_KEY: "x" }), /duplicate name/);
  for (const value of ["one\ntwo", "one\rtwo", "one\0two"]) {
    assert.throws(() => buildEnvText([envVar()], { OPENAI_API_KEY: value }), /CR, LF, or null bytes/);
  }
});

test("install, start, additional commands, and recipes appear as builder choices", () => {
  const parsed = parseSetupRecipes(setupFile({ envVars: [], commandRecipes: [commandRecipe()] }), knownToolIds);
  const choices = listAvailableCommands({
    install: "npm install tool",
    start: "tool",
    commands: [{ label: "Status", command: "tool status" }]
  }, parsed.tools.aider);
  assert.deepEqual(choices.map((choice) => [choice.id, choice.kind, choice.label]), [
    ["install", "command", "Install"],
    ["start", "command", "Start"],
    ["command:1", "command", "Status"],
    ["recipe:run-with-model", "recipe", "Run with model"]
  ]);
});

test("blank commands are ignored and official command text is only outer-trimmed", () => {
  const choices = listAvailableCommands({
    install: "  npm  install tool  ",
    start: " ",
    commands: [{ label: "", command: "" }, { label: "  Exact label  ", command: "  tool   status  " }]
  });
  assert.deepEqual(choices.map((choice) => choice.command), ["npm  install tool", "tool   status"]);
  assert.equal(choices[1].label, "Exact label");
});

test("command sequences are newline-separated in the selected order", () => {
  assert.equal(buildCommandSequence([{ command: "tool start" }, "npm install tool", { text: "tool status" }]), "tool start\nnpm install tool\ntool status");
  assert.equal(buildCommandSequence(["", "  tool  "]), "tool");
});

test("valid text recipe replaces declared placeholders and detects unresolved markers", () => {
  const parsed = parseSetupRecipes(setupFile({ envVars: [], commandRecipes: [commandRecipe()] }), knownToolIds);
  const recipe = parsed.tools.aider.commandRecipes[0];
  assert.equal(buildCommandRecipeText(recipe, { model: "openai/gpt-5" }), "tool --model openai/gpt-5");
  assert.equal(hasUnresolvedPlaceholders("tool {{model}}"), true);
  assert.equal(hasUnresolvedPlaceholders("tool model"), false);
});

test("missing required recipe input is rejected", () => {
  const parsed = parseSetupRecipes(setupFile({ envVars: [], commandRecipes: [commandRecipe()] }), knownToolIds);
  assert.throws(() => buildCommandRecipeText(parsed.tools.aider.commandRecipes[0], {}), /model is required/);
});

test("undeclared, unused, duplicate, and malformed placeholders are rejected", () => {
  assert.throws(() => parseSetupRecipes(setupFile({ envVars: [], commandRecipes: [commandRecipe({ template: "tool {{missing}}" })] }), knownToolIds), /undeclared input/);
  assert.throws(() => parseSetupRecipes(setupFile({ envVars: [], commandRecipes: [commandRecipe({ template: "tool" })] }), knownToolIds), /unused input/);
  assert.throws(() => parseSetupRecipes(setupFile({ envVars: [], commandRecipes: [commandRecipe({ inputs: [commandRecipe().inputs[0], commandRecipe().inputs[0]] })] }), knownToolIds), /duplicate key/);
  assert.throws(() => parseSetupRecipes(setupFile({ envVars: [], commandRecipes: [commandRecipe({ template: "tool {{model" })] }), knownToolIds), /malformed placeholder/);
});

test("recipe values reject CR/LF and null bytes", () => {
  const parsed = parseSetupRecipes(setupFile({ envVars: [], commandRecipes: [commandRecipe()] }), knownToolIds);
  const recipe = parsed.tools.aider.commandRecipes[0];
  for (const value of ["a\nb", "a\rb", "a\0b"]) {
    assert.throws(() => buildCommandRecipeText(recipe, { model: value }), /CR, LF, or null bytes/);
  }
});

test("select recipe inputs accept only explicitly declared values", () => {
  const select = commandRecipe({
    template: "tool --provider {{provider}}",
    inputs: [{
      key: "provider",
      label: "Provider",
      type: "select",
      required: true,
      options: [{ value: "openai", label: "OpenAI" }, { value: "anthropic", label: "Anthropic" }]
    }]
  });
  const parsed = parseSetupRecipes(setupFile({ envVars: [], commandRecipes: [select] }), knownToolIds);
  const recipe = parsed.tools.aider.commandRecipes[0];
  assert.equal(buildCommandRecipeText(recipe, { provider: "openai" }), "tool --provider openai");
  assert.throws(() => buildCommandRecipeText(recipe, { provider: "invented" }), /not an allowed option/);
});

test("shell-like stored text remains literal and is never evaluated as builder syntax", () => {
  const literal = commandRecipe({ template: "tool {{model}} $(whoami) ${HOME}" });
  const parsed = parseSetupRecipes(setupFile({ envVars: [], commandRecipes: [literal] }), knownToolIds);
  assert.equal(buildCommandRecipeText(parsed.tools.aider.commandRecipes[0], { model: "x" }), "tool x $(whoami) ${HOME}");
});

test("all initial setup metadata is official-source-backed and catalog-valid", () => {
  const parsed = parseSetupRecipes(setupSource, knownToolIds);
  const setups = Object.values(parsed.tools);
  const envVars = setups.flatMap((setup) => setup.envVars);
  const recipes = setups.flatMap((setup) => setup.commandRecipes);
  assert.equal(catalog.length, 29);
  assert.equal(setups.length, 11);
  assert.equal(envVars.length, 14);
  assert.equal(recipes.length, 0);
  assert.ok(envVars.every((entry) => /^https?:\/\//.test(entry.source)));
  assert.ok(envVars.filter((entry) => entry.secret).every((entry) => entry.valueHint.includes("...") || entry.valueHint.startsWith("<")));
});

test("unavailable or malformed optional setup data disables builders without affecting catalog tools", () => {
  for (const raw of [null, undefined, "{ nope", { version: 1, tools: { ghost: { envVars: [], commandRecipes: [] } } }]) {
    assert.deepEqual(parseOptionalSetupRecipes(raw, knownToolIds), { version: 1, tools: {} });
  }
  const aider = catalog.find((tool) => tool.id === "aider");
  assert.equal(aider.name, "Aider");
  assert.ok(listAvailableCommands(aider, setupForTool(parseOptionalSetupRecipes(null, knownToolIds), aider.id)).length > 0);
});

test("setup builder module contains no persistence, networking, telemetry, or execution APIs", () => {
  const moduleSource = readFileSync(new URL("../assets/js/setup-recipes.js", import.meta.url), "utf8");
  for (const forbidden of ["localStorage", "sessionStorage", "fetch(", "sendBeacon", "child_process", "exec(", "spawn(", "eval("]) {
    assert.equal(moduleSource.includes(forbidden), false, forbidden);
  }
});
