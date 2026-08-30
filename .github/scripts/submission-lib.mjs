import { readFile } from "node:fs/promises";

export async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
export function canonicalUrl(value = "") {
  try {
    const url = new URL(value);
    // Only http(s) counts as a usable URL; anything else (javascript:, data:,
    // ftp:, file:, mailto:, ...) must not pass backend validation.
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.href;
  } catch {
    return "";
  }
}
export function domainFromUrl(value = "") { try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } }
export function section(body = "", label) {
  const header = `### ${label}`;
  const lines = String(body || "").replace(/\r\n/g, "\n").split("\n");
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === header) { start = index; break; }
  }
  if (start === -1) return "";
  const content = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    // A line starting with "### " begins another section. Stop here so an
    // empty section never swallows the next section's header or content.
    if (/^### /.test(lines[index])) break;
    content.push(lines[index]);
  }
  return content.join("\n").trim();
}
export function emptyResponse(value) { return /^_?no response_?$/i.test(value.trim()) ? "" : value.trim(); }
export function parseIssueSubmission(body) {
  const json = emptyResponse(section(body, "Tool JSON")).replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  return { type: emptyResponse(section(body, "Submission type")).toLowerCase(), existingToolId: emptyResponse(section(body, "Existing tool ID")), json };
}
// Parses a Smart Add issue (see smart-add.yml). Fields are rendered as
// Markdown sections in the issue body using the same mechanism as the
// canonical tool-submission form.
export function parseSmartAddSubmission(body) {
  return {
    toolUrl: emptyResponse(section(body, "Tool URL")),
    context: emptyResponse(section(body, "Context"))
  };
}
// Whether an issue looks like a Smart Add request (no manual label required).
export function looksLikeSmartAdd(title = "", body = "") {
  const t = (title || "").trim();
  const b = body || "";
  return t.startsWith("[Smart Add]") || /### Tool URL/.test(b);
}
// Whether an issue body contains a canonical tool submission (### Tool JSON).
// Lets the validation workflow run on a fresh repository where the custom
// labels may not exist yet (issue forms cannot apply missing labels).
export function looksLikeSubmission(body = "") {
  return /### Tool JSON/.test(body || "");
}
// Parses the optional machine-readable verification block that Smart Add
// embeds so the approval step can carry lastVerifiedAt/sources forward.
export function parseVerifiedMetadata(body = "") {
  const raw = section(body, "Verified metadata");
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const meta = {};
  if (typeof data.lastVerifiedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.lastVerifiedAt)) meta.lastVerifiedAt = data.lastVerifiedAt;
  if (Array.isArray(data.sources)) {
    meta.sources = [...new Set(data.sources.filter((value) => typeof value === "string" && canonicalUrl(value)))].slice(0, 20);
  }
  return Object.keys(meta).length ? meta : null;
}
// Verified metadata is delivered in a bot-created issue comment (marker
// ai-dekrov-verified-metadata), never in the user-editable issue body, so
// contributors cannot spoof lastVerifiedAt or sources. This parses that
// comment; returns null for anything that does not look like it.
export function parseVerifiedComment(commentBody = "") {
  if (!(commentBody || "").includes("ai-dekrov-verified-metadata")) return null;
  const match = commentBody.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (!match) return null;
  return parseVerifiedMetadata(`### Verified metadata\n${match[1]}`);
}
// Only comments authored by the GitHub Actions bot count as verification
// metadata. User-created comments that happen to carry the same marker (or
// spoof its JSON) must be ignored.
export function verifiedMetadataFromComments(comments = []) {
  for (const comment of comments) {
    if (!comment || !comment.user) continue;
    if (comment.user.login !== "github-actions[bot]" || comment.user.type !== "Bot") continue;
    const meta = parseVerifiedComment(comment.body || "");
    if (meta) return meta;
  }
  return null;
}
export function normalizeName(value = "") { return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
export function isSimilarName(a, b) { const first = normalizeName(a); const second = normalizeName(b); if (!first || !second) return false; if (first === second || first.includes(second) || second.includes(first)) return true; const left = new Set(first.split(" ")); const right = new Set(second.split(" ")); const common = [...left].filter((word) => right.has(word)).length; return common / Math.max(left.size, right.size) >= 0.8; }

export function validateTool(raw, schema) {
  const errors = []; if (!raw || Array.isArray(raw) || typeof raw !== "object") return { errors: ["Tool JSON must be one object."], tool: null };
  const generated = new Set(schema.generated || []); const allowed = Object.keys(schema.properties).filter((key) => !generated.has(key)); const unknown = Object.keys(raw).filter((key) => !allowed.includes(key)); if (unknown.length) errors.push(`Unsupported fields: ${unknown.join(", ")}.`);
  const string = (key) => typeof raw[key] === "string" ? raw[key].trim() : raw[key] == null ? "" : (errors.push(`${key} must be a string.`), "");
  const list = (key) => { if (raw[key] == null) return []; if (!Array.isArray(raw[key])) { errors.push(`${key} must be an array.`); return []; } if (raw[key].some((item) => typeof item !== "string")) errors.push(`${key} must contain strings only.`); return raw[key].filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean); };
  const id = string("id"); const name = string("name"); const category = string("category"); const pricing = string("pricing"); const url = string("url");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) errors.push("id must be kebab-case."); if (!name) errors.push("name is required."); if (!schema.properties.category.enum.includes(category)) errors.push("category is invalid."); if (pricing && !schema.properties.pricing.enum.includes(pricing)) errors.push("pricing is invalid."); if (!canonicalUrl(url)) errors.push("url must be a valid http(s) URL.");
  const platforms = list("platforms"); const invalidPlatforms = platforms.filter((item) => !schema.properties.platforms.items.enum.includes(item)); if (invalidPlatforms.length) errors.push(`Invalid platforms: ${invalidPlatforms.join(", ")}.`);
  const validUrl = (key) => { const value = string(key); if (value && !canonicalUrl(value)) errors.push(`${key} must be a valid URL.`); return value; };
  const commands = raw.commands == null ? [] : Array.isArray(raw.commands) ? raw.commands.filter((item) => item && typeof item.label === "string" && typeof item.command === "string").map((item) => ({ label: item.label.trim(), command: item.command.trim() })) : (errors.push("commands must be an array."), []); if (Array.isArray(raw.commands) && commands.length !== raw.commands.length) errors.push("Each command requires label and command strings.");
  const tool = { id, name, category, description: string("description"), bestFor: list("bestFor"), strengths: list("strengths"), gettingStarted: list("gettingStarted"), usageNotes: list("usageNotes"), url: canonicalUrl(url), domain: string("domain") || domainFromUrl(url), favicon: validUrl("favicon"), platforms, pricing, priceDetails: string("priceDetails"), tags: list("tags"), install: string("install"), start: string("start"), commands, models: list("models"), github: validUrl("github"), docs: validUrl("docs") };
  return { errors, tool: errors.length ? null : tool };
}

