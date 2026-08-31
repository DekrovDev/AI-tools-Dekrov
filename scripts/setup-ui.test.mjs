import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildEnvTextForState,
  canCopyCommands,
  clearEnvState,
  commandSequenceRows,
  createSetupState,
  envIncluded,
  hasEnvInput,
  hasSetupCapability,
  maskedEnvPreview,
  moveCommand,
  selectedCommandOutputs,
  setEnvValue,
  setRecipeValue,
  setupStateForTool,
  toggleCommandSelected,
  toggleEnvInclude
} from "../assets/js/setup-ui.js";
import { emptySetupRecipes, listAvailableCommands, setupForTool } from "../assets/js/setup-recipes.js";

const catalog = JSON.parse(readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));
const setupSource = JSON.parse(readFileSync(new URL("../data/setup-recipes.json", import.meta.url), "utf8"));
const toolById = new Map(catalog.map((tool) => [tool.id, tool]));

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

test("initial setup state is empty and per-tool", () => {
  const state = createSetupState("aider");
  assert.equal(state.toolId, "aider");
  assert.deepEqual(state.values, {});
  assert.deepEqual([...state.included], []);
  assert.deepEqual(state.selected, []);
  assert.equal(hasEnvInput(state), false);
  assert.equal(setupStateForTool(state, "aider"), state);
});

test("switching tools resets ephemeral state and same-tool keeps it", () => {
  const state = createSetupState("aider");
  setEnvValue(state, "OPENAI_API_KEY", "sk-test");
  toggleCommandSelected(state, "install");
  const other = setupStateForTool(state, "openrouter");
  assert.notEqual(other, state);
  assert.equal(other.toolId, "openrouter");
  assert.deepEqual(other.values, {});
  assert.deepEqual(other.selected, []);
  assert.equal(setupStateForTool(other, "openrouter"), other);
});

test("required env vars are always included; optional/depends need enablement or a value", () => {
  const state = createSetupState("t");
  assert.equal(envIncluded(state, envVar({ requirement: "required" })), true);
  assert.equal(envIncluded(state, envVar({ requirement: "optional" })), false);
  assert.equal(envIncluded(state, envVar({ requirement: "depends" })), false);
  setEnvValue(state, "OPENAI_API_KEY", "typed");
  assert.equal(envIncluded(state, envVar({ requirement: "depends" })), true);
  assert.ok(state.included.has("OPENAI_API_KEY"));
  setEnvValue(state, "OPENAI_API_KEY", "   ");
  assert.equal(envIncluded(state, envVar({ requirement: "depends" })), false);
});

test("include toggle is the master switch: unchecking also discards the value", () => {
  const state = createSetupState("t");
  const optional = envVar({ requirement: "optional", name: "LLM_MODEL", secret: false });
  setEnvValue(state, "LLM_MODEL", "gpt-5");
  assert.equal(envIncluded(state, optional), true);
  toggleEnvInclude(state, optional, false);
  assert.equal(state.values.LLM_MODEL, undefined);
  assert.equal(envIncluded(state, optional), false);
  toggleEnvInclude(state, optional, true);
  assert.equal(envIncluded(state, optional), true);
});

test("effective env values respect inclusion rules and feed the helper text", () => {
  const vars = [
    envVar({ name: "REQUIRED_KEY", requirement: "required", secret: true }),
    envVar({ name: "OPTIONAL_HOST", requirement: "optional", secret: false }),
    envVar({ name: "DEPENDS_MODEL", requirement: "depends", secret: false })
  ];
  const state = createSetupState("t");
  setEnvValue(state, "REQUIRED_KEY", "sk-real");
  setEnvValue(state, "DEPENDS_MODEL", "provider/model");
  assert.equal(buildEnvTextForState(state, vars), "REQUIRED_KEY=sk-real\nDEPENDS_MODEL=provider/model");
  setEnvValue(state, "OPTIONAL_HOST", "http://localhost:11434");
  assert.equal(buildEnvTextForState(state, vars), "REQUIRED_KEY=sk-real\nOPTIONAL_HOST=http://localhost:11434\nDEPENDS_MODEL=provider/model");
});

