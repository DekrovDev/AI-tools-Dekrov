import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookup as dnsLookup } from "node:dns/promises";
import { parseSetupRecipes, emptySetupRecipes } from "../../assets/js/setup-recipes.js";
import {
  CHECK_CONCURRENCY, MAX_REDIRECTS, REQUEST_TIMEOUT_MS, STALE_AFTER_DAYS,
  actionableFindingsForTool, canonicalCheckUrl, classifyAttemptPair,
  classifyHttpStatus, collectToolCheckTargets, isBlockedHostname, isHttpUrl,
  isIpLiteral, isPrivateAddress, isRedirectStatus
} from "./source-recheck-lib.mjs";

export const SOURCE_RECHECK_HEADERS = Object.freeze({
  "User-Agent": "AI-Dekrov-Source-Recheck/1.0",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1",
  Range: "bytes=0-4095"
});

function clean(value) { return typeof value === "string" ? value.trim() : ""; }
function argsFrom(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    args[key] = inline ?? values[index + 1];
    if (inline == null) index += 1;
  }
  return args;
}

async function discard(response) {
  try { await response?.body?.cancel?.(); } catch { /* No body parsing or retention. */ }
}

export async function validatePublicRequestUrl(value, { lookupImpl = dnsLookup } = {}) {
  const canonical = canonicalCheckUrl(value);
  if (!canonical || !isHttpUrl(canonical)) return { ok: false, classification: "unsafe", reason: "URL is not HTTP(S)." };
  const url = new URL(canonical);
  if (url.username || url.password) return { ok: false, classification: "unsafe", reason: "URL contains credentials." };
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(hostname)) return { ok: false, classification: "unsafe", reason: "Direct IP-literal URLs are blocked." };
  if (isBlockedHostname(hostname)) return { ok: false, classification: "unsafe", reason: "Local/private hostname is blocked." };
  let records;
  try { records = await lookupImpl(hostname, { all: true, verbatim: true }); } catch { return { ok: false, classification: "inconclusive", reason: "DNS lookup failed." }; }
  if (!Array.isArray(records) || records.length === 0) return { ok: false, classification: "inconclusive", reason: "DNS lookup returned no addresses." };
  if (records.some((record) => isPrivateAddress(record?.address))) return { ok: false, classification: "unsafe", reason: "Hostname resolves to a private/local address." };
  return { ok: true, url: canonical };
}

export async function checkOnce(originalUrl, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  let current = originalUrl;
  let redirects = 0;
  while (true) {
    const safe = await validatePublicRequestUrl(current, options);
    if (!safe.ok) return { classification: safe.classification, finalUrl: current, redirects, status: null, reason: safe.reason };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(safe.url, { method: "GET", headers: SOURCE_RECHECK_HEADERS, redirect: "manual", signal: controller.signal });
    } catch (error) {
      clearTimeout(timer);
      return { classification: "inconclusive", finalUrl: safe.url, redirects, status: null, reason: controller.signal.aborted ? "Request timed out." : `Network request failed: ${error?.name || "unknown error"}.` };
    }
    clearTimeout(timer);
    const status = response.status;
    const location = response.headers?.get?.("location") || "";
    await discard(response);
    if (!isRedirectStatus(status)) return { classification: classifyHttpStatus(status), finalUrl: safe.url, redirects, status, reason: "" };
    if (!location) return { classification: "inconclusive", finalUrl: safe.url, redirects, status, reason: "Redirect response had no Location header." };
    if (redirects >= maxRedirects) return { classification: "inconclusive", finalUrl: safe.url, redirects, status, reason: "Redirect limit exceeded." };
    try { current = new URL(location, safe.url).href; } catch { return { classification: "inconclusive", finalUrl: safe.url, redirects, status, reason: "Redirect target is invalid." }; }
    redirects += 1;
  }
}

