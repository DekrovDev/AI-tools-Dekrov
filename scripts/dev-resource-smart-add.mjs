#!/usr/bin/env node
// Deterministic Smart Add for Dev Resources. It reads only the official page
// title/description and deliberately leaves every uncertain field empty.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { firstMeta, firstTitle, safeFetch, slugify } from "./analyzer.mjs";
import { buildDevResourceCandidate, buildDevResourceSubmissionBody } from "../assets/js/dev-resource-submission.js";
import { findDevResourceDuplicates, looksLikeDevResourceSmartAdd } from "../.github/scripts/dev-resource-submission-lib.mjs";
import { parseSmartAddSubmission } from "../.github/scripts/submission-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export function devResourceNameFromPage(title, domain) {
  const cleaned = String(title || "").split(/\s+[|—–-]\s+/)[0].trim();
  return cleaned || domain.replace(/^www\./, "");
}

// Page metadata is untrusted. Keep analysis comments readable plain text and
// prevent mention/Markdown control characters from changing their meaning.
export function safeDevResourceCommentText(value, maxLength = 500) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/@/g, "@\u200b")
    .replace(/[\\`*_{}\[\]<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function buildDevResourceAnalysisComment({ resource, duplicates, error = "" }) {
  if (error) return ["### Dev Resource Smart Add", "", `The resource URL could not be analyzed: **${safeDevResourceCommentText(error, 240)}**`, "", "Check that it is a public official http(s) website. This issue was not converted."].join("\n");
  const safeResource = { ...resource, name: safeDevResourceCommentText(resource.name, 120), description: safeDevResourceCommentText(resource.description, 500) };
  return [
    "### Dev Resource Smart Add", "", `**${safeResource.name}**`, `Category: ${safeResource.category}`,
    `Website: ${safeResource.url}`, "", "Only page title and description were used. Unknown metadata was intentionally left blank.", "",
    "Potential duplicates:", ...(duplicates.length ? duplicates.map((item) => `- ${item.id}: ${item.reasons.join(", ")}`) : ["- none"]), "",
    "```json", JSON.stringify(safeResource, null, 2), "```"
  ].join("\n");
}

export async function runDevResourceSmartAdd({ title, body, resources = [], fetchImpl }) {
  if (!looksLikeDevResourceSmartAdd(title, body)) return { skip: true };
  const { toolUrl: resourceUrl, context } = parseSmartAddSubmission(body.replace("### Resource URL", "### Tool URL"));
  try {
    const page = await safeFetch(resourceUrl, { fetchOnce: fetchImpl });
    const domain = new URL(page.url).hostname;
    const name = devResourceNameFromPage(firstTitle(page.text), domain);
    const resource = buildDevResourceCandidate({
      name,
      category: "other",
      description: firstMeta(page.text, ["description", "og:description"]),
      url: page.url,
      tags: [], tech: [], pricing: "", openSource: false, noSignup: false, copyable: false
    });
    // A title-less page still gets a deterministic domain-derived id; no LLM
    // and no speculative classification is involved.
    resource.id = slugify(name || domain);
    const duplicates = findDevResourceDuplicates(resource, resources);
    const hasIssues = !resource.id || duplicates.length > 0;
    return {
      skip: false, convert: true, title: `[Dev Resource] ${resource.name}`,
      labels: ["dev-resource-submission", hasIssues ? "needs-changes" : "pending"],
      canonicalBody: buildDevResourceSubmissionBody(resource, context),
      comment: buildDevResourceAnalysisComment({ resource, duplicates }), resource, duplicates
    };
  } catch (error) {
    return { skip: false, convert: false, labels: [], comment: buildDevResourceAnalysisComment({ error: error.message }) };
  }
}

function parseArgs(argv) { return Object.fromEntries(argv.reduce((pairs, value, index, values) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), values[index + 1]]] : pairs, [])); }
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const event = JSON.parse(await readFile(args.event, "utf8"));
  const source = JSON.parse(await readFile(path.join(scriptDir, "../data/dev-resources.json"), "utf8"));
  const result = await runDevResourceSmartAdd({ title: event.issue.title, body: event.issue.body || "", resources: source.resources || [] });
  await writeFile(args.output, JSON.stringify(result, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main().catch((error) => { console.error(error); process.exitCode = 1; });
