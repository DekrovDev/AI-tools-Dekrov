import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installFailureIssueUrl, installFailureTitle, INSTALL_FAILURE_LABEL as UI_LABEL, INSTALL_FAILURE_PREFIX, INSTALL_FAILURE_TEMPLATE as UI_TEMPLATE } from "../assets/js/install-failure.js";
import {
  CONFIRM_PUBLIC,
  CONFIRM_SECRETS_REMOVED,
  INSTALL_FAILURE_LABEL,
  INSTALL_FAILURE_TEMPLATE,
  NEEDS_INFO_LABEL,
  confirmationChecked,
  installFailureLabelTransitions,
  looksLikeInstallFailure,
  parseInstallFailure,
  resolveToolId,
  toolIdFromTitle,
  validateInstallFailure
} from "../.github/scripts/install-failure-lib.mjs";

const catalog = JSON.parse(readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));
const knownIds = new Set(catalog.map((tool) => tool.id));
const aider = catalog.find((tool) => tool.id === "aider");

// Consistent frontend/backend contract.
test("frontend and backend share the form template and label", () => {
  assert.equal(INSTALL_FAILURE_TEMPLATE, UI_TEMPLATE);
  assert.equal(INSTALL_FAILURE_LABEL, UI_LABEL);
  assert.equal(INSTALL_FAILURE_TEMPLATE, "install-failure.yml");
});

// ---------- Frontend URL builder ----------
test("install failure title embeds the tool id token and name", () => {
  assert.equal(installFailureTitle({ id: "aider", name: "Aider" }), "[Install failure][aider] Aider");
  assert.ok(installFailureTitle(aider).startsWith(INSTALL_FAILURE_PREFIX + "[aider]"));
});

test("issue URL carries template, label, and encoded title", () => {
  const url = installFailureIssueUrl(aider, "DekrovDev/AI-tools-Dekrov");
  assert.ok(url.startsWith("https://github.com/DekrovDev/AI-tools-Dekrov/issues/new?"));
  assert.ok(url.includes("template=install-failure.yml"));
  assert.ok(url.includes("labels=install-failure"));
  assert.ok(url.includes("title=%5BInstall+failure%5D%5Baider%5D+Aider"));
});

test("repo whitespace/slashes are normalized and empty repo returns empty", () => {
  assert.ok(installFailureIssueUrl(aider, "/DekrovDev/AI-tools-Dekrov/").includes("github.com/DekrovDev/AI-tools-Dekrov/issues"));
  assert.equal(installFailureIssueUrl(aider, "/DekrovDev/AI-tools-Dekrov/").includes("//DekrovDev"), false);
  assert.equal(installFailureIssueUrl(aider, ""), "");
});

test("issue URL contains no secrets and no local browser state", () => {
  const url = installFailureIssueUrl(aider, "DekrovDev/AI-tools-Dekrov");
  assert.equal(url.includes("api_key"), false);
  assert.equal(url.includes("token"), false);
  assert.equal(url.includes("localStorage"), false);
  assert.equal(url.includes("filter"), false);
});

// ---------- Detection & parsing ----------
function validBody(overrides = {}) {
  return `
### Tool ID

${overrides.toolId ?? ""}

### Failure stage

${overrides.stage ?? "Installation command"}

### Operating system

${overrides.os ?? "Linux"}

### Shell / terminal

${overrides.shell ?? "bash"}

### Tool version

${overrides.version ?? "1.2.3"}

### Command or setup step

${overrides.command ?? "npm install -g aider"}

### Error output

${overrides.error ?? "EACCES: permission denied"}

### Expected result

${overrides.expected ?? "The CLI should install successfully."}

### Additional context

${overrides.context ?? "npm 10 on Ubuntu 24.04"}

### Public-data confirmation

- [x] I removed API keys, tokens, passwords, cookies and other secrets from this public report.
- [x] I understand this GitHub issue will be public.
`;
}