export async function checkDeclaredUrl(target, options = {}) {
  const first = await checkOnce(target.url, options);
  const second = first.classification === "hard-broken" ? await checkOnce(target.url, options) : null;
  const classification = classifyAttemptPair(first, second);
  const final = second || first;
  return {
    ...target,
    originalUrl: target.url,
    finalUrl: final.finalUrl,
    finalStatus: final.status,
    redirects: final.redirects,
    attempts: [first, ...(second ? [second] : [])].map(({ status, classification: attemptClassification, finalUrl }) => ({ status, classification: attemptClassification, finalUrl })),
    classification,
    reason: classification === "unsafe" ? (first.reason || second?.reason || "") : classification === "inconclusive" ? (second?.reason || first.reason || "") : ""
  };
}

export async function mapBounded(values, limit, work) {
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), values.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await work(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function buildSourceRecheckReport({ tools, setupRecipes = emptySetupRecipes(), toolId = "", now = new Date(), check = checkDeclaredUrl, concurrency = CHECK_CONCURRENCY } = {}) {
  if (!Array.isArray(tools)) throw new Error("data/tools.json must contain an array.");
  const selectedId = clean(toolId);
  const selected = selectedId ? tools.filter((tool) => tool?.id === selectedId) : tools;
  if (selectedId && selected.length !== 1) throw new Error(`Unknown tool_id: ${selectedId}. Use an exact catalog tool ID.`);
  const orderedTools = [...selected].sort((a, b) => clean(a?.id).localeCompare(clean(b?.id)));
  const work = orderedTools.flatMap((tool) => collectToolCheckTargets(tool, setupRecipes?.tools?.[tool.id] || {}).map((target) => ({ toolId: tool.id, target })));
  const checked = await mapBounded(work, concurrency, ({ target }) => check(target));
  const checksByTool = new Map(orderedTools.map((tool) => [tool.id, []]));
  checked.forEach((result, index) => checksByTool.get(work[index].toolId).push(result));
  const reportTools = orderedTools.map((tool) => {
    const result = { id: tool.id, name: tool.name, lastVerifiedAt: typeof tool.lastVerifiedAt === "string" ? tool.lastVerifiedAt : "", checks: checksByTool.get(tool.id) || [] };
    result.actionable = actionableFindingsForTool(result, now);
    return result;
  });
  const counts = { healthy: 0, restricted: 0, broken: 0, inconclusive: 0, unsafe: 0 };
  for (const tool of reportTools) for (const checkResult of tool.checks) if (Object.hasOwn(counts, checkResult.classification)) counts[checkResult.classification] += 1;
  const staleTools = reportTools.filter((tool) => tool.actionable.some((finding) => finding.type === "verification")).length;
  return {
    checkedAt: now.toISOString(),
    policy: { staleAfterDays: STALE_AFTER_DAYS, timeoutMs: REQUEST_TIMEOUT_MS, concurrency: CHECK_CONCURRENCY, maxRedirects: MAX_REDIRECTS },
    toolsChecked: reportTools.length,
    urlsChecked: checked.length,
    tools: reportTools,
    summary: { ...counts, staleTools, actionableTools: reportTools.filter((tool) => tool.actionable.length > 0).length }
  };
}

export async function loadSetupRecipes(setupPath, knownToolIds) {
  try {
    const raw = await readFile(setupPath, "utf8");
    return parseSetupRecipes(JSON.parse(raw), knownToolIds);
  } catch (error) {
    if (error?.code === "ENOENT") return emptySetupRecipes();
    throw new Error(`data/setup-recipes.json is invalid: ${error.message}`);
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = argsFrom(argv);
  if (!args.output) throw new Error("Pass --output <path>.");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const tools = JSON.parse(await readFile(path.join(root, "data/tools.json"), "utf8"));
  const knownIds = new Set(Array.isArray(tools) ? tools.map((tool) => tool.id) : []);
  const setupRecipes = await loadSetupRecipes(path.join(root, "data/setup-recipes.json"), knownIds);
  const report = await buildSourceRecheckReport({ tools, setupRecipes, toolId: args.tool || "" });
  await writeFile(args.output, JSON.stringify(report, null, 2));
  return report;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  runCli().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
