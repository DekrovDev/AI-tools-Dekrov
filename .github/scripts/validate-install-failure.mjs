import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { readJson } from "./submission-lib.mjs";
import { looksLikeInstallFailure, parseInstallFailure, validateInstallFailure } from "./install-failure-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), values[index + 1]]] : pairs, []));
const event = await readJson(args.event);
const tools = await readJson(path.join(root, "data/tools.json"));
const title = event.issue.title || "";
const body = event.issue.body || "";
// Safe no-op for issues that are not install-failure reports (e.g. normal
// tool submissions, smart-add, or plain conversations). Keeps this workflow
// fully independent of the submission pipeline.
if (!looksLikeInstallFailure(title, body)) {
  await writeFile(args.output, JSON.stringify({ skip: true }));
  process.exit(0);
}
const parsed = parseInstallFailure(body, title);
const knownIds = new Set(tools.map((tool) => tool.id));
const result = { ...validateInstallFailure(parsed, knownIds), parsed };
await writeFile(args.output, JSON.stringify(result, null, 2));