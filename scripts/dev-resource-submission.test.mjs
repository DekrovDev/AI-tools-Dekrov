import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDevResourceCandidate, buildDevResourceSubmissionBody, validateDevResourceSubmission } from "../assets/js/dev-resource-submission.js";
import { branchContainsApprovedDevResource, decideDevResourceApproval, isTrustedDevResourceApprovalPull, looksLikeDevResourceSmartAdd, looksLikeDevResourceSubmission, parseDevResourceSubmission, validateDevResourceIssue } from "../.github/scripts/dev-resource-submission-lib.mjs";
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

test("Manual candidates validate raw website and favicon input before canonicalization", () => {
  const base = { name: "Component Garden", category: "ui-components", description: "A public component gallery.", url: "https://components.example/", tags: [], tech: [], pricing: "", openSource: false, noSignup: false, copyable: false };
  const emptyFavicon = validateDevResourceSubmission(buildDevResourceCandidate({ ...base, favicon: "" }));
  const httpsFavicon = validateDevResourceSubmission(buildDevResourceCandidate({ ...base, favicon: "https://components.example/icon.svg" }));
  const ftpCandidate = buildDevResourceCandidate({ ...base, favicon: "ftp://components.example/icon.svg" });
  const ftpFavicon = validateDevResourceSubmission(ftpCandidate);
  const malformedFavicon = validateDevResourceSubmission(buildDevResourceCandidate({ ...base, favicon: "not a URL" }));
  const malformedWebsite = validateDevResourceSubmission(buildDevResourceCandidate({ ...base, url: "not a URL", favicon: "" }));
  assert.deepEqual(emptyFavicon.errors, []);
  assert.deepEqual(httpsFavicon.errors, []);
  assert.equal(ftpCandidate.favicon, "ftp://components.example/icon.svg");
  assert.ok(ftpFavicon.errors.some((error) => error.includes("favicon must be an http(s) URL")));
  assert.ok(malformedFavicon.errors.some((error) => error.includes("favicon must be an http(s) URL")));
  assert.ok(malformedWebsite.errors.some((error) => error.includes("url must be an http(s) URL")));
});

test("Dev Smart Add runs canonical validation before assigning pending", async () => {
  const smartBody = "### Resource URL\nhttps://example.com/\n\n### Context\nPublic components\n";
  const run = (html, pageUrl = "https://example.com/") => runDevResourceSmartAdd({ title: "[Dev Resource Smart Add] Components", body: smartBody, resources: [], fetchImpl: async () => ({ status: 200, contentType: "text/html", url: pageUrl, text: html }) });
  const valid = await run("<title>Component Garden — UI</title><meta name=\"description\" content=\"Reusable public components\">");
  const longTitle = await run(`<title>${"T".repeat(121)}</title>`);
  const longDescription = await run(`<title>Component Garden</title><meta name=\"description\" content=\"${"D".repeat(501)}\">`);
  const titleLess = await run("<meta name=\"description\" content=\"Reusable public components\">");
  const malformedMetadata = await run("<title><b>Component Garden</b></title><meta name=\"description\">");
  const duplicate = await run("<title>Component Garden</title>");
  const duplicateResult = await runDevResourceSmartAdd({ title: "[Dev Resource Smart Add] Components", body: smartBody, resources: [resource], fetchImpl: async () => ({ status: 200, contentType: "text/html", url: "https://components.example/", text: "<title>Component Garden</title>" }) });
  assert.deepEqual(valid.labels, ["dev-resource-submission", "pending"]);
  assert.deepEqual(titleLess.labels, ["dev-resource-submission", "pending"]);
  assert.equal(titleLess.resource.id, "example-com");
  for (const result of [longTitle, longDescription]) {
    assert.deepEqual(result.labels, ["dev-resource-submission", "needs-changes"]);
    assert.ok(result.validationErrors.length > 0);
    assert.ok(result.comment.includes("Needs changes before moderation"));
  }
  assert.deepEqual(malformedMetadata.labels, ["dev-resource-submission", "pending"]);
  assert.equal(malformedMetadata.resource.description, "");
  assert.deepEqual(duplicate.labels, ["dev-resource-submission", "pending"]);
  assert.deepEqual(duplicateResult.labels, ["dev-resource-submission", "needs-changes"]);
});

