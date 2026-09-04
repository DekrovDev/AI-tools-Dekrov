import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { buildDevResourcePullRequest, decideDevResourceApproval, isTrustedDevResourceApprovalPull, validateDevResourceIssue } from "./dev-resource-submission-lib.mjs";
import { readJson } from "./submission-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), values[index + 1]]] : pairs, []));
const event = await readJson(args.event);
const source = JSON.parse(await readFile(path.join(root, "data/dev-resources.json"), "utf8"));
const checked = validateDevResourceIssue(event.issue.body || "", source.resources || []);
if (!checked.valid) throw new Error(checked.errors.join("\n"));
const pendingPulls = await readPendingDevPulls();
const branch = `dev-resource-submission/issue-${event.issue.number}`;
const existingBranch = await readExistingDevBranch(branch);
const existingBranches = existingBranch ? [existingBranch] : [];
const decision = decideDevResourceApproval({ issueNumber: event.issue.number, resource: checked.resource, pendingPulls, existingBranches });
if (decision.action === "reject") throw new Error(decision.reason);
await writeFile(args.output, JSON.stringify({ ...decision, resource: checked.resource, ...buildDevResourcePullRequest(event.issue.number, checked.resource) }, null, 2));

async function githubJson(pathname) {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required for approval preflight.");
  const response = await fetch(`https://api.github.com${pathname}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "ai-dekrov-dev-resource-approval" } });
  if (!response.ok) {
    const error = new Error(`GitHub API request failed: ${response.status} ${pathname}`);
    error.status = response.status;
    throw error;
  }
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
  const relevant = pulls.filter((pull) => isTrustedDevResourceApprovalPull(pull, repository));
  return Promise.all(relevant.map(async (pull) => {
    return { number: pull.number, headRefName: pull.head.ref, resources: await readDevResourcesAtRef(pull.head.ref) };
  }));
}

async function readDevResourcesAtRef(ref) {
  const repository = process.env.GITHUB_REPOSITORY;
  const data = await githubJson(`/repos/${repository}/contents/data/dev-resources.json?ref=${encodeURIComponent(ref)}`);
  const decoded = Buffer.from(data.content || "", "base64").toString("utf8");
  const source = JSON.parse(decoded);
  return source.resources || [];
}

async function readExistingDevBranch(branch) {
  if (!await branchExists(branch)) return null;
  try {
    return { name: branch, resources: await readDevResourcesAtRef(branch) };
  } catch (error) {
    if (error.status === 404) return { name: branch, resources: [] };
    throw error;
  }
}

async function branchExists(branch) {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "ai-dekrov-dev-resource-approval" } });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`GitHub API request failed: ${response.status} branch lookup`);
  return true;
}