// Hosting, marketplace and package-registry hosts that legitimately host many
// unrelated tools (github.com, huggingface.co, npmjs.com, app stores, ...).
// Two entries sharing one of these on domain alone must not be flagged as
// duplicates, while two products owned by the same domain (cursor.com ==
// cursor.com) still look suspicious.
const SHARED_HOSTS = new Set([
  "github.com", "gitlab.com", "bitbucket.org", "huggingface.co",
  "npmjs.com", "pypi.org", "crates.io", "marketplace.visualstudio.com",
  "microsoft.com", "apps.apple.com", "play.google.com", "chrome.google.com",
  "sites.google.com", "medium.com", "substack.com", "wordpress.com"
]);
export function isSharedHost(domain = "") {
  const host = String(domain).trim().toLowerCase();
  if (SHARED_HOSTS.has(host)) return true;
  return host.startsWith("www.") && SHARED_HOSTS.has(host.slice(4));
}
export function findDuplicates(tool, tools, excludeId = "") { return tools.filter((existing) => existing.id !== excludeId).flatMap((existing) => { const reasons = []; if (existing.id === tool.id) reasons.push("same id"); if (canonicalUrl(existing.url) === canonicalUrl(tool.url)) reasons.push("same canonical URL"); if (existing.domain && tool.domain && existing.domain.toLowerCase() === tool.domain.toLowerCase() && !isSharedHost(existing.domain)) reasons.push("same domain"); if (isSimilarName(existing.name, tool.name)) reasons.push("very similar name"); return reasons.length ? [{ id: existing.id, name: existing.name, reasons }] : []; }); }
