import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { readJson } from "./submission-lib.mjs";
import { looksLikeDevResourceSubmission, validateDevResourceIssue } from "./dev-resource-submission-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), values[index + 1]]] : pairs, []));
const event = await readJson(args.event);
const body = event.issue.body || "";
if (!looksLikeDevResourceSubmission(body)) {
  await writeFile(args.output, JSON.stringify({ skip: true }));
  process.exit(0);
}
const source = await readJson(path.join(root, "data/dev-resources.json"));
const result = validateDevResourceIssue(body, source.resources || []);
await writeFile(args.output, JSON.stringify(result, null, 2));
