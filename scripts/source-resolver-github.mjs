import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { validateProvenance, requireThat, hashBytes } from "./source-resolver-lib.mjs";

export function githubClient(token, repository, fetchImpl = fetch) {
  requireThat(token && repository === "DekrovDev/AI-tools-Dekrov", "Missing GitHub credential or wrong repository.");
  const root = `https://api.github.com/repos/${repository}`;
  async function request(endpoint, { method = "GET", body, optional = false, binary = false } = {}) {
    requireThat((endpoint === "" || endpoint.startsWith("/")) && !endpoint.includes("..") && !endpoint.startsWith("//"), "Invalid API endpoint.");
    const response = await fetchImpl(root + endpoint, { method, redirect: "manual", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    if (optional && response.status === 404) return null;
    if (binary) {
      requireThat(response.status === 302, `Artifact download returned ${response.status}.`);
      const target = new URL(response.headers.get("location"));
      requireThat(target.protocol === "https:" && !target.username && !target.password && [".blob.core.windows.net", ".githubusercontent.com", ".actions.githubusercontent.com"].some(suffix => target.hostname.endsWith(suffix)), "Unsafe artifact redirect.");
      // The GitHub token is NEVER forwarded to the artifact storage host.
      const download = await fetchImpl(target, { redirect: "error", signal: AbortSignal.timeout(30000) });
      requireThat(download.ok, `Artifact storage returned ${download.status}.`);
      const chunks = []; let size = 0;
      for await (const chunk of download.body) { size += chunk.length; requireThat(size <= 10000000, "Artifact archive too large."); chunks.push(chunk); }
      return Buffer.concat(chunks);
    }
    requireThat(response.ok, `GitHub ${method} ${endpoint.split("?")[0]} returned ${response.status}.`);
    if (response.status === 204) return null;
    const text = await response.text(); requireThat(Buffer.byteLength(text) <= 10000000, "GitHub response too large.");
    return JSON.parse(text);
  }
  async function paginate(endpoint, field) {
    const result = [];
    for (let page = 1; page <= 100; page++) {
      const response = await request(`${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      const rows = field ? response[field] : response;
      requireThat(Array.isArray(rows), "Invalid paginated GitHub response.");
      result.push(...rows);
      if (rows.length < 100) return result;
    }
    throw new Error("GitHub pagination limit reached; fail closed.");
  }
  return { request, paginate };
}

export async function artifactJson(client, artifact, filename) {
  const archive = await client.request(`/actions/artifacts/${artifact.id}/zip`, { binary: true });
  requireThat(!artifact.expired && artifact.digest === `sha256:${hashBytes(archive)}`, "Artifact archive digest mismatch/expired.");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "source-resolver-archive-"));
  try {
    const file = path.join(temporary, "artifact.zip"); await writeFile(file, archive, { flag: "wx" });
    const entries = execFileSync("unzip", ["-Z1", file], { encoding: "utf8", maxBuffer: 10000 }).trim().split("\n");
    requireThat(entries.length === 1 && entries[0] === filename, "Unexpected artifact archive members.");
    const bytes = execFileSync("unzip", ["-p", file, filename], { maxBuffer: 10000000 });
    return { value: JSON.parse(bytes), archive };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function trustedSource(client, policy, baseSha) {
  const repository = await client.request("");
  const workflow = await client.request(`/actions/workflows/${policy.sourceWorkflow}`);
  const runs = await client.paginate(`/actions/workflows/${workflow.id}/runs?branch=${repository.default_branch}&status=completed`, "workflow_runs");
  const latestRun = runs.filter(r => r.conclusion === "success" && ["schedule", "workflow_dispatch"].includes(r.event) && r.repository?.id === repository.id).sort((a,b) => b.id - a.id)[0];
  requireThat(latestRun, "No successful default-branch source run.");
  const run = await client.request(`/actions/runs/${latestRun.id}`);
  const artifacts = await client.paginate(`/actions/runs/${run.id}/artifacts`, "artifacts");
  const reports = artifacts.filter(a => a.name === policy.reportArtifact);
  requireThat(reports.length === 1, "No unique report artifact; no fallback to older reports.");
  const artifact = await client.request(`/actions/artifacts/${reports[0].id}`);
  const { value: report, archive } = await artifactJson(client, artifact, "source-recheck.json");
  const provenance = validateProvenance({ policy, repository, workflow, run, latestRun, artifact, archive, report, baseSha });
  return { repository, report, provenance };
}

export async function trustedLedger(client, policy, currentRunId, repositoryId) {
  const workflow = await client.request(`/actions/workflows/${policy.resolverWorkflow}`);
  requireThat(workflow.path === `.github/workflows/${policy.resolverWorkflow}`, "Resolver workflow mismatch.");
  const runs = await client.paginate(`/actions/workflows/${workflow.id}/runs?branch=main`, "workflow_runs");
  let previous;
  for (const run of runs.filter(r => r.id < currentRunId).sort((a,b) => b.id - a.id)) {
    requireThat(run.repository?.id === repositoryId && run.head_repository?.id === repositoryId && ["workflow_run", "workflow_dispatch"].includes(run.event) && run.status === "completed" && run.run_attempt === 1, "Untrusted/incomplete previous resolver run.");
    const jobs = await client.paginate(`/actions/runs/${run.id}/jobs`, "jobs");
    // A rejected upstream event never enters dispatch. Pending runs cancelled
    // by GitHub concurrency have no jobs. Neither can have launched paid work.
    if ((jobs.length && jobs.every(job => job.conclusion === "skipped")) || (!jobs.length && run.conclusion === "cancelled")) continue;
    previous = run; break;
  }
  if (!previous) return { schemaVersion: 1, reservations: [] }; // first run only
  const artifacts = await client.paginate(`/actions/runs/${previous.id}/artifacts`, "artifacts");
  const matches = artifacts.filter(a => a.name === policy.ledgerArtifact);
  requireThat(matches.length === 1 && !matches[0].expired && matches[0].workflow_run?.id === previous.id && matches[0].workflow_run?.head_sha === previous.head_sha && matches[0].workflow_run?.head_branch === "main", "Latest reservation ledger missing/expired: stop, never forget attempts.");
  return (await artifactJson(client, matches[0], "ledger.json")).value;
}

export async function currentContext(client, policy, baseSha, issueNumber) {
  const source = await trustedSource(client, policy, baseSha);
  const issues = issueNumber ? [await client.request(`/issues/${issueNumber}`)] : await client.paginate("/issues?state=open&labels=source-recheck");
  const pulls = await client.paginate("/pulls?state=all");
  const existingBranches = [];
  for (const finding of source.report.findings.filter(f => f.type === "confirmed-broken" && f.repairEligible === true)) {
    requireThat(/^[a-f0-9]{64}$/.test(finding.findingId), "Invalid branch finding ID.");
    const branch = `repair/source-${finding.findingId}`;
    if (await client.request(`/git/ref/heads/${branch}`, { optional: true })) existingBranches.push(branch);
  }
  return { ...source, issues, pulls, existingBranches };
}

export async function loadCatalog(root) {
  return { tools: JSON.parse(await readFile(path.join(root, "data/tools.json"), "utf8")), setup: JSON.parse(await readFile(path.join(root, "data/setup-recipes.json"), "utf8")) };
}
