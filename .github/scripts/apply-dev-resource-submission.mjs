import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { readJson } from "./submission-lib.mjs";
import { validateDevResourceIssue } from "./dev-resource-submission-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), values[index + 1]]] : pairs, []));
const event = await readJson(args.event);
const file = path.join(root, "data/dev-resources.json");
const source = JSON.parse(await readFile(file, "utf8"));
const checked = validateDevResourceIssue(event.issue.body || "", source.resources || []);
if (!checked.valid) throw new Error(checked.errors.join("\n"));
const today = new Date().toISOString().slice(0, 10);
// Catalog ordering is maintainer-owned, never taken from the public Issue.
const resource = { ...checked.resource, addedAt: today };
source.resources = [...(source.resources || []), resource];
await writeFile(file, `${JSON.stringify(source, null, 2)}\n`);
const diff = Object.keys(resource).map((key) => `+ ${key}: ${JSON.stringify(resource[key])}`).join("\n");
await writeFile(args.output, JSON.stringify({ title: `Add Dev Resource: ${resource.name}`, body: `Closes #${event.issue.number}\n\n\`\`\`diff\n${diff}\n\`\`\`` }, null, 2));
