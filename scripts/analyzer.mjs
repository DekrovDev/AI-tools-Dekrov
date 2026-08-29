#!/usr/bin/env node

// Shared analysis core for the local importer (scripts/add-tool.mjs) and the
// Smart Add GitHub Action (scripts/smart-add.mjs). Nothing here talks to
// GitHub or modifies data/tools.json — it downloads public pages, extracts a
// conservative tool candidate, and returns it for the caller to validate.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";
import { BlockList, isIP } from "node:net";
import http from "node:http";
import https from "node:https";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(scriptDir, "../data/tool-schema.json");

const DEFAULT_USER_AGENT = "AI-Dekrov Smart Add/1.0 (+https://dekrov.com)";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_TOTAL_PAGES = 4; // homepage + up to 3 official pages

const blocklist = new BlockList();
// IPv4
blocklist.addSubnet("0.0.0.0", 8, "ipv4");
blocklist.addSubnet("10.0.0.0", 8, "ipv4");
blocklist.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT
blocklist.addSubnet("127.0.0.0", 8, "ipv4"); // loopback
blocklist.addSubnet("169.254.0.0", 16, "ipv4"); // link-local + cloud metadata
blocklist.addSubnet("172.16.0.0", 12, "ipv4"); // private
blocklist.addSubnet("192.168.0.0", 16, "ipv4"); // private
blocklist.addSubnet("192.0.0.0", 24, "ipv4");
blocklist.addSubnet("192.0.2.0", 24, "ipv4"); // TEST-NET-1
blocklist.addSubnet("198.18.0.0", 15, "ipv4"); // benchmarking
blocklist.addSubnet("198.51.100.0", 24, "ipv4"); // TEST-NET-2
blocklist.addSubnet("203.0.113.0", 24, "ipv4"); // TEST-NET-3
blocklist.addSubnet("224.0.0.0", 4, "ipv4"); // multicast
blocklist.addSubnet("240.0.0.0", 4, "ipv4"); // reserved
// IPv6
blocklist.addSubnet("::", 128, "ipv6"); // unspecified
blocklist.addSubnet("::1", 128, "ipv6"); // loopback
blocklist.addSubnet("fc00::", 7, "ipv6"); // unique-local
blocklist.addSubnet("fe80::", 10, "ipv6"); // link-local
blocklist.addSubnet("ff00::", 8, "ipv6"); // multicast
blocklist.addSubnet("2001:db8::", 32, "ipv6"); // documentation

// Decides whether an IP address must never be connected to.
export function isIpBlocked(address, family = 4) {
  if (typeof address !== "string" || !address) return true;
  // Guard against IPv4-mapped IPv6 forms (::ffff:a.b.c.d).
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isIpBlocked(mapped[1], 4);
  try {
    return blocklist.check(address, family === 6 ? "ipv6" : "ipv4");
  } catch {
    return true; // unparseable address is not allowed
  }
}

export function assertPublicHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Tool URL is not a valid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http(s) URLs are allowed.");
  if (url.username || url.password) throw new Error("Tool URL must not contain credentials.");
  if (!url.hostname) throw new Error("Tool URL must include a hostname.");
  return url;
}

// Per-request guard: shape + obvious unsafe hostnames + literal-IP ranges.
// Hostnames that need DNS resolution are additionally enforced at connection
// time inside safeLookup, which is what actually pins the connection address.
export function assertSafeRequestUrl(value) {
  const url = assertPublicHttpUrl(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host.toLowerCase() === "localhost") throw new Error("Blocked host: localhost.");
  const family = isIP(host);
  if (family && isIpBlocked(host, family === 6 ? 6 : 4)) throw new Error(`Blocked address: ${host}.`);
  return url;
}

function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error);
    const allowed = addresses.filter(({ address, family }) => !isIpBlocked(address, family));
    if (!allowed.length) {
      const blocked = new Error(`Refusing to connect: all addresses for "${hostname}" are blocked.`);
      blocked.code = "ERR_BLOCKED_ADDRESS";
      return callback(blocked);
    }
    // Node's autoSelectFamily (default in modern Node) asks for all addresses.
    if (options?.all) return callback(null, allowed);
    const v4 = allowed.find(({ family }) => family === 4) || allowed[0];
    callback(null, v4.address, v4.family);
  });
}

