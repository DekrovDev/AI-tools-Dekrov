#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const toolsPath = path.resolve(scriptDir, "../data/tools.json");
const schemaPath = path.resolve(scriptDir, "../data/tool-schema.json");
const toolSchema = JSON.parse(await readFile(schemaPath, "utf8"));
const CATEGORY_IDS = toolSchema.properties.category.enum;
const PRICING_IDS = toolSchema.properties.pricing.enum;

if (["--help", "-h"].includes(process.argv[2])) {
  console.log("Usage: npm run add-tool -- <url>");
  console.log("Downloads public page metadata, shows a preview, then adds the confirmed tool to data/tools.json.");
  process.exit(0);
}

const target = toHttpUrl(process.argv[2]);
if (!target) {
  console.error("Pass one complete http(s) URL. Example: npm run add-tool -- https://example.com");
  process.exit(1);
}

const rl = createInterface({ input, output });

try {
  console.log(`\nAnalyzing ${target.href} ...\n`);
  const html = await download(target.href);
  const extracted = extractTool(target, html);
  const tool = await completeTool(extracted);
  console.log("\nPreview:\n");
  console.log(JSON.stringify(tool, null, 2));
  const confirm = (await rl.question("\nAdd this tool to data/tools.json? [y/N] ")).trim().toLowerCase();
  if (!["y", "yes"].includes(confirm)) {
    console.log("Nothing was written.");
    process.exit(0);
  }
  await appendTool(tool);
  console.log(`Added: ${tool.name} (${tool.id})`);
} catch (error) {
  console.error(`Importer failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}

function toHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

async function download(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "AI-Dekrov local importer/1.0 (+https://dekrov.com)" },
    signal: AbortSignal.timeout(20_000),
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) throw new Error(`Expected an HTML page, got ${type || "unknown content"}`);
  return response.text();
}

function parseAttributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const key = match[1].toLowerCase();
    if (key === "meta" || key === "link" || key === "a") continue;
    attrs[key] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function decodeHtml(value = "") {
  return value.replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).trim();
}

function stripHtml(value = "") {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function firstMeta(html, names) {
  const wanted = names.map((name) => name.toLowerCase());
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if (wanted.includes((attrs.property || attrs.name || attrs.itemprop || "").toLowerCase()) && attrs.content) return stripHtml(attrs.content);
  }
  return "";
}

function firstTitle(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : "";
}

function absoluteUrl(value, base) {
  try { return new URL(value, base).href; } catch { return ""; }
}

function firstFavicon(html, base) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if (/(^|\s)(shortcut )?icon(\s|$)|apple-touch-icon/i.test(attrs.rel || "") && attrs.href) {
      const candidate = absoluteUrl(attrs.href, base);
      if (/^https?:/i.test(candidate)) return candidate;
    }
  }
  return new URL("/favicon.ico", base).href;
}

function findLinks(html, base) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = absoluteUrl(match[1] ?? match[2] ?? match[3], base);
    if (href) links.push({ href, text: stripHtml(match[4]).toLowerCase() });
  }
  return links;
}

function extractCodeBlocks(html) {
  return [...html.matchAll(/<(?:pre|code)\b[^>]*>([\s\S]*?)<\/(?:pre|code)>/gi)].map((match) => stripHtml(match[1])).filter((value) => value && value.length < 240);
}

function getInstallCommand(codes) {
  return codes.find((code) => /\b(?:npm|pnpm|yarn|bun|pipx?|uv tool|brew|cargo|go)\s+(?:install|add|get)\b/i.test(code)) || "";
}

function getStartCommand(html) {
  const usage = html.match(/(?:usage|quickstart|quick start|get started)[\s\S]{0,1800}/i)?.[0] || "";
  const candidates = extractCodeBlocks(usage);
  return candidates.find((command) => !/\b(?:npm|pnpm|yarn|bun|pipx?|brew|cargo|go)\s+(?:install|add|get)\b/i.test(command) && /^[a-z][\w.-]*(?:\s+(?:--?[\w-]+|[\w./:-]+))*$/i.test(command)) || "";
}

function detectPlatforms(text) {
  const content = text.toLowerCase();
  const platforms = [];
  if (/\b(vs\s?code|visual studio code)\b/.test(content)) platforms.push("vscode");
  if (/\b(cli|command[- ]line|terminal)\b|\b(?:npm|pnpm|pip|brew|cargo) install\b/.test(content)) platforms.push("cli");
  if (/\b(desktop app|desktop application|download for (mac|windows|linux)|windows app|mac app)\b/.test(content)) platforms.push("desktop");
  if (/\b(mobile app|ios app|android app|iphone|ipad|google play|app store)\b/.test(content)) platforms.push("mobile");
  if (/\b(browser extension|chrome extension|firefox add-?on|edge add-?on|safari extension)\b/.test(content)) platforms.push("browser-extension");
  if (/\b(api reference|developer api|rest api|graphql api)\b/.test(content)) platforms.push("api");
  if (/\b(web app|in your browser|sign in|try online)\b/.test(content)) platforms.push("web");
  return platforms;
}

function detectTags(text, platforms) {
  const definitions = [["coding", /\b(coding|codebase|programming|developer)\b/], ["agent", /\b(agent|autonomous)\b/], ["research", /\b(research|paper|citation)\b/], ["audio", /\b(audio|voice|speech)\b/], ["llm", /\b(llm|language model)\b/], ["open-source", /\bopen source\b/]];
  return [...new Set([...platforms, ...definitions.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag)])];
}

function friendlyName(value, domain) {
  const cleaned = value.replace(/\s+[|–—-]\s+[^|–—-]+$/, "").trim();
  return cleaned || domain.split(".")[0];
}

function slugify(value) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tool"; }

function extractTool(url, html) {
  const domain = url.hostname.replace(/^www\./, "");
  const canonical = absoluteUrl(firstMeta(html, ["og:url"]), url.href) || url.href;
  const title = firstMeta(html, ["og:site_name", "og:title", "twitter:title"]) || firstTitle(html);
  const description = firstMeta(html, ["description", "og:description", "twitter:description"]);
  const links = findLinks(html, url.href);
  const github = links.find((link) => new URL(link.href).hostname === "github.com")?.href || "";
  const docs = links.find((link) => /docs?|documentation|guides?/i.test(`${link.href} ${link.text}`))?.href || "";
  const codes = extractCodeBlocks(html);
  const platforms = detectPlatforms(`${title} ${description} ${stripHtml(html)}`);
  return { id: slugify(friendlyName(title, domain)), name: friendlyName(title, domain), category: "other", description, url: canonical, domain, favicon: firstFavicon(html, url.href), platforms, pricing: "", priceDetails: "", tags: detectTags(`${title} ${description} ${stripHtml(html)}`, platforms), install: getInstallCommand(codes), start: getStartCommand(html), commands: [], models: [], github, docs };
}

async function completeTool(tool) {
  console.log("Found metadata (leave a prompt blank to keep its current value):");
  tool.category = await choose("Category", tool.category, CATEGORY_IDS);
  tool.pricing = await choose("Pricing", tool.pricing, PRICING_IDS);
  tool.priceDetails = await ask("Price details", tool.priceDetails);
  tool.tags = splitList(await ask("Tags", tool.tags.join(", ")));
  return tool;
}

async function ask(label, current) {
  const answer = await rl.question(`${label}${current ? ` [${current}]` : ""}: `);
  return answer.trim() || current;
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
  tool.lastVerifiedAt = "";
  tool.sources = [...new Set([tool.url, tool.github, tool.docs].filter(Boolean))];
  tools.push(tool);
  await writeFile(toolsPath, `${JSON.stringify(tools, null, 2)}\n`, "utf8");
}
