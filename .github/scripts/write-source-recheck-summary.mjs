import { readFile, appendFile } from "node:fs/promises";
import { formatSourceRecheckSummary } from "./source-recheck-lib.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), values[index + 1]]] : pairs, []));
if (!args.report || !args.issues || !args.summary) throw new Error("Pass --report, --issues, and --summary paths.");
const [report, issues] = await Promise.all([readFile(args.report, "utf8").then(JSON.parse), readFile(args.issues, "utf8").then(JSON.parse)]);
await appendFile(args.summary, formatSourceRecheckSummary(report, issues) + "\n");
