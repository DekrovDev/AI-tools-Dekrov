import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { readJson, parseIssueSubmission, validateTool, findDuplicates } from "./submission-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), values[index + 1]]] : pairs, []));
const event = await readJson(args.event); const schema = await readJson(path.join(root, "data/tool-schema.json")); const toolsPath = path.join(root, "data/tools.json"); const tools = JSON.parse(await readFile(toolsPath, "utf8")); const submission = parseIssueSubmission(event.issue.body || "");
if (!["new", "update"].includes(submission.type)) throw new Error("Invalid submission type.");
const checked = validateTool(JSON.parse(submission.json), schema); if (checked.errors.length) throw new Error(checked.errors.join("\n"));
const today = new Date().toISOString().slice(0, 10); let diff = []; let record;
if (submission.type === "new") { const duplicates = findDuplicates(checked.tool, tools); if (duplicates.length) throw new Error(`Possible duplicate: ${duplicates.map((item) => item.id).join(", ")}`); record = { ...checked.tool, addedAt: today, updatedAt: today, lastVerifiedAt: "", sources: [...new Set([checked.tool.url, checked.tool.github, checked.tool.docs].filter(Boolean))] }; tools.push(record); diff = Object.keys(record).map((key) => `+ ${key}: ${JSON.stringify(record[key])}`); }
else { const index = tools.findIndex((tool) => tool.id === submission.existingToolId); if (index < 0) throw new Error("Existing tool was not found."); const old = tools[index]; const duplicates = findDuplicates(checked.tool, tools, old.id); if (duplicates.length) throw new Error(`Possible duplicate: ${duplicates.map((item) => item.id).join(", ")}`); record = { ...old, ...checked.tool, id: old.id, addedAt: old.addedAt || today, updatedAt: today, lastVerifiedAt: old.lastVerifiedAt || "", sources: [...new Set([...(old.sources || []), checked.tool.url, checked.tool.github, checked.tool.docs].filter(Boolean))] }; delete record.notes; tools[index] = record; diff = Object.keys(record).filter((key) => JSON.stringify(old[key]) !== JSON.stringify(record[key])).map((key) => `- ${key}: ${JSON.stringify(old[key] ?? "")}\n+ ${key}: ${JSON.stringify(record[key])}`); }
await writeFile(toolsPath, `${JSON.stringify(tools, null, 2)}\n`);
await writeFile(args.output, JSON.stringify({ title: `${submission.type === "new" ? "Add" : "Update"} tool: ${record.name}`, body: `Closes #${event.issue.number}\n\nSubmission type: ${submission.type}\n\nDiff:\n\n\`\`\`diff\n${diff.join("\n")}\n\`\`\`` }, null, 2));
