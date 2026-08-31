// Pure setup metadata and copy-builder logic.
// This module returns .env and command TEXT only. It never fetches, persists,
// transmits, logs, or executes user-provided values.

export const SETUP_RECIPES_PATH = "data/setup-recipes.json";
export const SETUP_RECIPES_VERSION = 1;

const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const RECIPE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INPUT_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const REQUIREMENTS = new Set(["required", "optional", "depends"]);
const INPUT_TYPES = new Set(["text", "select"]);
const PLACEHOLDER_PATTERN = /{{([a-z][a-z0-9_]*)}}/g;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message) {
  throw new Error(message);
}

function assertRecord(value, path) {
  if (!isRecord(value)) fail(path + " must be an object.");
}

function assertOnlyKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(path + "." + key + " is not supported.");
  }
}

function singleLine(value, path, { required = true } = {}) {
  if (typeof value !== "string") fail(path + " must be a string.");
  const clean = value.trim();
  if (required && !clean) fail(path + " cannot be empty.");
  if (/[\r\n\0]/.test(clean)) fail(path + " must be single-line text.");
  return clean;
}

function optionalSingleLine(value, path) {
  if (value == null) return "";
  return singleLine(value, path, { required: false });
}

function officialSource(value, path) {
  const source = singleLine(value, path);
  let url;
  try {
    url = new URL(source);
  } catch {
    fail(path + " must be a valid HTTP(S) URL.");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) fail(path + " must be a valid HTTP(S) URL.");
  if (url.username || url.password) fail(path + " must not contain credentials.");
  return source;
}

