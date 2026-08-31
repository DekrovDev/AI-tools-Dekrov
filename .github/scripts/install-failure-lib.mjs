// Pure parsing + validation for Install / setup failure issues (see
// .github/ISSUE_TEMPLATE/install-failure.yml). Cleanly separated from the Tool
// Submission pipeline: an install-failure issue is never a submission, never
// approved, never enriched, and never publishes catalog data.
//
// This module only parses/validates structured text. It reuses the same
// section/emptyResponse primitives the Tool Submission parser uses, so the two
// report types cannot drift into incompatible formats.

import { emptyResponse, section } from "./submission-lib.mjs";

export const INSTALL_FAILURE_PREFIX = "[Install failure]";
export const INSTALL_FAILURE_LABEL = "install-failure";
export const NEEDS_INFO_LABEL = "needs-info";
export const INSTALL_FAILURE_TEMPLATE = "install-failure.yml";

export const FAILURE_STAGES = [
  "Installation command",
  "Start command",
  "Other documented command",
  "Setup / environment",
  "Documentation mismatch",
  "Other"
];

export const OPERATING_SYSTEMS = ["Windows", "macOS", "Linux", "Other"];
export const SHELL_OPTIONS = ["PowerShell", "Command Prompt", "bash", "zsh", "fish", "Other", "Not sure"];

// "I removed API keys, tokens, passwords, cookies and other secrets from this public report."
export const CONFIRM_SECRETS_REMOVED = "removed API keys, tokens, passwords, cookies and other secrets";
// "I understand this GitHub issue will be public."
export const CONFIRM_PUBLIC = "this GitHub issue will be public";

// Detect an install-failure issue by title or by body section header. This lets
// the workflow trigger without relying on labels that may not exist yet in a
// fresh repository (issue forms cannot apply missing labels).
export function looksLikeInstallFailure(title = "", body = "") {
  return String(title || "").trim().startsWith(INSTALL_FAILURE_PREFIX)
    || /### Failure stage/.test(body || "")
    || /### Command or setup step/.test(body || "");
}

// Extract the tool id from a title shaped like:
//   [Install failure][aider] Aider
export function toolIdFromTitle(title = "") {
  const match = String(title || "").trim().match(/^\[Install failure\]\[([^\]]+)\]/i);
  return match ? match[1].trim() : "";
}

// Read a required checkbox option (rendered as "- [x] <label>" inside the
// named section). Returns true only when that option is checked.
export function confirmationChecked(body = "", phrase, header = "Public-data confirmation") {
  const block = section(body, header);
  const line = String(block).split("\n").find((entry) => entry.includes(phrase));
  if (!line) return false;
  return /^\s*-\s*\[x\]/i.test(line.trim());
}

// Parse all structured fields out of the issue body into plain data. Never
// throws. Missing optional fields become empty strings.
export function parseInstallFailure(body = "", title = "") {
  const cleanTitle = String(title || "").trim();
  return {
    title: cleanTitle,
    titleToolId: toolIdFromTitle(cleanTitle),
    toolIdField: emptyResponse(section(body, "Tool ID")),
    stage: emptyResponse(section(body, "Failure stage")),
    os: emptyResponse(section(body, "Operating system")),
    shell: emptyResponse(section(body, "Shell / terminal")),
    toolVersion: emptyResponse(section(body, "Tool version")),
    commandStep: emptyResponse(section(body, "Command or setup step")),
    errorOutput: emptyResponse(section(body, "Error output")),
    expected: emptyResponse(section(body, "Expected result")),
    context: emptyResponse(section(body, "Additional context")),
    secretsRemoved: confirmationChecked(body, CONFIRM_SECRETS_REMOVED),
    understandsPublic: confirmationChecked(body, CONFIRM_PUBLIC)
  };
}

// The effective tool id: prefer the structured title token, fall back to the
// Tool ID field. Returns { toolId, error } where error is set when the two
// sources disagree.
export function resolveToolId(parsed) {
  if (parsed.titleToolId && parsed.toolIdField && parsed.titleToolId !== parsed.toolIdField) {
    return { toolId: parsed.titleToolId, error: "Tool ID in the title and the Tool ID field disagree." };
  }
  return { toolId: parsed.titleToolId || parsed.toolIdField, error: "" };
}

// Validate an install-failure report. knownIds (a Set of current catalog tool
// ids) is optional: when provided, an unknown tool id marks the report
// needs-info. Returns { valid, errors, resolvedToolId }.
export function validateInstallFailure(parsed, knownIds = new Set()) {
  const errors = [];
  if (!parsed.commandStep) errors.push("Command or setup step is required.");
  if (!parsed.errorOutput) errors.push("Error output is required.");
  if (!parsed.stage) errors.push("Failure stage is required.");
  else if (!FAILURE_STAGES.includes(parsed.stage)) errors.push(`${parsed.stage} is not a valid failure stage.`);
  if (!parsed.os) errors.push("Operating system is required.");
  else if (!OPERATING_SYSTEMS.includes(parsed.os)) errors.push(`${parsed.os} is not a valid operating system.`);
  if (parsed.shell && !SHELL_OPTIONS.includes(parsed.shell)) errors.push(`${parsed.shell} is not a valid shell option.`);
  if (!parsed.secretsRemoved) errors.push("Public-data confirmation: confirm that secrets were removed.");
  if (!parsed.understandsPublic) errors.push("Public-data confirmation: confirm that the issue will be public.");
  const resolved = resolveToolId(parsed);
  if (resolved.error) errors.push(resolved.error);
  else if (!resolved.toolId) errors.push("Tool ID not found in the title or the Tool ID field.");
  else if (knownIds.size > 0 && !knownIds.has(resolved.toolId)) errors.push(`Unknown tool id: ${resolved.toolId}.`);
  return { valid: errors.length === 0, errors, resolvedToolId: resolved.toolId, resolvedError: resolved.error };
}

// Label transitions as additive/removal operations so validation state never
// clobbers unrelated labels. Always ensures `install-failure`; adds `needs-info`
// on invalid and removes it on valid. No other label is ever added or removed.
export function installFailureLabelTransitions(currentNames, valid) {
  const current = new Set(Array.isArray(currentNames) ? currentNames.filter((name) => typeof name === "string") : []);
  const add = [];
  const remove = [];
  if (!current.has(INSTALL_FAILURE_LABEL)) add.push(INSTALL_FAILURE_LABEL);
  if (!valid && !current.has(NEEDS_INFO_LABEL)) add.push(NEEDS_INFO_LABEL);
  if (valid && current.has(NEEDS_INFO_LABEL)) remove.push(NEEDS_INFO_LABEL);
  return { add, remove };
}
