import { readJson } from "./submission-lib.mjs";
import { writeFile } from "node:fs/promises";
import { installFailureLabelTransitions } from "./install-failure-lib.mjs";

// Derive the additive/removal label transitions for an install-failure report
// from the GitHub issue event and the validation result. The workflow applies
// exactly these add/remove operations, so validation state never clobbers
// unrelated labels and repeated edits never spam comments.
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), values[index + 1]]] : pairs, []));
const event = await readJson(args.event);
const result = await readJson(args.result);
if (result.skip) {
  await writeFile(args.output, JSON.stringify({ skip: true }));
  process.exit(0);
}
const currentNames = Array.isArray(event.issue?.labels) ? event.issue.labels.map((label) => label.name) : [];
const transitions = installFailureLabelTransitions(currentNames, result.valid === true);
await writeFile(args.output, JSON.stringify(transitions, null, 2));