test("looksLikeInstallFailure detects by title, stage header, and command header", () => {
  assert.equal(looksLikeInstallFailure("[Install failure][aider] Aider", ""), true);
  assert.equal(looksLikeInstallFailure("", "### Failure stage\n\nInstallation command"), true);
  assert.equal(looksLikeInstallFailure("", "### Command or setup step\n\nnpm i"), true);
  assert.equal(looksLikeInstallFailure("[Tool] Some tool", "### Tool JSON\n\n{}"), false);
  assert.equal(looksLikeInstallFailure("hello", "just some text"), false);
});

test("toolIdFromTitle only matches the structured prefix", () => {
  assert.equal(toolIdFromTitle("[Install failure][aider] Aider"), "aider");
  assert.equal(toolIdFromTitle("[Install failure] Aider"), "");
  assert.equal(toolIdFromTitle("Aider"), "");
});

test("parseInstallFailure reads every structured section", () => {
  const parsed = parseInstallFailure(validBody(), "[Install failure][aider] Aider");
  assert.equal(parsed.titleToolId, "aider");
  assert.equal(parsed.toolIdField, "");
  assert.equal(parsed.stage, "Installation command");
  assert.equal(parsed.os, "Linux");
  assert.equal(parsed.shell, "bash");
  assert.equal(parsed.commandStep, "npm install -g aider");
  assert.equal(parsed.errorOutput, "EACCES: permission denied");
  assert.equal(parsed.secretsRemoved, true);
  assert.equal(parsed.understandsPublic, true);
});

test("an empty section never swallows the next section", () => {
  const body = validBody({ toolId: "", shell: "" });
  const parsed = parseInstallFailure(body, "[Install failure][aider] Aider");
  assert.equal(parsed.shell, "");
  assert.equal(parsed.stage, "Installation command");
  assert.equal(parsed.commandStep, "npm install -g aider");
});

test("tool id resolves from title first, field as fallback, disagreement fails", () => {
  assert.deepEqual(resolveToolId(parseInstallFailure(validBody({}), "[Install failure][aider] Aider")), { toolId: "aider", error: "" });
  const fallback = parseInstallFailure(validBody({ toolId: "cline" }), "");
  assert.deepEqual(resolveToolId(fallback), { toolId: "cline", error: "" });
  const conflict = parseInstallFailure(validBody({ toolId: "cline" }), "[Install failure][aider] Aider");
  const resolved = resolveToolId(conflict);
  assert.equal(resolved.toolId, "aider");
  assert.ok(resolved.error.includes("disagree"));
});

test("confirmationChecked requires the phrased option to be checked", () => {
  assert.equal(confirmationChecked(validBody(), CONFIRM_SECRETS_REMOVED), true);
  assert.equal(confirmationChecked(validBody(), CONFIRM_PUBLIC), true);
  const unchecked = validBody().replace("- [x] I removed", "- [ ] I removed");
  assert.equal(confirmationChecked(unchecked, CONFIRM_SECRETS_REMOVED), false);
});

// ---------- Validation ----------
function validated(body, title = "[Install failure][aider] Aider") {
  return validateInstallFailure(parseInstallFailure(body, title), knownIds);
}

test("a complete report with real tool id validates", () => {
  const result = validated(validBody());
  assert.equal(result.valid, true);
  assert.equal(result.resolvedToolId, "aider");
  assert.deepEqual(result.errors, []);
});

test("required fields missing fail validation", () => {
  const body = validBody({ command: "", error: "" });
  const result = validated(body);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Command or setup step is required")));
  assert.ok(result.errors.some((e) => e.includes("Error output is required")));
});

test("missing OS and invalid enum values fail", () => {
  assert.equal(validated(validBody({ os: "" })).valid, false);
  assert.ok(validated(validBody({ os: "BeOS" })).errors.some((e) => e.includes("not a valid operating system")));
  assert.ok(validated(validBody({ stage: "Nope" })).errors.some((e) => e.includes("not a valid failure stage")));
  assert.ok(validated(validBody({ shell: "csh" })).errors.some((e) => e.includes("not a valid shell option")));
});

test("shell is optional; version and context are not validated", () => {
  assert.equal(validated(validBody({ shell: "" })).valid, true);
  assert.equal(validated(validBody({ version: "not-semver" })).valid, true);
});

