// Pure UI-state logic for the tool-detail Setup builders.
// This module only tracks transient in-memory builder state and produces text
// via the setup-recipes helpers. It never touches the DOM, any browser
// persistence or transmission API, or any process/execution API.
// Entered values exist only in the state object passed in by the caller.

import {
  buildCommandRecipeText,
  buildCommandSequence,
  buildEnvText,
  listAvailableCommands
} from "./setup-recipes.js";

const SECRET_MASK = "••••••••";

// A Setup section is worth rendering when the tool has env vars OR at least
// one command source (install/start/additional commands/future recipes).
export function hasSetupCapability(tool, setup) {
  const setupData = setup || { envVars: [], commandRecipes: [] };
  const envVars = Array.isArray(setupData.envVars) ? setupData.envVars : [];
  return envVars.length > 0 || listAvailableCommands(tool, setupData).length > 0;
}

export function createSetupState(toolId) {
  return {
    toolId,
    tab: "env",
    values: {},
    included: new Set(),
    reveal: new Set(),
    selected: [],
    recipeValues: {}
  };
}

// Discard any previous tool's values: setup state belongs to the currently
// opened tool and must never leak across tools.
export function setupStateForTool(state, toolId) {
  if (state && state.toolId === toolId) return state;
  return createSetupState(toolId);
}

function hasEnteredValue(state, name) {
  const value = state.values[name];
  return typeof value === "string" && value.trim() !== "";
}

// Required vars are always included. Optional/depends vars are included when
// the user enables them explicitly or enters a value (typing auto-includes).
export function envIncluded(state, envVar) {
  if (envVar.requirement === "required") return true;
  if (state.included.has(envVar.name)) return true;
  return hasEnteredValue(state, envVar.name);
}

export function setEnvValue(state, name, value) {
  state.values[name] = String(value ?? "");
  // Typing auto-includes; clearing the field removes the value-driven include
  // so the checkbox stays consistent with what will actually be generated.
  if (hasEnteredValue(state, name)) state.included.add(name);
  else state.included.delete(name);
}

// The include checkbox is the master switch: unchecking also discards the
// entered value so an excluded variable cannot silently reappear.
export function toggleEnvInclude(state, envVar, include) {
  if (include) {
    state.included.add(envVar.name);
  } else {
    state.included.delete(envVar.name);
    delete state.values[envVar.name];
  }
}

export function effectiveEnvValues(state, envVars) {
  const values = {};
  for (const envVar of envVars) {
    if (!envIncluded(state, envVar)) continue;
    const value = state.values[envVar.name];
    if (typeof value === "string") values[envVar.name] = value;
  }
  return values;
}

export function buildEnvTextForState(state, envVars) {
  return buildEnvText(envVars, effectiveEnvValues(state, envVars));
}

// Masked preview: variable names stay visible, secret VALUES are hidden for any
// non-empty value. Mirrors buildEnvText so the preview and the copied output
// always agree: an explicitly entered empty value renders "NAME=", an untouched
// variable is omitted, and an optional/depends var only appears once included.
export function maskedEnvPreview(state, envVars) {
  const lines = [];
  for (const envVar of envVars) {
    if (!envIncluded(state, envVar)) continue;
    const value = state.values[envVar.name];
    if (typeof value !== "string") continue;
    const display = envVar.secret && value.trim() ? SECRET_MASK : value;
    lines.push(envVar.name + "=" + display);
  }
  return lines.join("\n");
}

export function clearEnvState(state) {
  state.values = {};
  state.included = new Set();
  state.reveal = new Set();
}

export function hasEnvInput(state) {
  return Object.keys(state.values).some((name) => hasEnteredValue(state, name));
}

export function toggleCommandSelected(state, id) {
  const index = state.selected.indexOf(id);
  if (index === -1) state.selected.push(id);
  else state.selected.splice(index, 1);
}

export function moveCommand(state, id, direction) {
  const index = state.selected.indexOf(id);
  if (index === -1) return;
  const target = index + direction;
  if (target < 0 || target >= state.selected.length) return;
  const [item] = state.selected.splice(index, 1);
  state.selected.splice(target, 0, item);
}

export function setRecipeValue(state, recipeId, key, value) {
  if (!state.recipeValues[recipeId]) state.recipeValues[recipeId] = {};
  state.recipeValues[recipeId][key] = String(value ?? "");
}

function recipeOutput(state, recipe) {
  try {
    return { ok: true, text: buildCommandRecipeText(recipe, state.recipeValues[recipe.id] || {}) };
  } catch {
    return { ok: false, text: "" };
  }
}

// Ordered rows for the generated sequence. Commands contribute their verified
// text; selected recipes contribute only when their required inputs are
// complete (via buildCommandRecipeText, never rebuilt here).
export function commandSequenceRows(state, tool, setup) {
  const choices = listAvailableCommands(tool, setup);
  const byId = new Map(choices.map((choice) => [choice.id, choice]));
  const rows = [];
  let incompleteRecipe = false;
  for (const id of state.selected) {
    const choice = byId.get(id);
    if (!choice) continue;
    if (choice.kind === "recipe") {
      const result = recipeOutput(state, choice.recipe);
      if (!result.ok) {
        incompleteRecipe = true;
        continue;
      }
      rows.push({ id, kind: "recipe", label: choice.label, text: result.text });
    } else {
      rows.push({ id, kind: "command", label: choice.label, text: choice.command });
    }
  }
  return { rows, incompleteRecipe };
}

export function selectedCommandOutputs(state, tool, setup) {
  const result = commandSequenceRows(state, tool, setup);
  return { text: buildCommandSequence(result.rows.map((row) => row.text)), incompleteRecipe: result.incompleteRecipe };
}

export function canCopyCommands(state, tool, setup) {
  return selectedCommandOutputs(state, tool, setup).text.trim() !== "";
}
