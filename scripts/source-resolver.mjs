import { readFile, writeFile, appendFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { githubClient, currentContext, trustedLedger, loadCatalog } from "./source-resolver-github.mjs";
import { makeDispatch, effectiveStage, requireThat, validateInvocation, revalidateTask, parseResearchResult, researchPrompt, duplicateReason } from "./source-resolver-lib.mjs";
import { prepareRepair, replaceJsonStrings } from "./source-repair-lib.mjs";
import { applyRepairFiles } from "./source-repair.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 2000000 }).trim();
const policy = JSON.parse(await readFile(path.join(root, ".github/source-resolver/policy.json"), "utf8"));
const json = file => readFile(file, "utf8").then(JSON.parse);
const output = async (key, value) => { requireThat(process.env.GITHUB_OUTPUT, "Missing output transport."); await appendFile(process.env.GITHUB_OUTPUT, `${key}=${JSON.stringify(value)}\n`); };
const summary = message => process.env.GITHUB_STEP_SUMMARY ? appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`) : Promise.resolve();

async function context(expected) {
  requireThat(!git("status", "--porcelain"), "Checkout is not clean.");
  const token = process.env.GITHUB_TOKEN; delete process.env.GITHUB_TOKEN;
  const client = githubClient(token, process.env.GITHUB_REPOSITORY);
  const branch = await client.request("/branches/main");
  requireThat(branch.commit.sha === git("rev-parse", "HEAD"), "Default branch moved since checkout.");
  const source = await currentContext(client, policy, branch.commit.sha, expected?.issueNumber);
  const catalog = await loadCatalog(root);
  return { client, source, catalog, branch };
}

async function dispatch() {
  const event = await json(process.env.GITHUB_EVENT_PATH);
  validateInvocation({ event: process.env.GITHUB_EVENT_NAME, repository: event.repository, workflowRun: event.workflow_run, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), policy });
  const { client, source, catalog, branch } = await context();
  const stage = effectiveStage(policy, Number(process.env.RESOLVER_STAGE || 0));
  requireThat(stage === 0 || branch.protected === true, "Production requires protected main; configure repository rules before paid execution.");
  if (process.env.GITHUB_EVENT_NAME === "workflow_run") requireThat(event.workflow_run.id === source.provenance.runId, "Superseded upstream event.");
  const ledger = await trustedLedger(client, policy, Number(process.env.GITHUB_RUN_ID), source.repository.id);
  const result = makeDispatch({ policy, ...source, ...catalog, ledger, stage, selectedFinding: process.env.RESOLVER_FINDING || "" });
  const dir = process.env.RESOLVER_RUNTIME;
  requireThat(dir && !path.resolve(dir).startsWith(root + path.sep), "Runtime belongs outside checkout.");
  await writeFile(path.join(dir, "ledger.json"), JSON.stringify(result.ledger), { flag: "wx" });
  await writeFile(path.join(dir, "dispatch.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  // Each reusable lane has an independent result, so one failure cannot block
  // unrelated findings. Reservations are uploaded BEFORE any lane can start.
  for (let lane = 0; lane < 3; lane++) await output(`lane${lane}`, result.launch && result.tasks[lane] ? result.tasks[lane] : null);
  await summary(`Stage ${result.stage}: ${result.tasks.length} eligible candidates; ${result.launch ? "reserved for AI" : "dry-run, no AI"}.\n\n\`\`\`json\n${JSON.stringify(result.skipped, null, 2)}\n\`\`\``);
}

async function refresh(expected) {
  const current = await context(expected);
  const issue = current.source.issues[0];
  const task = prepareRepair({ ...current.catalog, issue, report: current.source.report, findingId: expected.findingId });
  const item = { findingId: task.finding.findingId, issueNumber: task.issueNumber, snapshot: task.snapshot, provenance: current.source.provenance, task };
  revalidateTask(expected, item);
  requireThat(!duplicateReason(task, current.source.pulls, current.source.existingBranches.includes(task.branch)), "Duplicate repair transaction.");
  return { ...current, item };
}

async function validate() {
  const expected = JSON.parse(process.env.RESOLVER_ITEM);
  requireThat(/^[a-f0-9]{64}$/.test(expected.findingId), "Invalid audit finding ID.");
  const auditFile = path.join(process.env.RUNNER_TEMP, "research-result.json");
  await writeFile(auditFile, JSON.stringify({ findingId: expected.findingId, status: "not-validated" }), { flag: "wx" });
  const result = parseResearchResult(process.env.RESOLVER_RESULT, expected.findingId);
  await writeFile(auditFile, JSON.stringify({ ...result, validation: "not-passed" }));
  if (result.status === "skip") { await output("validated", null); await summary(`Finding ${expected.findingId}: skip; see structured research-result artifact.`); return; }
  const { item } = await refresh(expected);
  const preview = await applyRepairFiles({ root, task: item.task, proposal: result.proposal });
  git("switch", "--create", item.task.branch);
  const applied = await applyRepairFiles({ root, task: item.task, proposal: result.proposal, write: true });
  requireThat(JSON.stringify(preview.changes) === JSON.stringify(applied.changes), "Dry-run/apply mismatch.");
  // This job has read-only GitHub access, NO OpenAI secret. Remove token env
  // before ANY install/test process. Never test in the write-capable publisher.
  execFileSync("npm", ["ci", "--ignore-scripts"], { cwd: root, stdio: "inherit" });
  execFileSync("npm", ["test"], { cwd: root, stdio: "inherit" });
  git("diff", "--check");
  const files = git("diff", "--name-only").split("\n").sort();
  requireThat(JSON.stringify(files) === JSON.stringify(applied.files.slice().sort()), "Unexpected changed files.");
  const before = git("rev-parse", "HEAD");
  for (const file of files) {
    const original = execFileSync("git", ["-C", root, "show", `${before}:${file}`], { encoding: "utf8", maxBuffer: 2000000 });
    const exact = replaceJsonStrings(original, applied.changes.filter(change => change.file === file));
    requireThat(await readFile(path.join(root, file), "utf8") === exact, "Diff differs from scoped replacements.");
  }
  const validated = { item, proposal: result.proposal, changes: applied.changes, tests: "npm test passed; git diff --check passed; exact scoped bytes checked" };
  await output("validated", validated);
  await writeFile(auditFile, JSON.stringify({ ...result, validation: "passed", provenance: item.provenance, tests: validated.tests, files }));
  await summary(`Finding ${expected.findingId}: tests passed; scope ${files.join(", ")}.`);
}

