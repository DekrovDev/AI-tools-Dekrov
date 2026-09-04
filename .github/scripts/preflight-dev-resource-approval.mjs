import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { decideDevResourceApproval, validateDevResourceIssue } from "./dev-resource-submission-lib.mjs";
import { readJson } from "./submission-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), values[index + 1]]] : pairs, []));
const event = await readJson(args.event);
const source = JSON.parse(await readFile(path.join(root, "data/dev-resources.json"), "utf8"));
const checked = validateDevResourceIssue(event.issue.body || "", source.resources || []);
if (!checked.valid) throw new Error(checked.errors.join("\n"));
const pendingPulls = await readPendingDevPulls();
const branch = `dev-resource-submission/issue-${event.issue.number}`;
const existingBranches = await branchExists(branch) ? [branch] : [];
const decision = decideDevResourceApproval({ issueNumber: event.issue.number, resource: checked.resource, pendingPulls, existingBranches });
if (decision.action === "reject") throw new Error(decision.reason);
await writeFile(args.output, JSON.stringify({ ...decision, resource: checked.resource }, null, 2));

async function githubJson(pathname) {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required for approval preflight.");
  const response = await fetch(`https://api.github.com${pathname}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "ai-dekrov-dev-resource-approval" } });
  if (!response.ok) throw new Error(`GitHub API request failed: ${response.status} ${pathname}`);
  return response.json();
}

async function readPendingDevPulls() {
  const repository = process.env.GITHUB_REPOSITORY;
  const pulls = [];
  for (let page = 1; ; page += 1) {
    const batch = await githubJson(`/repos/${repository}/pulls?state=open&per_page=100&page=${page}`);
    pulls.push(...batch);
    if (batch.length < 100) break;
  }
  const relevant = pulls.filter((pull) => String(pull.head?.ref || "").startsWith("dev-resource-submission/"));
  return Promise.all(relevant.map(async (pull) => {
    const data = await githubJson(`/repos/${repository}/contents/data/dev-resources.json?ref=${encodeURIComponent(pull.head.ref)}`);
    const decoded = Buffer.from(data.content || "", "base64").toString("utf8");
    const source = JSON.parse(decoded);
    return { number: pull.number, headRefName: pull.head.ref, resources: source.resources || [] };
  }));
}

async function branchExists(branch) {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "ai-dekrov-dev-resource-approval" } });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`GitHub API request failed: ${response.status} branch lookup`);
  return true;
}