test("preview masks secret values and keeps names visible; blanks are skipped", () => {
  const vars = [
    envVar({ name: "SECRET_KEY", requirement: "required", secret: true }),
    envVar({ name: "PUBLIC_MODEL", requirement: "optional", secret: false })
  ];
  const state = createSetupState("t");
  setEnvValue(state, "SECRET_KEY", "sk-hidden");
  assert.equal(maskedEnvPreview(state, vars), "SECRET_KEY=••••••••");
  setEnvValue(state, "PUBLIC_MODEL", "gpt-5");
  assert.equal(maskedEnvPreview(state, vars), "SECRET_KEY=••••••••\nPUBLIC_MODEL=gpt-5");
  setEnvValue(state, "PUBLIC_MODEL", "  ");
  assert.equal(maskedEnvPreview(state, vars), "SECRET_KEY=••••••••");
});

test("required explicit-blank value is consistent between preview and copy text", () => {
  const vars = [envVar({ name: "REQUIRED_KEY", requirement: "required", secret: false })];
  const untouched = createSetupState("t");
  assert.equal(buildEnvTextForState(untouched, vars), "");
  assert.equal(maskedEnvPreview(untouched, vars), "");
  const blanked = createSetupState("t");
  setEnvValue(blanked, "REQUIRED_KEY", "");
  assert.equal(buildEnvTextForState(blanked, vars), "REQUIRED_KEY=");
  assert.equal(maskedEnvPreview(blanked, vars), "REQUIRED_KEY=");
});

test("invalid CR/LF/NUL secret input is rejected and never produces usable output", () => {
  const vars = [envVar({ name: "SECRET_KEY", requirement: "required", secret: true })];
  for (const bad of ["line1\nline2", "line1\rline2", "line1\0line2"]) {
    const state = createSetupState("t");
    setEnvValue(state, "SECRET_KEY", bad);
    assert.throws(() => buildEnvTextForState(state, vars), /CR, LF, or null bytes/);
    // App-layer guard: a throw collapses both outputs so Copy .env stays disabled.
    let text = "";
    let masked = "";
    try {
      text = buildEnvTextForState(state, vars);
      masked = maskedEnvPreview(state, vars);
    } catch {
      text = "";
      masked = "";
    }
    assert.equal(text, "");
    assert.equal(masked, "");
  }
});

test("clear env state wipes values, includes, and reveal state", () => {
  const state = createSetupState("t");
  setEnvValue(state, "OPENAI_API_KEY", "sk-x");
  state.reveal.add("OPENAI_API_KEY");
  assert.equal(hasEnvInput(state), true);
  clearEnvState(state);
  assert.deepEqual(state.values, {});
  assert.deepEqual([...state.included], []);
  assert.deepEqual([...state.reveal], []);
  assert.equal(hasEnvInput(state), false);
});

test("command selection keeps order, supports move, and blank selection disables copy", () => {
  const state = createSetupState("t");
  const tool = toolById.get("aider");
  const setup = setupForTool(setupSource, "aider");
  assert.equal(canCopyCommands(state, tool, setup), false);
  assert.equal(selectedCommandOutputs(state, tool, setup).text, "");
  toggleCommandSelected(state, "install");
  toggleCommandSelected(state, "start");
  assert.deepEqual(state.selected, ["install", "start"]);
  moveCommand(state, "install", 1);
  assert.deepEqual(state.selected, ["start", "install"]);
  moveCommand(state, "start", 1);
  assert.deepEqual(state.selected, ["install", "start"]);
  moveCommand(state, "install", -5);
  assert.deepEqual(state.selected, ["install", "start"]);
  assert.equal(canCopyCommands(state, tool, setup), true);
  toggleCommandSelected(state, "start");
  toggleCommandSelected(state, "install");
  assert.equal(canCopyCommands(state, tool, setup), false);
});

test("command sequence uses helper output in selected order", () => {
  const tool = {
    install: "python -m pip install aider-install",
    start: "aider",
    commands: [{ label: "Status", command: "aider --version" }]
  };
  const state = createSetupState("t");
  toggleCommandSelected(state, "command:1");
  toggleCommandSelected(state, "install");
  toggleCommandSelected(state, "start");
  const result = selectedCommandOutputs(state, tool, { envVars: [], commandRecipes: [] });
  assert.equal(result.text, "aider --version\npython -m pip install aider-install\naider");
  assert.deepEqual(commandSequenceRows(state, tool, { envVars: [], commandRecipes: [] }).rows.map((row) => row.id), ["command:1", "install", "start"]);
});