test("Dev approval skips an open PR, resumes only an expected branch, and rejects duplicates", () => {
  const sameIssue = decideDevResourceApproval({ issueNumber: 17, resource, pendingPulls: [{ number: 44, headRefName: "dev-resource-submission/issue-17", resources: [resource] }] });
  assert.equal(sameIssue.action, "skip", "same Issue approved twice reuses its PR");
  const branchResource = { ...resource, domain: "components.example", addedAt: "2026-09-04" };
  assert.equal(branchContainsApprovedDevResource([branchResource], resource), true);
  const existingBranch = decideDevResourceApproval({ issueNumber: 18, resource, existingBranches: [{ name: "dev-resource-submission/issue-18", resources: [branchResource] }] });
  assert.equal(existingBranch.action, "resume", "an expected branch without a PR resumes safely");
  const wrongBranch = decideDevResourceApproval({ issueNumber: 18, resource, existingBranches: [{ name: "dev-resource-submission/issue-18", resources: [] }] });
  assert.equal(wrongBranch.action, "reject", "a branch without the expected resource fails safely");
  assert.equal(decideDevResourceApproval({ issueNumber: 18, resource }).action, "create", "no branch or PR creates normally");
  const sameId = decideDevResourceApproval({ issueNumber: 19, resource, pendingPulls: [{ number: 45, headRefName: "dev-resource-submission/issue-45", resources: [resource] }] });
  assert.equal(sameId.action, "reject");
  const sameDomain = decideDevResourceApproval({ issueNumber: 20, resource: { ...resource, id: "component-other", name: "Other components", url: "https://components.example/docs" }, pendingPulls: [{ number: 46, headRefName: "dev-resource-submission/issue-46", resources: [resource] }] });
  assert.equal(sameDomain.action, "reject");
});

test("Dev approval preflight includes only same-repository proposal branches", () => {
  const repository = "DekrovDev/AI-tools-Dekrov";
  assert.equal(isTrustedDevResourceApprovalPull({ head: { ref: "dev-resource-submission/issue-1", repo: { full_name: repository } } }, repository), true);
  assert.equal(isTrustedDevResourceApprovalPull({ head: { ref: "dev-resource-submission/issue-1", repo: { full_name: "fork-owner/AI-tools-Dekrov" } } }, repository), false);
  assert.equal(isTrustedDevResourceApprovalPull({ head: { ref: "feature/other", repo: { full_name: repository } } }, repository), false);
  assert.equal(isTrustedDevResourceApprovalPull({ head: { ref: "dev-resource-submission/issue-1" } }, repository), false);
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
  assert.ok(approved.includes("steps.preflight.outputs.action == 'create'"));
  assert.ok(approved.includes("Create or resume pull request"));
  assert.ok(approved.includes("git add data/dev-resources.json"));
  assert.ok(!approved.includes("data/tools.json"));
  assert.ok(apply.includes("validateDevResourceIssue"));
});

test("approved Dev Resource workflow exports RESULT_PATH in both create and resume modes", async () => {
  const approved = await readFile(new URL("../.github/workflows/approved-dev-resource-submission.yml", import.meta.url), "utf8");
  const stepStart = approved.indexOf("Create or resume pull request");
  const step = approved.slice(stepStart, approved.indexOf("gh pr create") + "gh pr create".length);
  const assignments = [...step.matchAll(/(?:^|\n)\s*(export )?RESULT_PATH="\$RUNNER_TEMP\/([^"]+)"/g)]
    .map((match) => ({ exported: match[1] === "export ", file: match[2] }));
  assert.equal(assignments.length, 2, "both the create and resume branches must assign RESULT_PATH");
  assert.ok(assignments.every((assignment) => assignment.exported), "RESULT_PATH must be exported so the node step can read process.env.RESULT_PATH");
  // Each mode must point at the result file that its own writer produced in the same workflow run.
  const applyOutput = approved.match(/apply-dev-resource-submission\.mjs[^\n]*--output "\$RUNNER_TEMP\/([^"]+)"/)[1];
  const preflightOutput = approved.match(/preflight-dev-resource-approval\.mjs[^\n]*--output "\$RUNNER_TEMP\/([^"]+)"/)[1];
  assert.deepEqual(new Set(assignments.map((assignment) => assignment.file)), new Set([applyOutput, preflightOutput]));
  const ifIndex = step.indexOf('if [ "$ACTION" = "create" ]');
  const elseIndex = step.indexOf("\n          else\n");
  const fiIndex = step.indexOf("\n          fi\n");
  assert.ok(ifIndex > -1 && elseIndex > -1 && fiIndex > -1 && ifIndex < elseIndex && elseIndex < fiIndex);
  const fileIn = (from, to) => step.slice(from, to).match(/export RESULT_PATH="\$RUNNER_TEMP\/([^"]+)"/)[1];
  assert.equal(fileIn(ifIndex, elseIndex), applyOutput, "create mode reads the file the apply step wrote");
  assert.equal(fileIn(elseIndex, fiIndex), preflightOutput, "resume mode reads the file the preflight step wrote");
});

test("The shared header button chooses the current catalog dialog without propagation suppression", async () => {
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.ok(app.includes('if (isDevUiContext()) openDevResourceDialog("smart"); else openDialog("smart");'));
  assert.ok(!app.includes("stopImmediatePropagation"));
});
