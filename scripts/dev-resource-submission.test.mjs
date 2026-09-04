import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDevResourceCandidate, buildDevResourceSubmissionBody, validateDevResourceSubmission } from "../assets/js/dev-resource-submission.js";
import { decideDevResourceApproval, looksLikeDevResourceSmartAdd, looksLikeDevResourceSubmission, parseDevResourceSubmission, validateDevResourceIssue } from "../.github/scripts/dev-resource-submission-lib.mjs";
import { looksLikeSubmission } from "../.github/scripts/submission-lib.mjs";
import { buildDevResourceAnalysisComment, runDevResourceSmartAdd, safeDevResourceCommentText } from "./dev-resource-smart-add.mjs";

const resource = buildDevResourceCandidate({ name: "Component Garden", category: "ui-components", description: "A public gallery of reusable UI components.", url: "https://components.example/", favicon: "", tags: [], tech: [], pricing: "", openSource: false, noSignup: false, copyable: false });
const body = buildDevResourceSubmissionBody(resource, "Official site");

test("canonical Dev Resource body declares its kind and includes backend confirmation", () => {
  assert.equal(looksLikeDevResourceSubmission(body), true);
  assert.equal(parseDevResourceSubmission(body).submissionKind, "dev-resource");
  assert.deepEqual(JSON.parse(parseDevResourceSubmission(body).json), resource);
  assert.equal(body.includes("### Tool JSON"), false);
  assert.deepEqual(validateDevResourceIssue(body).errors, []);
});

test("mixed and foreign Issue bodies are rejected by both catalog validators", () => {
  const hybrid = `${body}\n\n### Tool JSON\n{}`;
  const devResult = validateDevResourceIssue(hybrid);
  assert.equal(looksLikeSubmission(hybrid), true);
  assert.ok(devResult.errors.some((error) => error.includes("Tool JSON is not allowed")));
  assert.ok(looksLikeDevResourceSubmission("### Tool JSON\n{}"));
});

test("Dev backend rejects wrong or missing type, confirmation, malformed JSON, and invalid fields", () => {
  const cases = [
    [body.replace("dev-resource", "ai-tool"), "Submission kind must be dev-resource"],
    [body.replace("### Submission kind\ndev-resource\n\n", ""), "Submission kind must be dev-resource"],
    [body.replace("### Confirmation\n- [x] I confirm this is a factual public developer resource.", "### Confirmation\n- [ ] I confirm this is a factual public developer resource."), "Confirmation must be checked"],
    [body.replace(JSON.stringify(resource, null, 2), "{ nope"), "Dev Resource JSON is not valid JSON"],
    [buildDevResourceSubmissionBody({ ...resource, category: "not-real" }), "category is not in the Dev Resources taxonomy"],
    [buildDevResourceSubmissionBody({ ...resource, url: "ftp://example.com" }), "url must be an http(s) URL"],
    [buildDevResourceSubmissionBody({ ...resource, openSource: "true" }), "openSource must be a boolean"],
    [buildDevResourceSubmissionBody({ ...resource, extra: true }), "Unsupported field: extra"],
    [buildDevResourceSubmissionBody({ ...resource, addedAt: "1999-01-01" }), "Unsupported field: addedAt"]
  ];
  for (const [invalidBody, expected] of cases) assert.ok(validateDevResourceIssue(invalidBody).errors.some((error) => error.includes(expected)), expected);
});

test("Manual, JSON Import, and Smart Add share the same canonical Dev payload", async () => {
  const manual = buildDevResourceCandidate({ name: "Component Garden", category: "other", description: "Reusable public components", url: "https://example.com/", favicon: "", tags: [], tech: [], pricing: "", openSource: false, noSignup: false, copyable: false });
  const imported = validateDevResourceSubmission(JSON.parse(JSON.stringify(manual)));
  const smart = await runDevResourceSmartAdd({ title: "[Dev Resource Smart Add] Components", body: "### Resource URL\nhttps://example.com/\n\n### Context\nPublic components\n", resources: [], fetchImpl: async () => ({ status: 200, contentType: "text/html", text: "<title>Component Garden — UI</title><meta name=\"description\" content=\"Reusable public components\">" }) });
  assert.deepEqual(imported.errors, []);
  assert.deepEqual(Object.keys(manual), Object.keys(smart.resource));
  assert.deepEqual(Object.keys(imported.resource), Object.keys(smart.resource));
  assert.ok(!Object.hasOwn(smart.resource, "addedAt"));
});