test("selected recipes contribute only when required inputs are complete", () => {
  const recipe = {
    id: "run-with-model",
    label: "Run with model",
    description: "Build a verified model command.",
    template: "tool --model {{model}}",
    inputs: [{ key: "model", label: "Model", type: "text", required: true, placeholder: "provider/model" }]
  };
  const tool = { install: "npm install tool" };
  const setup = { envVars: [], commandRecipes: [recipe] };
  const state = createSetupState("t");
  toggleCommandSelected(state, "recipe:run-with-model");
  const incomplete = selectedCommandOutputs(state, tool, setup);
  assert.equal(incomplete.text, "");
  assert.equal(incomplete.incompleteRecipe, true);
  setRecipeValue(state, "run-with-model", "model", "openai/gpt-5");
  const complete = selectedCommandOutputs(state, tool, setup);
  assert.equal(complete.text, "tool --model openai/gpt-5");
  assert.equal(complete.incompleteRecipe, false);
  setRecipeValue(state, "run-with-model", "model", "");
  assert.equal(selectedCommandOutputs(state, tool, setup).text, "");
});

test("a tool with env vars and commands has Setup capability (aider)", () => {
  const tool = toolById.get("aider");
  const setup = setupForTool(setupSource, "aider");
  assert.ok(setup.envVars.length > 0);
  assert.ok(listAvailableCommands(tool, setup).length > 0);
  assert.equal(hasSetupCapability(tool, setup), true);
});

test("a tool with commands but no setup metadata still supports Command Builder", () => {
  const tool = toolById.get("antigravity-cli");
  assert.equal(tool.id, "antigravity-cli");
  const setup = setupForTool(emptySetupRecipes(), tool.id);
  assert.deepEqual(setup, { envVars: [], commandRecipes: [] });
  const choices = listAvailableCommands(tool, setup);
  assert.ok(choices.length > 0);
  assert.equal(hasSetupCapability(tool, setup), true);
  const state = createSetupState(tool.id);
  for (const choice of choices) toggleCommandSelected(state, choice.id);
  const text = selectedCommandOutputs(state, tool, setup).text;
  assert.ok(text.includes("curl -fsSL https://antigravity.google/install.sh | bash"));
  assert.ok(text.includes("agy"));
});

test("a tool with neither env vars nor commands has no Setup capability", () => {
  const tool = toolById.get("ai-coding-agent-for-building-ambitious-software");
  const setup = setupForTool(emptySetupRecipes(), tool.id);
  assert.deepEqual(setup, { envVars: [], commandRecipes: [] });
  assert.equal(listAvailableCommands(tool, setup).length, 0);
  assert.equal(hasSetupCapability(tool, setup), false);
});

test("optional setup failure still allows base commands from the tool itself", () => {
  const tool = toolById.get("antigravity-cli");
  const setup = setupForTool(emptySetupRecipes(), tool.id);
  assert.ok(listAvailableCommands(tool, setup).length >= 2);
  assert.ok(setup.envVars.length === 0);
});

test("setup-ui module never persists, transmits, logs, or executes values", () => {
  const moduleSource = readFileSync(new URL("../assets/js/setup-ui.js", import.meta.url), "utf8");
  for (const forbidden of ["localStorage", "sessionStorage", "fetch(", "sendBeacon", "XMLHttpRequest", "navigator.clipboard", "console.", "child_process", "exec(", "spawn(", "eval("]) {
    assert.equal(moduleSource.includes(forbidden), false, forbidden);
  }
});

test("real setup metadata stays sane for the UI (11 tools, 14 env vars, no recipes)", () => {
  const withEnv = Object.keys(setupSource.tools).filter((id) => (setupSource.tools[id].envVars || []).length > 0);
  assert.equal(withEnv.length, 11);
  const envVars = Object.values(setupSource.tools).flatMap((setup) => setup.envVars);
  assert.equal(envVars.length, 14);
  assert.ok(envVars.every((entry) => entry.secret === false || entry.secret === true));
  assert.ok(envVars.every((entry) => ["required", "optional", "depends"].includes(entry.requirement)));
});
