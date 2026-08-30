#!/usr/bin/env node

// Smart Add GitHub Action script. Reads the triggering issue from the GitHub
// event file, decides whether it is a Smart Add request, runs the shared
// analyzer, optionally enriches with an external LLM (trusted actors only),
// validates the candidate against the existing schema, checks duplicates, then
// produces an analysis comment and a canonical tool-submission body. The
// workflow performs the actual GitHub API updates from the written result JSON.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeTool, loadSchema, stripHtml } from "./analyzer.mjs";
import { validateTool, findDuplicates, looksLikeSmartAdd } from "../.github/scripts/submission-lib.mjs";
import { enrichWithLLM, applyEnrichment, buildVerifiedMetadata, buildVerifiedComment } from "./ai-enrichment.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const toolsPath = path.join(scriptDir, "../data/tools.json");

const TRUSTED_ASSOCIATIONS = ["OWNER", "MEMBER", "COLLABORATOR"];

// ---------------------------------------------------------------------------
// Pure helpers (importable for tests)
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      args[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      args[arg.slice(2)] = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return args;
}

export function buildCanonicalBody(tool, context) {
  const json = JSON.stringify(tool, null, 2);
  return [
    "### Submission type",
    "new",
    "",
    "### Existing tool ID",
    "_No response_",
    "",
    "### Tool JSON",
    json,
    "",
    "### Context",
    context ? context : "_No response_"
  ].join("\n");
}

// Rich enrichment and verified-metadata helpers are shared with the moderator
// AI enrichment flow (scripts/ai-enrichment.mjs) and re-exported here so the
// existing Smart Add call sites and tests keep working.
export { enrichWithLLM, applyEnrichment, buildVerifiedMetadata, buildVerifiedComment } from "./ai-enrichment.mjs";

export function foundList(tool, pages) {
  const kinds = pages.map((page) => page.kind);
  const badges = [];
  if (tool.url) badges.push("Official website");
  if (tool.docs) badges.push("Documentation");
  if (tool.github) badges.push("GitHub");
  if (kinds.includes("pricing")) badges.push("Pricing page");
  if (tool.install) badges.push("Install command");
  if (tool.start) badges.push("Start command");
  if (tool.platforms.length) badges.push(`Platforms: ${tool.platforms.join(" · ")}`);
  return badges;
}

export function buildAnalysisComment({ tool, warnings, duplicates, errors, pages, context }) {
  const lines = [];
  lines.push("### Smart Add analysis");
  lines.push("");
  lines.push(`**${tool.name}**`);
  lines.push(`Category: ${tool.category}`);
  lines.push(`Platforms: ${tool.platforms.length ? tool.platforms.join(" · ") : "unspecified"}`);
  lines.push(`Pricing: ${tool.pricing || "not specified"}`);
  if (context) lines.push(`Context: ${context.slice(0, 240)}`);
  lines.push("");
  const found = foundList(tool, pages);
  lines.push("Found:");
  lines.push(...(found.length ? found.map((item) => `- ${item}`) : ["- basic page only"]));
  lines.push("");
  if (warnings.length) {
    lines.push("Warnings:");
    lines.push(...warnings.map((warning) => `- ${warning}`));
    lines.push("");
  }
  if (errors.length) {
    lines.push("Validation:");
    lines.push(...errors.map((error) => `- ${error}`));
    lines.push("");
  }
  lines.push("Potential duplicates:");
  lines.push(
    ...(duplicates.length
      ? duplicates.map((item) => `- ${item.id}: ${item.reasons.join(", ")}`)
      : ["- none"])
  );
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(tool, null, 2));
  lines.push("```");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runSmartAdd({ title, body, authorAssociation, tools, schema, env = {}, fetchImpl }) {
  if (!looksLikeSmartAdd(title, body)) {
    return { skip: true };
  }

  const context = extractSection(body, "Context");
  let analysis;
  try {
    analysis = await analyzeTool({ url: extractSection(body, "Tool URL"), context, fetchImpl });
  } catch (error) {
    return {
      skip: false,
      convert: false,
      comment: [
        "### Smart Add analysis",
        "",
        `The tool URL could not be analyzed: **${error.message}**`,
        "",
        "Check that the URL is a public http(s) address. This issue was not converted into a submission."
      ].join("\n"),
      labels: []
    };
  }

  const { tool, warnings, pages, modelCandidates } = analysis;

  // Optional AI enrichment: trusted actors only, and only when a provider is configured.
  // The deterministic candidate keeps `models: []` (regex matches are unverified
  // candidates); the candidates are handed to the AI purely as leads so it can
  // decide which are genuinely supported before anything lands in `models`.
  let candidate = tool;
  const trusted = TRUSTED_ASSOCIATIONS.includes(authorAssociation || "");
  if (trusted && env.AI_PROVIDER_BASE_URL && env.AI_API_KEY && env.AI_MODEL) {
    const evidence = pages.map((page) => stripHtml(page.text || "")).join(" ");
    const enriched = await enrichWithLLM({
      candidate: tool,
      schema,
      evidence,
      context,
      modelHints: modelCandidates,
      baseUrl: env.AI_PROVIDER_BASE_URL,
      apiKey: env.AI_API_KEY,
      model: env.AI_MODEL
    });
    // Never trust LLM output directly: keep it only when it still validates.
    if (enriched !== tool && !validateTool(enriched, schema).errors.length) candidate = enriched;
  }

  const checked = validateTool(candidate, schema);
  const duplicates = checked.tool ? findDuplicates(checked.tool, tools) : [];
  const errors = checked.errors;
  const today = new Date().toISOString().slice(0, 10);
  const verified = buildVerifiedMetadata(pages, today);
  const canonicalBody = buildCanonicalBody(checked.tool || candidate, context);
  const hasIssues = errors.length > 0 || duplicates.length > 0;
  const comment = buildAnalysisComment({ tool: checked.tool || candidate, warnings, duplicates, errors, pages, context });

  return {
    skip: false,
    convert: true,
    comment,
    canonicalBody,
    verifiedComment: buildVerifiedComment(verified),
    title: `[Tool] ${candidate.name}`,
    labels: ["tool-submission", hasIssues ? "needs-changes" : "pending"],
    errors,
    duplicates,
    warnings,
    tool: checked.tool || candidate
  };
}

function extractSection(body = "", label) {
  const header = `### ${label}`;
  const start = body.indexOf(header);
  if (start === -1) return "";
  const afterHeader = body.slice(start + header.length).replace(/^\s*\r?\n/, "");
  const nextHeader = afterHeader.search(/\r?\n### /);
  const value = (nextHeader === -1 ? afterHeader : afterHeader.slice(0, nextHeader)).trim();
  return /^_?no response_?$/i.test(value) ? "" : value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const event = JSON.parse(await readFile(args.event, "utf8"));
  const tools = JSON.parse(await readFile(toolsPath, "utf8"));
  const schema = await loadSchema();
  const result = await runSmartAdd({
    title: event.issue.title,
    body: event.issue.body || "",
    authorAssociation: event.issue.author_association || "",
    tools,
    schema,
    env: process.env
  });
  await writeFile(args.output, JSON.stringify(result, null, 2));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}