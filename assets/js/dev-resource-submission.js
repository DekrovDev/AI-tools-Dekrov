// Pure Dev Resource submission helpers shared by the browser and Actions.
import { DEV_CATEGORIES, canonicalDevResourceUrl, findDevResourceDuplicates, validateDevResourceSubmission } from "./dev-resources.js";

export { findDevResourceDuplicates, validateDevResourceSubmission };

export function devResourceIdFromName(value = "") {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function buildDevResourceCandidate({ name = "", category = "other", description = "", url = "", favicon = "", tags = [], tech = [], pricing = "", openSource = false, noSignup = false, copyable = false } = {}) {
  return {
    id: devResourceIdFromName(name), name: String(name).trim(), category, description: String(description).trim(),
    url: canonicalDevResourceUrl(url), favicon: canonicalDevResourceUrl(favicon), tags, tech, pricing,
    openSource: openSource === true, noSignup: noSignup === true, copyable: copyable === true
  };
}

export function buildDevResourcePrompt(url = "", context = "") {
  const categories = DEV_CATEGORIES.map((item) => item.id).join(", ");
  return [
    "Create one factual JSON object for the AI-Dekrov Dev Resources catalog.",
    `Official website: ${url || "(unknown)"}`,
    context ? `Contributor context: ${context}` : "Contributor context: (none)",
    "Only include information directly verifiable from the official website. Use empty strings, empty arrays, or false when unknown; do not infer claims.",
    "The entry must be a concrete developer website/resource, not merely a product that developers might use.",
    `category must be one of: ${categories}.`,
    "Return JSON only, with exactly: id, name, category, description, url, favicon, tags, tech, pricing, openSource, noSignup, copyable.",
    "pricing is free, freemium, paid, or an empty string. Do not include addedAt; the approval workflow owns it."
  ].join("\n");
}

export function buildDevResourceSubmissionBody(resource, context = "") {
  return ["### Submission kind", "dev-resource", "", "### Submission type", "new", "", "### Dev Resource JSON", JSON.stringify(resource, null, 2), "", "### Context", context || "_No response_", "", "### Confirmation", "- [x] I confirm this is a factual public developer resource."].join("\n");
}
