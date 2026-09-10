import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { readJson } from "./submission-lib.mjs";
import { applyApprovedDevResource, buildDevResourcePullRequest, validateDevResourceIssue } from "./dev-resource-submission-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), values[index + 1]]] : pairs, []));
const event = await readJson(args.event);
const file = path.join(root, "data/dev-resources.json");
const source = JSON.parse(await readFile(file, "utf8"));
const checked = validateDevResourceIssue(event.issue.body || "", source.resources || []);
if (!checked.valid) throw new Error(checked.errors.join("\n"));
const today = new Date().toISOString().slice(0, 10);
// Catalog ordering is maintainer-owned, never taken from the public Issue.
const applied = applyApprovedDevResource({ submission: checked.submission, checkedResource: checked.resource, resources: source.resources || [], today });
source.resources = applied.resources;
await writeFile(file, `${JSON.stringify(source, null, 2)}\n`);
await writeFile(args.output, JSON.stringify(buildDevResourcePullRequest(event.issue.number, applied.record, checked.submission.type === "update" ? checked.existing : null), null, 2));