test("Dev approval is idempotent and rejects duplicate pending IDs and domains", () => {
  const sameIssue = decideDevResourceApproval({ issueNumber: 17, resource, pendingPulls: [{ number: 44, headRefName: "dev-resource-submission/issue-17", resources: [resource] }] });
  assert.equal(sameIssue.action, "skip", "same Issue approved twice reuses its PR");
  const existingBranch = decideDevResourceApproval({ issueNumber: 18, resource, existingBranches: ["dev-resource-submission/issue-18"] });
  assert.equal(existingBranch.action, "skip", "an existing branch is idempotent even before PR creation");
  const sameId = decideDevResourceApproval({ issueNumber: 19, resource, pendingPulls: [{ number: 45, headRefName: "dev-resource-submission/issue-45", resources: [resource] }] });
  assert.equal(sameId.action, "reject");
  const sameDomain = decideDevResourceApproval({ issueNumber: 20, resource: { ...resource, id: "component-other", name: "Other components", url: "https://components.example/docs" }, pendingPulls: [{ number: 46, headRefName: "dev-resource-submission/issue-46", resources: [resource] }] });
  assert.equal(sameDomain.action, "reject");
});

test("Manual validation errors have a visible Manual-panel surface", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8")
  ]);
  const invalid = validateDevResourceSubmission({ ...resource, favicon: "ftp://example.com/icon.svg" });
  assert.ok(invalid.errors.some((error) => error.includes("favicon must be an http(s) URL")));
  assert.ok(html.indexOf('id="dev-manual-errors"') > html.indexOf('id="dev-resource-form"'));
  assert.ok(app.includes("setDevManualErrors(checked.errors)"));
  assert.ok(!app.includes("if (checked.errors.length) { setDevJsonErrors(checked.errors); return; }"));
});

test("Dev Smart Add recognizes only its marker and sanitizes page metadata in comments", async () => {
  const smartBody = "### Resource URL\nhttps://example.com/\n\n### Context\nPublic components\n";
  assert.equal(looksLikeDevResourceSmartAdd("[Dev Resource Smart Add] Components", smartBody), true);
  const result = await runDevResourceSmartAdd({ title: "[Dev Resource Smart Add] Components", body: smartBody, resources: [], fetchImpl: async () => ({ status: 200, contentType: "text/html", text: "<title>Component Garden — UI</title><meta name=\"description\" content=\"Reusable public components\">" }) });
  assert.equal(result.convert, true);
  assert.deepEqual(result.labels, ["dev-resource-submission", "pending"]);
  assert.equal(result.resource.category, "other");
  assert.equal(safeDevResourceCommentText("@team\n```hi"), "@\u200bteam hi");
  assert.ok(!buildDevResourceAnalysisComment({ resource: { ...resource, name: "@team ```" }, duplicates: [] }).includes("@team"));
});

test("Dev workflows preserve unrelated labels and approval has a preflight", async () => {
  const [validate, smart, approved, apply] = await Promise.all([
    readFile(new URL("../.github/workflows/validate-dev-resource-submission.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/dev-resource-smart-add.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/approved-dev-resource-submission.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/scripts/apply-dev-resource-submission.mjs", import.meta.url), "utf8")
  ]);
  assert.ok(validate.includes("addLabels"));
  assert.ok(!validate.includes("setLabels"));
  assert.ok(smart.includes("addLabels"));
  assert.ok(!smart.includes("setLabels"));
  assert.ok(approved.includes("preflight-dev-resource-approval.mjs"));
  assert.ok(approved.includes("concurrency"));
  assert.ok(approved.includes("git add data/dev-resources.json"));
  assert.ok(!approved.includes("data/tools.json"));
  assert.ok(apply.includes("validateDevResourceIssue"));
});
