import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { readJson, parseIssueSubmission, verifiedMetadataFromComments, validateTool } from "./submission-lib.mjs";
import { applyApprovedSubmission } from "./apply-submission-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), values[index + 1]]] : pairs, []));
const event = await readJson(args.event); const schema = await readJson(path.join(root, "data/tool-schema.json")); const toolsPath = path.join(root, "data/tools.json"); const tools = JSON.parse(await readFile(toolsPath, "utf8")); const submission = parseIssueSubmission(event.issue.body || "");
if (!["new", "update"].includes(submission.type)) throw new Error("Invalid submission type.");
const checked = validateTool(JSON.parse(submission.json), schema); if (checked.errors.length) throw new Error(checked.errors.join("\n"));
// Verified metadata is read from the bot-created comment, never from the
// user-editable Issue body, so it cannot be spoofed.
const verified = await readVerifiedMetadata(event);
const today = new Date().toISOString().slice(0, 10);
const { tools: updatedTools, record, diff } = applyApprovedSubmission({ submission, checkedTool: checked.tool, tools, today, verified });
await writeFile(toolsPath, `${JSON.stringify(updatedTools, null, 2)}\n`);
await writeFile(args.output, JSON.stringify({ title: `${submission.type === "new" ? "Add" : "Update"} tool: ${record.name}`, body: `Closes #${event.issue.number}\n\nSubmission type: ${submission.type}\n\nDiff:\n\n\`\`\`diff\n${diff.join("\n")}\n\`\`\`` }, null, 2));

async function readVerifiedMetadata(event) {
  const repo = process.env.GITHUB_REPOSITORY || "";
  const token = process.env.GITHUB_TOKEN || "";
  if (!repo || !token) return null;
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/issues/${event.issue.number}/comments`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "ai-dekrov-apply"
      }
    });
    if (!response.ok) return null;
    const comments = await response.json();
    // Only github-actions[bot] comments are trusted; user comments carrying
    // the same marker are ignored (see verifiedMetadataFromComments).
    return verifiedMetadataFromComments(comments || []);
  } catch {
    return null;
  }
}