async function publish() {
  requireThat(policy.productionEnabled === true, "Production is disabled in committed policy.");
  const validated = JSON.parse(process.env.RESOLVER_VALIDATED);
  requireThat(validated?.tests === "npm test passed; git diff --check passed; exact scoped bytes checked", "Missing independent test attestation.");
  const { client, item, branch: protectedBranch } = await refresh(validated.item);
  requireThat(protectedBranch.protected === true, "Publisher requires protected main.");
  const preview = await applyRepairFiles({ root, task: item.task, proposal: validated.proposal });
  requireThat(JSON.stringify(preview.changes) === JSON.stringify(validated.changes), "Retested scope changed.");
  git("switch", "--create", item.task.branch);
  const applied = await applyRepairFiles({ root, task: item.task, proposal: validated.proposal, write: true });
  git("diff", "--check");
  const files = git("diff", "--name-only").split("\n").sort();
  requireThat(JSON.stringify(files) === JSON.stringify(applied.files.slice().sort()), "Publisher scope mismatch.");
  const tree = [];
  for (const file of files) {
    const original = execFileSync("git", ["-C", root, "show", `HEAD:${file}`], { encoding: "utf8", maxBuffer: 2000000 });
    const content = await readFile(path.join(root, file), "utf8");
    requireThat(content === replaceJsonStrings(original, applied.changes.filter(c => c.file === file)), "Publisher byte scope mismatch.");
    tree.push({ path: file, mode: "100644", type: "blob", content });
  }
  // Last authenticated check immediately before publishing. The writer only
  // creates Git objects/a NEW ref and a PR; no update-ref, merge or Issue APIs.
  const branch = await client.request("/branches/main");
  requireThat(branch.commit.sha === item.provenance.baseSha, "Default branch moved before publication.");
  const latest = await currentContext(client, policy, branch.commit.sha, item.issueNumber);
  const task = prepareRepair({ ...await loadCatalogFromHead(), issue: latest.issues[0], report: latest.report, findingId: item.findingId });
  revalidateTask(item, { ...item, task, snapshot: task.snapshot, provenance: latest.provenance });
  requireThat(!duplicateReason(task, latest.pulls, latest.existingBranches.includes(task.branch)), "Duplicate before publication.");
  const base = await client.request(`/git/commits/${item.provenance.baseSha}`);
  const newTree = await client.request("/git/trees", { method: "POST", body: { base_tree: base.tree.sha, tree } });
  const commit = await client.request("/git/commits", { method: "POST", body: { message: applied.prTitle, tree: newTree.sha, parents: [item.provenance.baseSha] } });
  requireThat((await client.request("/branches/main")).commit.sha === item.provenance.baseSha, "Default branch moved while preparing Git objects.");
  // Atomic create-only ref prevents overwrite even if another actor races us.
  await client.request("/git/refs", { method: "POST", body: { ref: `refs/heads/${task.branch}`, sha: commit.sha } });
  const pr = await client.request("/pulls", { method: "POST", body: { title: applied.prTitle, body: `${applied.prBody}\n\nValidation: ${validated.tests}.\nSource run: ${item.provenance.runId}; artifact: ${item.provenance.artifactId}; digest: ${item.provenance.artifactDigest}.\nPublished by isolated guarded publisher; human merge required.`, head: task.branch, base: "main" } });
  await summary(`Finding ${item.findingId}: ${pr.html_url}; commit ${commit.sha}; no merge, no auto-merge, no Issue closure.`);
  // GITHUB_TOKEN push/PR events do not trigger CI. GitHub explicitly permits
  // workflow_dispatch with this token; run the normal Test workflow on the NEW
  // branch SHA, without API credentials, so required checks can actually run.
  await client.request("/actions/workflows/test.yml/dispatches", { method: "POST", body: { ref: task.branch } });
}

async function loadCatalogFromHead() {
  return { tools: JSON.parse(git("show", "HEAD:data/tools.json")), setup: JSON.parse(git("show", "HEAD:data/setup-recipes.json")) };
}

async function main() {
  const command = process.argv[2];
  if (command === "dispatch") return dispatch();
  if (command === "validate") return validate();
  if (command === "publish") return publish();
  if (command === "prompt") {
    requireThat(policy.productionEnabled === true, "Production is disabled in committed policy.");
    const item = JSON.parse(process.env.RESOLVER_ITEM);
    requireThat(/^[a-f0-9]{64}$/.test(item.findingId), "Invalid research item.");
    await writeFile(path.join(process.env.RESOLVER_RUNTIME, "prompt.txt"), researchPrompt(item), { flag: "wx" });
    return;
  }
  throw new Error("Expected dispatch, prompt, validate or publish.");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(async error => { console.error(error.message); await summary(`Fail closed: ${error.message}`); process.exitCode = 1; });