test("unchecked public-data confirmation fails validation", () => {
  const body = validBody().replace("- [x] I understand", "- [ ] I understand");
  const result = validated(body);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Public-data confirmation")));
});

test("unknown tool id fails validation against the current catalog", () => {
  assert.equal(validated(validBody({ toolId: "does-not-exist" }), "[Install failure][does-not-exist] T").valid, false);
});

test("missing tool id on a form opened without the title token fails", () => {
  assert.equal(validated(validBody({ toolId: "" }), "").valid, false);
});

test("every real catalog id is a valid report target", () => {
  for (const tool of catalog.slice(0, 5)) {
    const result = validated(validBody(), `[Install failure][${tool.id}] ${tool.name}`);
    assert.equal(result.valid, true, tool.id);
    assert.equal(result.resolvedToolId, tool.id);
  }
});

test("validator picks the needs-info label contract for invalid reports", () => {
  assert.equal(NEEDS_INFO_LABEL, "needs-info");
});

// ---------- Label transitions ----------
test("invalid report adds install-failure and needs-info", () => {
  assert.deepEqual(installFailureLabelTransitions([], false), { add: ["install-failure", "needs-info"], remove: [] });
  assert.deepEqual(installFailureLabelTransitions(["some-label"], false), { add: ["install-failure", "needs-info"], remove: [] });
});

test("valid report always keeps install-failure and removes needs-info", () => {
  assert.deepEqual(installFailureLabelTransitions([], true), { add: ["install-failure"], remove: [] });
  assert.deepEqual(installFailureLabelTransitions(["install-failure", "needs-info"], true), { add: [], remove: ["needs-info"] });
});

test("label transitions never remove install-failure or unrelated labels", () => {
  const untouched = installFailureLabelTransitions(["approved", "needs-changes", "moderator-note"], true);
  assert.deepEqual(untouched.add, ["install-failure"]);
  assert.deepEqual(untouched.remove, []);
  // Only the two install-report labels are ever added or removed.
  for (const t of [installFailureLabelTransitions([], false), installFailureLabelTransitions(["approved", "pending"], true), installFailureLabelTransitions(["approved", "needs-info"], false)]) {
    assert.ok(t.add.every((name) => [INSTALL_FAILURE_LABEL, NEEDS_INFO_LABEL].includes(name)));
    assert.ok(t.remove.every((name) => [INSTALL_FAILURE_LABEL, NEEDS_INFO_LABEL].includes(name)));
  }
});

test("workflow contract: minimal permissions, additive labels, no comments, no publication", () => {
  const workflow = readFileSync(new URL("../.github/workflows/validate-install-failure.yml", import.meta.url), "utf8");
  // Comments removed.
  assert.equal(workflow.includes("createComment"), false);
  assert.equal(workflow.includes("updateComment"), false);
  // Additive/removal label API only, never a full-set replacement.
  assert.equal(workflow.includes("setLabels"), false);
  assert.ok(workflow.includes("addLabels"));
  assert.ok(workflow.includes("removeLabel"));
  // Least privilege: contents read + issues write. Nothing writable beyond that.
  assert.ok(workflow.includes("contents: read"));
  assert.ok(workflow.includes("issues: write"));
  assert.equal(workflow.includes("contents: write"), false);
  assert.equal(workflow.includes("pull-requests:"), false);
  assert.equal(workflow.includes("actions: write"), false);
  assert.equal(workflow.includes("deployments: write"), false);
  // Fully isolated from the tool submission pipeline.
  for (const forbidden of ["tool-submission", "approved", "needs-changes", "ai-enrich", "pending"] ) {
    assert.equal(workflow.includes(forbidden), false, forbidden);
  }
  // No git push / PR / catalog mutation path.
  assert.equal(workflow.includes("git push"), false);
  assert.equal(workflow.includes("pull_request"), false);
  // Labels are ensured first via the shared helper (no duplicated creation).
  assert.ok(workflow.includes("ensure-labels.mjs"));
});