function requestOnce(url, { timeout, maxBytes, userAgent }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": userAgent,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "accept-language": "en;q=0.9"
        },
        timeout,
        lookup: safeLookup,
        servername: url.hostname
      },
      (res) => {
        const chunks = [];
        let size = 0;
        let oversized = false;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            oversized = true;
            req.destroy(new Error("Response body is too large."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (oversized) return;
          resolve({
            status: res.statusCode || 0,
            contentType: (res.headers["content-type"] || "").toLowerCase(),
            location: res.headers.location || "",
            text: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Request timed out.")));
    req.on("error", reject);
    req.end();
  });
}

// Downloads a public page with strict guards. Redirects are followed manually
// and every hop re-runs the guarded connection-time lookup for the new host.
export async function safeFetch(rawUrl, options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const userAgent = options.userAgent || DEFAULT_USER_AGENT;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

  const fetchOnce = options.fetchOnce ?? requestOnce;
  let url = assertSafeRequestUrl(rawUrl);
  let redirects = 0;
  while (true) {
    const page = await fetchOnce(url, { timeout, maxBytes, userAgent });
    if ([301, 302, 303, 307, 308].includes(page.status)) {
      if (redirects >= maxRedirects) throw new Error("Too many redirects.");
      if (!page.location) throw new Error("Redirect without a Location header.");
      url = assertSafeRequestUrl(new URL(page.location, url).href); // validated again on every hop
      redirects += 1;
      continue;
    }
    if (page.status < 200 || page.status >= 300) throw new Error(`HTTP status ${page.status}.`);
    if (page.contentType && !/text\/html|application\/xhtml\+xml/.test(page.contentType)) {
      throw new Error(`Expected an HTML page, got "${page.contentType || "unknown"}".`);
    }
    return { status: page.status, url: url.href, text: page.text };
  }
}

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

export function decodeHtml(value = "") {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

export function stripHtml(value = "") {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

function parseTagAttributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const key = match[1].toLowerCase();
    if (key === "meta" || key === "link" || key === "a") continue;
    attrs[key] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function absoluteUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return "";
  }
}

export function firstMeta(html, names) {
  const wanted = names.map((name) => name.toLowerCase());
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseTagAttributes(match[0]);
    if (wanted.includes((attrs.property || attrs.name || attrs.itemprop || "").toLowerCase()) && attrs.content) {
      return stripHtml(attrs.content);
    }
  }
  return "";
}

export function firstTitle(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : "";
}

export function firstFavicon(html, base) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseTagAttributes(match[0]);
    if (/(^|\s)(shortcut )?icon(\s|$)|apple-touch-icon/i.test(attrs.rel || "") && attrs.href) {
      const candidate = absoluteUrl(attrs.href, base);
      if (/^https?:/i.test(candidate)) return candidate;
    }
  }
  return new URL("/favicon.ico", base).href;
}

export function findLinks(html, base) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = absoluteUrl(match[1] ?? match[2] ?? match[3], base);
    if (href) links.push({ href, text: stripHtml(match[4]).toLowerCase() });
  }
  return links;
}

