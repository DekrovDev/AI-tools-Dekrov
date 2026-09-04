import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { confirmationChecked, hasIssueSection, readJson, parseIssueSubmission, looksLikeSubmission, validateTool, findDuplicates } from "./submission-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), values[index + 1]]] : pairs, []));
const event = await readJson(args.event);
const schema = await readJson(path.join(root, "data/tool-schema.json"));
const tools = await readJson(path.join(root, "data/tools.json"));
const body = event.issue.body || "";
// Safe no-op for issues that are not canonical tool submissions. This lets the
// workflow trigger without relying on labels that may not exist yet in a fresh
// repository.
if (!looksLikeSubmission(body)) {
  await writeFile(args.output, JSON.stringify({ skip: true }));
  process.exit(0);
}
const submission = parseIssueSubmission(body);
const errors = [];
if (submission.submissionKind !== "ai-tool") errors.push("Submission kind must be ai-tool.");
if (!hasIssueSection(body, "Tool JSON")) errors.push("Tool JSON section is required.");
if (hasIssueSection(body, "Dev Resource JSON")) errors.push("Dev Resource JSON is not allowed in an AI Tool submission.");
if (!confirmationChecked(body)) errors.push("Confirmation must be checked.");
if (!["new", "update"].includes(submission.type)) errors.push("Submission type must be new or update.");
if (submission.type === "update" && !submission.existingToolId) errors.push("Existing tool ID is required for an update.");
if (submission.type === "new" && submission.existingToolId) errors.push("Existing tool ID must be empty for a new submission.");
let raw = null; try { raw = JSON.parse(submission.json); } catch { errors.push("Tool JSON is not valid JSON."); }
const checked = raw ? validateTool(raw, schema) : { errors: [], tool: null }; errors.push(...checked.errors);
const existing = tools.find((tool) => tool.id === submission.existingToolId);
if (submission.type === "update" && !existing) errors.push("Existing tool ID does not exist.");
const duplicates = checked.tool ? findDuplicates(checked.tool, tools, submission.type === "update" ? submission.existingToolId : "") : [];
if (duplicates.length) errors.push(`Possible duplicate: ${duplicates.map((item) => `${item.id} (${item.reasons.join(", ")})`).join("; ")}.`);
const result = { valid: errors.length === 0, errors, duplicates, submission, tool: checked.tool, existing };
await writeFile(args.output, JSON.stringify(result, null, 2));
