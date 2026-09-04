import { confirmationChecked, emptyResponse, hasIssueSection, section } from "./submission-lib.mjs";
import { findDevResourceDuplicates, validateDevResourceSubmission } from "../../assets/js/dev-resource-submission.js";

export { findDevResourceDuplicates, validateDevResourceSubmission };

export function parseDevResourceSubmission(body = "") {
  return {
    submissionKind: emptyResponse(section(body, "Submission kind")).toLowerCase(),
    type: emptyResponse(section(body, "Submission type")).toLowerCase(),
    json: emptyResponse(section(body, "Dev Resource JSON")).replace(/^```(?:json)?\s*|\s*```$/g, "").trim(),
    context: emptyResponse(section(body, "Context"))
  };
}

export function looksLikeDevResourceSubmission(body = "") { return hasIssueSection(body, "Dev Resource JSON") || hasIssueSection(body, "Tool JSON"); }
export function looksLikeDevResourceSmartAdd(title = "", body = "") {
  return String(title).trim().startsWith("[Dev Resource Smart Add]") || /### Resource URL/.test(body);
}

export const MAX_DEV_SUBMISSION_BODY_LENGTH = 30000;
export const MAX_DEV_SUBMISSION_JSON_LENGTH = 20000;
const DEV_RESOURCE_SUBMISSION_FIELDS = ["id", "name", "category", "description", "url", "favicon", "tags", "tech", "pricing", "openSource", "noSignup", "copyable"];

// Used by both the validation and approval paths. No GitHub Issue Form
// control is trusted as a server-side boundary.
export function validateDevResourceIssue(body = "", resources = []) {
  const text = String(body || "");
  const submission = parseDevResourceSubmission(text);
  const errors = [];
  const hasDevJson = hasIssueSection(text, "Dev Resource JSON");
  const hasToolJson = hasIssueSection(text, "Tool JSON");
  if (text.length > MAX_DEV_SUBMISSION_BODY_LENGTH) errors.push(`Issue body must be at most ${MAX_DEV_SUBMISSION_BODY_LENGTH} characters.`);
  if (submission.submissionKind !== "dev-resource") errors.push("Submission kind must be dev-resource.");
  if (!hasDevJson) errors.push("Dev Resource JSON section is required.");
  if (hasToolJson) errors.push("Tool JSON is not allowed in a Dev Resource submission.");
  if (submission.type !== "new") errors.push("Submission type must be new.");
  if (!confirmationChecked(text)) errors.push("Confirmation must be checked.");
  if (submission.json.length > MAX_DEV_SUBMISSION_JSON_LENGTH) errors.push(`Dev Resource JSON must be at most ${MAX_DEV_SUBMISSION_JSON_LENGTH} characters.`);
  let raw = null;
  if (hasDevJson && submission.json.length <= MAX_DEV_SUBMISSION_JSON_LENGTH) {
    try { raw = JSON.parse(submission.json); } catch { errors.push("Dev Resource JSON is not valid JSON."); }
  }
  const checked = raw ? validateDevResourceSubmission(raw) : { errors: [], resource: null };
  errors.push(...checked.errors);
  const duplicates = checked.resource ? findDevResourceDuplicates(checked.resource, resources) : [];
  if (duplicates.length) errors.push(`Possible duplicate: ${duplicates.map((item) => `${item.id} (${item.reasons.join(", ")})`).join("; ")}.`);
  return { valid: errors.length === 0, errors, duplicates, submission, resource: checked.resource };
}

export function isTrustedDevResourceApprovalPull(pull, repository) {
  const expectedRepository = String(repository || "").toLowerCase();
  const headRepository = String(pull?.head?.repo?.full_name || "").toLowerCase();
  return Boolean(expectedRepository && headRepository === expectedRepository && String(pull?.head?.ref || "").startsWith("dev-resource-submission/"));
}

export function branchContainsApprovedDevResource(resources, expectedResource) {
  return Array.isArray(resources) && resources.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = Object.fromEntries(DEV_RESOURCE_SUBMISSION_FIELDS.map((field) => [field, entry[field]]));
    const checked = validateDevResourceSubmission(candidate);
    return checked.errors.length === 0 && DEV_RESOURCE_SUBMISSION_FIELDS.every((field) => JSON.stringify(checked.resource[field]) === JSON.stringify(expectedResource[field]));
  });
}

export function buildDevResourcePullRequest(issueNumber, resource) {
  const diff = Object.keys(resource).map((key) => `+ ${key}: ${JSON.stringify(resource[key])}`).join("\n");
  return { title: `Add Dev Resource: ${resource.name}`, body: `Closes #${issueNumber}\n\n\`\`\`diff\n${diff}\n\`\`\`` };
}

// Pending branches are treated as proposals against the catalog before their
// PRs merge. This makes independent approvals for the same resource safe.
export function decideDevResourceApproval({ issueNumber, resource, pendingPulls = [], existingBranches = [] }) {
  const branch = `dev-resource-submission/issue-${issueNumber}`;
  const sameIssue = pendingPulls.find((pull) => pull.headRefName === branch);
  if (sameIssue) return { action: "skip", reason: "An approval PR already exists for this Issue.", branch, pull: sameIssue };
  const pendingDuplicates = pendingPulls.flatMap((pull) => findDevResourceDuplicates(resource, pull.resources || []).map((match) => ({ ...match, pull: pull.number })));
  if (pendingDuplicates.length) return { action: "reject", reason: `Possible duplicate already proposed in open PR #${pendingDuplicates[0].pull}: ${pendingDuplicates.map((match) => `${match.id} (${match.reasons.join(", ")})`).join("; ")}.`, branch, pendingDuplicates };
  const existingBranch = existingBranches.find((item) => (typeof item === "string" ? item : item?.name) === branch);
  if (existingBranch) {
    const resources = typeof existingBranch === "string" ? [] : existingBranch.resources;
    if (!branchContainsApprovedDevResource(resources, resource)) return { action: "reject", reason: "The existing approval branch does not contain the expected approved Dev Resource.", branch };
    return { action: "resume", reason: "The approval branch exists without an open PR; create the missing PR.", branch };
  }
  return { action: "create", branch };
}