export function extractCodeBlocks(html) {
  return [...html.matchAll(/<(?:pre|code)\b[^>]*>([\s\S]*?)<\/(?:pre|code)>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter((value) => value && value.length < 240);
}

// ---------------------------------------------------------------------------
// Schema access (schema is the single source of truth for enums)
// ---------------------------------------------------------------------------

let cachedSchema = null;
export async function loadSchema() {
  if (!cachedSchema) cachedSchema = JSON.parse(await readFile(schemaPath, "utf8"));
  return cachedSchema;
}

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

export function friendlyName(value, domain) {
  const cleaned = value.replace(/\s+[|–—-]\s+[^|–—-]+$/, "").trim();
  return cleaned || domain.split(".")[0];
}

export function slugify(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tool";
}

function markIf(text, set, key, pattern) {
  if (pattern.test(text)) set.add(key);
}

export function detectPlatforms(text, allowed) {
  const content = text.toLowerCase();
  const platforms = new Set();
  markIf(content, platforms, "vscode", /\b(vs\s?code|visual studio code)\b/);
  markIf(content, platforms, "cli", /\b(cli|command[- ]line|terminal)\b|\b(?:npm|pnpm|pip|pipx|brew|cargo|go|uv tool) (?:install|add|get)\b/);
  markIf(content, platforms, "desktop", /\b(desktop app|desktop application|download for (mac|windows|linux)|windows app|mac app|native app)\b/);
  markIf(content, platforms, "mobile", /\b(mobile app|ios app|android app|iphone|ipad|google play|app store)\b/);
  markIf(content, platforms, "browser-extension", /\b(browser extension|chrome extension|firefox add-?on|edge add-?on|safari extension)\b/);
  markIf(content, platforms, "api", /\b(api reference|developer api|rest api|graphql api|return an? api)\b/);
  markIf(content, platforms, "web", /\b(web app|in your browser|sign in|try online|browser)\b/);
  return [...platforms].filter((platform) => allowed.includes(platform));
}

export function detectCategory(text, allowed) {
  const content = text.toLowerCase();
  const rules = [
    ["coding-agents", /\b(coding agent|coding assistant|code agent|ai agent for coding|codebase navigation|write code)\b/],
    ["orchestration", /\b(orchestrat|multi-agent|agent workflows?|workflow automation|agent team)\b/],
    // research comes before chat-llm so "research assistant" is not swallowed
    // by the generic chat/assistant rule.
    ["research", /\b(research assistant|academic research|literature search|paper[ -]?review|find papers)\b/],
    ["chat-llm", /\b(chatbot|chat (bot|interface|assistant|model)|language model|llm|conversational ai|assistant)\b/],
    ["audio", /\b(audio|voice|speech|transcri|text-to-speech|tts|music generation|podcast)\b/],
    ["dev-tools", /\b(developer tool|sdk|api|middleware|devops|testing framework|observability|code review tool)\b/],
    ["hosting", /\b(hosting|deploy|deployment|infrastructure|serverless|cloud platform|web host)\b/]
  ];
  for (const [category, pattern] of rules) {
    if (pattern.test(content) && allowed.includes(category)) return category;
  }
  return "other";
}

export function detectPricing(homeText, pricingText = "") {
  const all = `${homeText} ${pricingText}`.toLowerCase();
  if (!all) return {};
  // A "free tier" means a permanently free option, not a "free trial": trial
  // wording alone must never turn a paid product into freemium.
  const hasFreeTier =
    /\b(?:free (?:plan|tier|version|forever)|100% free|free for|starts? free|start for free)\b/.test(all) ||
    (/\bfree\b/.test(all) && !/\b(?:free trial|try free|trial)\b/.test(all));
  const hasPaid = /\/month|\/year|per (user|seat|project|month|year)|\$\s?\d+/.test(all) || /\b(paid|pro|business|enterprise) plans?\b/.test(all);
  const usageBased = /\b(pay-as-you-go|pay as you go|per token|per request|per api|usage-based|usage based|metered)\b/.test(all);
  const priceMatch = all.match(/\$\s?\d+(?:\.\d+)?\s*\/\s*(?:month|year|mo|yr)/);
  if (usageBased) return { pricing: "usage-based", priceDetails: priceMatch ? priceMatch[0] : "" };
  if (hasFreeTier && hasPaid) return { pricing: "freemium", priceDetails: priceMatch ? priceMatch[0] : "" };
  if (hasFreeTier && !hasPaid) return { pricing: "free", priceDetails: "" };
  if (hasPaid) return { pricing: "paid", priceDetails: priceMatch ? priceMatch[0] : "Paid plans" };
  return {};
}

export function detectTags(text, allowedPlatforms) {
  const content = text.toLowerCase();
  const tags = new Set();
  const definitions = [
    ["coding", /\b(coding|codebase|programming|developer)\b/],
    ["agent", /\b(agent|autonomous)\b/],
    ["research", /\b(research|paper|citation)\b/],
    ["audio", /\b(audio|voice|speech)\b/],
    ["llm", /\b(llm|language model)\b/],
    ["open-source", /\bopen source\b/]
  ];
  definitions.forEach(([tag, pattern]) => pattern.test(content) && tags.add(tag));
  allowedPlatforms.forEach((platform) => tags.add(platform));
  return [...tags];
}

const MODEL_PATTERN = /\b(gpt-4(?:\.\d+)?o?(?:-mini)?|gpt-5(?:\.\d+)?|claude[- ][0-9a-z.-]+|gemini(?: (?:exp |flash |pro )?)?[0-9.]*|llama[- ][0-9.]+|mistral[- ][a-z0-9.-]+|deepseek[- ][a-z0-9.-]+|qwen\d*(?:-[-a-z0-9]*)?|grok[- ]?[0-9a-z.-]*|sonnet-4[.0-9]*|haiku-[0-9.]+|opus-[0-9.]+)\b/gi;

export function detectModels(text) {
  const matches = text.match(MODEL_PATTERN);
  if (!matches) return [];
  const cleaned = [...new Set(matches.map((value) => value.trim().replace(/\s+/g, "-").toLowerCase()))]
    .filter((value) => value.length <= 40 && /^[a-z0-9.-]+$/.test(value))
    .slice(0, 12);
  return cleaned;
}

function getInstallCommand(codes) {
  return codes.find((code) => /\b(?:npm|pnpm|yarn|bun|pipx?|uv tool|brew|cargo|go)\s+(?:install|add|get)\b/i.test(code)) || "";
}

function getStartCommand(rawText) {
  const usage = rawText.match(/(?:usage|quickstart|quick start|get started|starting|how to run|run locally)[\s\S]{0,1800}/i)?.[0] || "";
  const candidates = extractCodeBlocks(usage);
  return (
    candidates.find(
      (command) =>
        !getInstallCommand([command]) &&
        /^[a-z][\w.-]*(?:\s+(?:--?[\w-]+|[\w./:-]+))*$/i.test(command)
    ) || ""
  );
}

// ---------------------------------------------------------------------------
// Useful-page discovery (bounded)
// ---------------------------------------------------------------------------

export function discoverUsefulLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const links = findLinks(html, base.href);
  const anywhere = (pattern) =>
    links.find(({ href, text }) => pattern.test(`${href} ${text}`) && sameHost(href));
  const sameHost = (hrefValue) => {
    try {
      return new URL(hrefValue).hostname === base.hostname;
    } catch {
      return false;
    }
  };
  const seen = new Set([base.href.replace(/\/$/, "")]);
  const chosen = [];
  const candidates = [
    anywhere(/\/(?:pricing|plans)\b|\bpricing\b|\bplans?\b/),
    anywhere(/\/(?:docs?|documentation|guides?|getting-started|quickstart)\b|\b(?:docs?|documentation|get started|quickstart)\b/),
    anywhere(/\/download\b|\/(?:installation|install|getting-started)\b|\b(download|install)\b/)
  ];
  for (const link of candidates) {
    if (!link) continue;
    const url = new URL(link.href);
    const normalized = url.href.replace(/\/$/, "").toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    chosen.push({ kind: classifyCandidate(url.href), href: url.href });
    if (chosen.length >= MAX_TOTAL_PAGES - 1) break;
  }
  return chosen;

  function classifyCandidate(href) {
    const low = href.toLowerCase();
    if (/\/pricing|\/\?.*pricing|pricing|\/plans/.test(low)) return "pricing";
    if (/\/docs?\/|\/docs?$|\/documentation|\/guides?|\/getting-started|\/quickstart/.test(low)) return "docs";
    return "install";
  }
}

// ---------------------------------------------------------------------------
// Main analysis orchestration
// ---------------------------------------------------------------------------

export async function analyzeTool({ url, context = "", maxPages = MAX_TOTAL_PAGES, fetchImpl = safeFetch }) {
  const startUrl = assertPublicHttpUrl(url);
  const schema = await loadSchema();
  const allowedPlatforms = schema.properties.platforms.items.enum;
  const allowedCategories = schema.properties.category.enum;
  const warnings = [];
  const pages = [];
  const usePage = (pageUrl, kind, text = "") => {
    pages.push({ url: pageUrl, kind, text });
  };

  const homepage = await fetchImpl(startUrl.href);
  const homepageUrl = homepage.url || startUrl.href;
  usePage(homepageUrl, "home", homepage.text);

  const homeTokens = firstMeta(homepage.text, ["og:site_name", "og:title", "twitter:title"]) || firstTitle(homepage.text);
  // Use the FINAL (post-redirect) host for the domain and for the same-host
  // check on additional pages, never the originally entered hostname.
  const domain = new URL(homepageUrl).hostname.replace(/^www\./, "");
  const ogUrl = firstMeta(homepage.text, ["og:url"]);
  const canonical = ogUrl && /^https?:/i.test(ogUrl) ? ogUrl : homepageUrl;

  // Optional official pages (bounded, same host only).
  const usefulLinks = discoverUsefulLinks(homepage.text, homepageUrl).slice(0, maxPages - 1);
  const rawTexts = [homepage.text];
  const pricingTexts = [];
  for (const link of usefulLinks) {
    if (pages.length >= maxPages) break;
    try {
      const page = await fetchImpl(link.href);
      const pageUrl = page.url || link.href;
      if (new URL(pageUrl).hostname.replace(/^www\./, "").toLowerCase() !== domain) continue;
      usePage(pageUrl, link.kind, page.text);
      rawTexts.push(page.text);
      if (link.kind === "pricing") pricingTexts.push(page.text);
    } catch (error) {
      warnings.push(`${link.kind} page could not be fetched (${error.message || "error"}).`);
    }
  }

  const fullHtml = rawTexts.join("\n");
  const fullText = stripHtml(fullHtml);
  const description = firstMeta(homepage.text, ["description", "og:description", "twitter:description"]);
  const links = findLinks(homepage.text, homepageUrl);
  const githubLink = links.find((link) => {
    try {
      return new URL(link.href).hostname === "github.com";
    } catch {
      return false;
    }
  });
  const docsLink = links.find((link) => /docs?|documentation|guides?/i.test(`${link.href} ${link.text}`));
  const codes = rawTexts.flatMap(extractCodeBlocks);

  const name = friendlyName(homeTokens, domain);
  const platforms = detectPlatforms(`${homeTokens} ${description} ${fullText}`, allowedPlatforms);
  const pricingInfo = detectPricing(`${homeTokens} ${description} ${rawTexts[0]}`, pricingTexts.join(" "));
  const tool = {
    id: slugify(name),
    name,
    category: detectCategory(`${homeTokens} ${description} ${fullText}`, allowedCategories),
    description,
    url: canonical,
    domain,
    favicon: firstFavicon(homepage.text, homepageUrl),
    platforms,
    pricing: pricingInfo.pricing || "",
    priceDetails: pricingInfo.priceDetails || "",
    tags: detectTags(`${homeTokens} ${description} ${fullText}`, platforms),
    install: getInstallCommand(codes),
    start: getStartCommand(fullHtml),
    commands: [],
    models: detectModels(fullText),
    github: githubLink?.href || "",
    docs: docsLink?.href || ""
  };

  if (!pricingInfo.pricing) warnings.push("Pricing details could not be determined; left empty.");
  if (!githubLink) warnings.push("No official GitHub repository was found.");
  if (!docsLink) warnings.push("No documentation link was found.");

  const contextOut = (context || "").trim();
  return { tool, warnings, pages, context: contextOut };
}