function extractPlaceholders(template) {
  return [...template.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
}

export function hasUnresolvedPlaceholders(text) {
  const value = String(text ?? "");
  return value.includes("{{") || value.includes("}}");
}

function sanitizeEnvVar(raw, path) {
  assertRecord(raw, path);
  assertOnlyKeys(raw, new Set(["name", "label", "description", "requirement", "secret", "valueHint", "source"]), path);
  const name = singleLine(raw.name, path + ".name");
  if (!ENV_NAME_PATTERN.test(name)) fail(path + ".name is not a valid environment variable name.");
  const requirement = singleLine(raw.requirement, path + ".requirement");
  if (!REQUIREMENTS.has(requirement)) fail(path + ".requirement is invalid.");
  if (typeof raw.secret !== "boolean") fail(path + ".secret must be a boolean.");
  const envVar = {
    name,
    label: singleLine(raw.label, path + ".label"),
    description: singleLine(raw.description, path + ".description"),
    requirement,
    secret: raw.secret
  };
  const valueHint = optionalSingleLine(raw.valueHint, path + ".valueHint");
  if (valueHint) envVar.valueHint = valueHint;
  if (raw.source != null) envVar.source = officialSource(raw.source, path + ".source");
  return envVar;
}

function sanitizeOption(raw, path) {
  assertRecord(raw, path);
  assertOnlyKeys(raw, new Set(["value", "label"]), path);
  return {
    value: singleLine(raw.value, path + ".value"),
    label: singleLine(raw.label, path + ".label")
  };
}

function sanitizeRecipeInput(raw, path) {
  assertRecord(raw, path);
  assertOnlyKeys(raw, new Set(["key", "label", "type", "required", "placeholder", "options"]), path);
  const key = singleLine(raw.key, path + ".key");
  if (!INPUT_KEY_PATTERN.test(key)) fail(path + ".key is invalid.");
  const type = singleLine(raw.type, path + ".type");
  if (!INPUT_TYPES.has(type)) fail(path + ".type is invalid.");
  if (typeof raw.required !== "boolean") fail(path + ".required must be a boolean.");
  const input = { key, label: singleLine(raw.label, path + ".label"), type, required: raw.required };
  const placeholder = optionalSingleLine(raw.placeholder, path + ".placeholder");
  if (placeholder) input.placeholder = placeholder;
  if (type === "select") {
    if (!Array.isArray(raw.options) || raw.options.length === 0) fail(path + ".options must be a non-empty array for select inputs.");
    const seen = new Set();
    input.options = raw.options.map((option, index) => {
      const parsed = sanitizeOption(option, path + ".options[" + index + "]");
      if (seen.has(parsed.value)) fail(path + ".options contains duplicate value " + parsed.value + ".");
      seen.add(parsed.value);
      return parsed;
    });
  } else if (raw.options != null) {
    fail(path + ".options is only supported for select inputs.");
  }
  return input;
}

function sanitizeCommandRecipe(raw, path) {
  assertRecord(raw, path);
  assertOnlyKeys(raw, new Set(["id", "label", "description", "template", "inputs", "source"]), path);
  const id = singleLine(raw.id, path + ".id");
  if (!RECIPE_ID_PATTERN.test(id)) fail(path + ".id must be a kebab-case identifier.");
  const template = singleLine(raw.template, path + ".template");
  if (!Array.isArray(raw.inputs)) fail(path + ".inputs must be an array.");
  const seenInputs = new Set();
  const inputs = raw.inputs.map((input, index) => {
    const parsed = sanitizeRecipeInput(input, path + ".inputs[" + index + "]");
    if (seenInputs.has(parsed.key)) fail(path + ".inputs contains duplicate key " + parsed.key + ".");
    seenInputs.add(parsed.key);
    return parsed;
  });
  const placeholders = extractPlaceholders(template);
  const stripped = template.replace(PLACEHOLDER_PATTERN, "");
  if (hasUnresolvedPlaceholders(stripped)) fail(path + ".template contains a malformed placeholder.");
  for (const placeholder of new Set(placeholders)) {
    if (!seenInputs.has(placeholder)) fail(path + ".template uses undeclared input " + placeholder + ".");
  }
  for (const input of inputs) {
    if (!placeholders.includes(input.key)) fail(path + ".inputs declares unused input " + input.key + ".");
  }
  const recipe = {
    id,
    label: singleLine(raw.label, path + ".label"),
    description: singleLine(raw.description, path + ".description"),
    template,
    inputs
  };
  if (raw.source != null) recipe.source = officialSource(raw.source, path + ".source");
  return recipe;
}

function sanitizeToolSetup(raw, path) {
  assertRecord(raw, path);
  assertOnlyKeys(raw, new Set(["envVars", "commandRecipes"]), path);
  if (!Array.isArray(raw.envVars)) fail(path + ".envVars must be an array.");
  if (!Array.isArray(raw.commandRecipes)) fail(path + ".commandRecipes must be an array.");
  const seenEnvVars = new Set();
  const envVars = raw.envVars.map((envVar, index) => {
    const parsed = sanitizeEnvVar(envVar, path + ".envVars[" + index + "]");
    if (seenEnvVars.has(parsed.name)) fail(path + ".envVars contains duplicate name " + parsed.name + ".");
    seenEnvVars.add(parsed.name);
    return parsed;
  });
  const seenRecipes = new Set();
  const commandRecipes = raw.commandRecipes.map((recipe, index) => {
    const parsed = sanitizeCommandRecipe(recipe, path + ".commandRecipes[" + index + "]");
    if (seenRecipes.has(parsed.id)) fail(path + ".commandRecipes contains duplicate id " + parsed.id + ".");
    seenRecipes.add(parsed.id);
    return parsed;
  });
  return { envVars, commandRecipes };
}

export function emptySetupRecipes() {
  return { version: SETUP_RECIPES_VERSION, tools: {} };
}

export function parseSetupRecipes(raw, knownToolIds = []) {
  let source = raw;
  if (typeof raw === "string") {
    try {
      source = JSON.parse(raw);
    } catch {
      fail("setup-recipes JSON is invalid.");
    }
  }
  assertRecord(source, "setup-recipes");
  assertOnlyKeys(source, new Set(["version", "tools"]), "setup-recipes");
  if (source.version !== SETUP_RECIPES_VERSION) fail("setup-recipes.version must be " + SETUP_RECIPES_VERSION + ".");
  assertRecord(source.tools, "setup-recipes.tools");
  const known = knownToolIds instanceof Set ? knownToolIds : new Set(knownToolIds || []);
  const parsed = emptySetupRecipes();
  for (const [toolId, setup] of Object.entries(source.tools)) {
    if (!known.has(toolId)) fail("setup-recipes.tools references unknown tool " + toolId + ".");
    parsed.tools[toolId] = sanitizeToolSetup(setup, "setup-recipes.tools." + toolId);
  }
  return parsed;
}

// Optional-data boundary for app bootstrap: unavailable or malformed setup
// metadata disables only builders and never makes the catalog critical path fail.
export function parseOptionalSetupRecipes(raw, knownToolIds = []) {
  if (raw == null) return emptySetupRecipes();
  try {
    return parseSetupRecipes(raw, knownToolIds);
  } catch {
    return emptySetupRecipes();
  }
}

export function setupForTool(setupData, toolId) {
  const tools = isRecord(setupData?.tools) ? setupData.tools : {};
  return Object.prototype.hasOwnProperty.call(tools, toolId) ? tools[toolId] : { envVars: [], commandRecipes: [] };
}

function builderValue(value, path) {
  if (typeof value !== "string") fail(path + " must be text.");
  if (/[\r\n\0]/.test(value)) fail(path + " cannot contain CR, LF, or null bytes.");
  return value;
}

export function buildEnvText(envVars, values = {}) {
  if (!Array.isArray(envVars)) fail("envVars must be an array.");
  assertRecord(values, "values");
  const seen = new Set();
  const lines = [];
  for (const [index, envVar] of envVars.entries()) {
    assertRecord(envVar, "envVars[" + index + "]");
    const name = envVar.name;
    if (typeof name !== "string" || !ENV_NAME_PATTERN.test(name)) fail("envVars[" + index + "].name is invalid.");
    if (seen.has(name)) fail("envVars contains duplicate name " + name + ".");
    seen.add(name);
    if (!Object.prototype.hasOwnProperty.call(values, name) || values[name] == null) continue;
    lines.push(name + "=" + builderValue(values[name], "values." + name));
  }
  return lines.join("\n");
}

function commandText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function listAvailableCommands(tool, setup = { commandRecipes: [] }) {
  const choices = [];
  const install = commandText(tool?.install);
  if (install) choices.push({ id: "install", kind: "command", label: "Install", command: install });
  const start = commandText(tool?.start);
  if (start) choices.push({ id: "start", kind: "command", label: "Start", command: start });
  if (Array.isArray(tool?.commands)) {
    tool.commands.forEach((item, index) => {
      const command = commandText(item?.command);
      if (!command) return;
      choices.push({ id: "command:" + (index + 1), kind: "command", label: commandText(item?.label) || "Command " + (index + 1), command });
    });
  }
  if (Array.isArray(setup?.commandRecipes)) {
    for (const recipe of setup.commandRecipes) {
      choices.push({ id: "recipe:" + recipe.id, kind: "recipe", label: recipe.label, description: recipe.description, recipe });
    }
  }
  return choices;
}

export function buildCommandSequence(selectedCommands) {
  if (!Array.isArray(selectedCommands)) fail("selectedCommands must be an array.");
  const lines = [];
  selectedCommands.forEach((selection, index) => {
    const raw = typeof selection === "string" ? selection : selection?.command ?? selection?.text;
    if (raw == null) return;
    if (typeof raw !== "string") fail("selectedCommands[" + index + "] must contain text.");
    if (raw.includes("\0")) fail("selectedCommands[" + index + "] cannot contain null bytes.");
    const clean = raw.trim();
    if (clean) lines.push(clean);
  });
  return lines.join("\n");
}

export function buildCommandRecipeText(recipe, values = {}) {
  assertRecord(recipe, "recipe");
  assertRecord(values, "values");
  if (typeof recipe.template !== "string" || !Array.isArray(recipe.inputs)) fail("recipe is malformed.");
  let text = recipe.template;
  for (const input of recipe.inputs) {
    const hasValue = Object.prototype.hasOwnProperty.call(values, input.key) && values[input.key] != null;
    const value = hasValue ? builderValue(values[input.key], "values." + input.key) : "";
    if (input.required && value === "") fail("values." + input.key + " is required.");
    if (input.type === "select" && value !== "") {
      const allowed = new Set((input.options || []).map((option) => option.value));
      if (!allowed.has(value)) fail("values." + input.key + " is not an allowed option.");
    }
    text = text.split("{{" + input.key + "}}").join(value);
  }
  if (hasUnresolvedPlaceholders(text)) fail("command recipe contains unresolved placeholders.");
  return text;
}
