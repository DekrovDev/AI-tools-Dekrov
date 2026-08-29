#!/usr/bin/env node

// Local owner importer. Runs a shared analyzer over a public page, lets the
// user review/complete the fields, then writes the confirmed tool straight to
// data/tools.json. Analysis comes from scripts/analyzer.mjs.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { analyzeTool, loadSchema, assertPublicHttpUrl } from "./analyzer.mjs";

let rl = null;
let pipedAnswers = null;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const toolsPath = path.resolve(scriptDir, "../data/tools.json");

if (["--help", "-h"].includes(process.argv[2])) {
  console.log("Usage: npm run add-tool -- <url>");
  console.log("Downloads public page metadata, shows a preview, then adds the confirmed tool to data/tools.json.");
  process.exit(0);
}

const target = process.argv[2] ? assertPublicHttpUrl(process.argv[2])?.href : "";
if (!target) {
  console.error("Pass one complete http(s) URL. Example: npm run add-tool -- https://example.com");
  process.exit(1);
}

try {
  console.log(`\nAnalyzing ${target} ...\n`);
  const { tool, warnings } = await analyzeTool({ url: target });
  if (warnings.length) warnings.forEach((warning) => console.log(`  ! ${warning}`));
  await initPrompts();
  const completed = await completeTool(tool);
  console.log("\nPreview:\n");
  console.log(JSON.stringify(completed, null, 2));
  const confirm = (await askRaw("\nAdd this tool to data/tools.json? [y/N] ")).toLowerCase();
  if (!["y", "yes"].includes(confirm)) {
    console.log("Nothing was written.");
    process.exit(0);
  }
  await appendTool(completed);
  console.log(`Added: ${completed.name} (${completed.id})`);
} catch (error) {
  console.error(`Importer failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl?.close();
}

async function completeTool(tool) {
  const schema = await loadSchema();
  const categories = schema.properties.category.enum;
  const pricing = schema.properties.pricing.enum;
  console.log("Found metadata (leave a prompt blank to keep its current value):");
  tool.category = await choose("Category", tool.category, categories);
  tool.pricing = await choose("Pricing", tool.pricing, pricing);
  tool.priceDetails = await ask("Price details", tool.priceDetails);
  tool.tags = splitList(await ask("Tags", tool.tags.join(", ")));
  return tool;
}

// Piped input (automation) is buffered up front so answers are not lost while
// the page is still being analyzed; a TTY is prompted normally.
async function initPrompts() {
  if (process.stdin.isTTY) {
    rl = createInterface({ input, output });
  } else {
    pipedAnswers = [];
    const reader = createInterface({ input });
    for await (const line of reader) pipedAnswers.push(line);
  }
}

async function askRaw(prompt) {
  if (pipedAnswers) return (pipedAnswers.shift() ?? "").trim();
  return (await rl.question(prompt)).trim();
}

async function ask(label, current) {
  const answer = await askRaw(`${label}${current ? ` [${current}]` : ""}: `);
  return answer || current;
}

async function choose(label, current, valid) {
  while (true) {
    const answer = (await ask(`${label} (${valid.join("/")})`, current)).toLowerCase();
    if (valid.includes(answer)) return answer;
    console.log(`Enter one of: ${valid.join(", ")}.`);
  }
}

function splitList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

async function appendTool(tool) {
  const tools = JSON.parse(await readFile(toolsPath, "utf8"));
  if (!Array.isArray(tools)) throw new Error("data/tools.json must contain an array.");
  const originalId = tool.id;
  let suffix = 2;
  while (tools.some((item) => item.id === tool.id)) tool.id = `${originalId}-${suffix++}`;
  const today = new Date().toISOString().slice(0, 10);
  tool.addedAt = today;
  tool.updatedAt = today;
  tool.lastVerifiedAt = today;
  tool.sources = [...new Set([tool.url, tool.github, tool.docs].filter(Boolean))];
  tools.push(tool);
  await writeFile(toolsPath, `${JSON.stringify(tools, null, 2)}\n`, "utf8");
}