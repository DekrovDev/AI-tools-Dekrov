import { readFile } from "node:fs/promises";

export async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
export function canonicalUrl(value = "") { try { const url = new URL(value); url.hash = ""; url.search = ""; url.hostname = url.hostname.toLowerCase(); url.pathname = url.pathname.replace(/\/$/, "") || "/"; return url.href; } catch { return ""; } }
export function domainFromUrl(value = "") { try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } }
export function section(body = "", label) {
  const header = `### ${label}`;
  const start = body.indexOf(header);
  if (start === -1) return "";
  const afterHeader = body.slice(start + header.length).replace(/^\s*\r?\n/, "");
  const nextHeader = afterHeader.search(/\r?\n### /);
  return (nextHeader === -1 ? afterHeader : afterHeader.slice(0, nextHeader)).trim();
}
function emptyResponse(value) { return /^_?no response_?$/i.test(value.trim()) ? "" : value.trim(); }
export function parseIssueSubmission(body) {
  const json = emptyResponse(section(body, "Tool JSON")).replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  return { type: emptyResponse(section(body, "Submission type")).toLowerCase(), existingToolId: emptyResponse(section(body, "Existing tool ID")), json };
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
  const tool = { id, name, category, description: string("description"), url: canonicalUrl(url), domain: string("domain") || domainFromUrl(url), favicon: validUrl("favicon"), platforms, pricing, priceDetails: string("priceDetails"), tags: list("tags"), install: string("install"), start: string("start"), commands, models: list("models"), github: validUrl("github"), docs: validUrl("docs") };
  return { errors, tool: errors.length ? null : tool };
}

export function findDuplicates(tool, tools, excludeId = "") { return tools.filter((existing) => existing.id !== excludeId).flatMap((existing) => { const reasons = []; if (existing.id === tool.id) reasons.push("same id"); if (canonicalUrl(existing.url) === canonicalUrl(tool.url)) reasons.push("same canonical URL"); if (existing.domain && existing.domain.toLowerCase() === tool.domain.toLowerCase()) reasons.push("same domain"); if (isSimilarName(existing.name, tool.name)) reasons.push("very similar name"); return reasons.length ? [{ id: existing.id, name: existing.name, reasons }] : []; }); }
