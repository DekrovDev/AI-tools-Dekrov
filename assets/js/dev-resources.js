// Pure dev-resources logic: taxonomy, parsing, filtering, and sorting for the
// second AI-Dekrov catalog (useful websites/resources for developers).
// No DOM, no framework. Each resource is an explicit curated data entry.

export const DEV_RESOURCES_PATH = "data/dev-resources.json";

// Single source of truth for the dev-resource category taxonomy. Order here is
// the display order. `id` is stored in data; `label` is shown in the UI.
// `color` feeds the same accent dot/logo tokens the AI catalog uses.
export const DEV_CATEGORIES = [
  { id: "ui-components", label: "UI components", short: "UI", color: "#d2f25b" },
  { id: "templates", label: "Templates", short: "Templates", color: "#ffb26b" },
  { id: "css", label: "CSS & styling", short: "CSS", color: "#8db7ff" },
  { id: "animations", label: "Animations & loaders", short: "Animations", color: "#c2a5ff" },
  { id: "icons-svg", label: "Icons & SVG", short: "Icons", color: "#ffb26b" },
  { id: "design-resources", label: "Colors, fonts & design", short: "Design", color: "#8db7ff" },
  { id: "generators", label: "Generators", short: "Generators", color: "#d2f25b" },
  { id: "snippets", label: "Code snippets", short: "Snippets", color: "#98a0ad" },
  { id: "api-tools", label: "API & testing", short: "API", color: "#ff7777" },
  { id: "data-json", label: "Data & JSON", short: "Data", color: "#c2a5ff" },
  { id: "developer-utilities", label: "Developer utilities", short: "Utilities", color: "#d2f25b" },
  { id: "web-utilities", label: "Web utilities", short: "Web utils", color: "#ffb26b" },
  { id: "other", label: "Other", short: "Other", color: "#98a0ad" }
];

export const DEV_PRICING_VALUES = ["free", "freemium", "paid"];

const DEV_CATEGORY_IDS = new Set(DEV_CATEGORIES.map((category) => category.id));
const DEV_CATEGORY_META = new Map(DEV_CATEGORIES.map((category) => [category.id, category]));

export function devCategoryMeta(category) {
  return DEV_CATEGORY_META.get(category) || { id: "other", label: "Other", short: "Other", color: "#98a0ad" };
}

export function isValidDevResourceId(id) {
  return typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function uniqueStrings(values) {
  return [...new Set(stringList(values))];
}

function httpUrl(value) {
  const textValue = text(value);
  try {
    const url = new URL(textValue);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

// Canonical identity is deliberately limited to the official http(s) URL.
// Query strings and fragments do not describe a distinct catalog resource.
export function canonicalDevResourceUrl(value) {
  const url = httpUrl(value);
  if (!url) return "";
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/$/, "") || "/";
  return url.href;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Maintainer-facing validation for the checked-in data file. Runtime parsing
// remains defensive; this reports every authoring mistake instead of silently
// dropping an entry from the catalog.
export function validateDevResourcesData(raw) {
  const errors = [];
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  if (!source || !Array.isArray(source.resources)) return ["data/dev-resources.json: resources must be an array"];
  const seen = new Set();
  source.resources.forEach((resource, index) => {
    const prefix = `resource ${index}`;
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
      errors.push(`${prefix}: entry must be an object`);
      return;
    }
    const id = text(resource.id);
    const label = id ? `resource ${index} (${id})` : prefix;
    for (const field of ["id", "name", "category", "url"]) {
      if (!text(resource[field])) errors.push(`${label}: ${field} is required`);
    }
    if (id && !isValidDevResourceId(id)) errors.push(`${label}: id must be lowercase kebab-case`);
    if (id && seen.has(id)) errors.push(`${label}: id duplicates an earlier resource`);
    if (id) seen.add(id);
    if (text(resource.category) && !DEV_CATEGORY_IDS.has(text(resource.category))) errors.push(`${label}: category is not in the Dev Resources taxonomy`);
    if (text(resource.url) && !httpUrl(resource.url)) errors.push(`${label}: url must be an http(s) URL`);
    if (resource.description !== undefined && typeof resource.description !== "string") errors.push(`${label}: description must be a string`);
    if (resource.favicon !== undefined && resource.favicon !== "" && (!text(resource.favicon) || !httpUrl(resource.favicon))) errors.push(`${label}: favicon must be an http(s) URL`);
    if (resource.pricing !== undefined && resource.pricing !== "" && !DEV_PRICING_VALUES.includes(resource.pricing)) errors.push(`${label}: pricing must be free, freemium, or paid`);
    for (const field of ["openSource", "noSignup", "copyable"]) {
      if (resource[field] !== undefined && typeof resource[field] !== "boolean") errors.push(`${label}: ${field} must be a boolean`);
    }
    for (const field of ["tags", "tech"]) {
      if (resource[field] !== undefined && (!Array.isArray(resource[field]) || resource[field].some((item) => typeof item !== "string" || !item.trim()))) errors.push(`${label}: ${field} must be an array of non-empty strings`);
    }
    if (resource.addedAt !== undefined && resource.addedAt !== "" && (!text(resource.addedAt) || !validDate(text(resource.addedAt)))) errors.push(`${label}: addedAt must use a real YYYY-MM-DD date`);
  });
  return errors;
}

// Normalize one raw dev-resource entry into a safe plain object, or null when
// the entry cannot represent a resource (missing required fields).
export function normalizeDevResource(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = text(raw.id);
  const name = text(raw.name);
  const category = text(raw.category);
  const url = httpUrl(raw.url);
  if (!isValidDevResourceId(id) || !name || !DEV_CATEGORY_IDS.has(category) || !url) return null;
  // Pricing is a closed enum: absent or "" means unclassified, but an explicit
  // invalid value is a data bug and rejects the entry rather than silently
  // discarding the author's intent.
  if (raw.pricing !== undefined && raw.pricing !== "" && !DEV_PRICING_VALUES.includes(raw.pricing)) return null;
  const domain = text(raw.domain) || url.hostname.replace(/^www\./, "");
  const pricing = DEV_PRICING_VALUES.includes(raw.pricing) ? raw.pricing : "";
  return {
    id,
    name,
    category,
    description: text(raw.description),
    url: url.href,
    domain,
    favicon: httpUrl(raw.favicon)?.href || "",
    tags: uniqueStrings(raw.tags),
    tech: uniqueStrings(raw.tech),
    pricing,
    openSource: raw.openSource === true,
    noSignup: raw.noSignup === true,
    copyable: raw.copyable === true,
    addedAt: text(raw.addedAt) || ""
  };
}

// Submission validation is shared by the browser and GitHub workflows. It is
// intentionally stricter than the defensive runtime parser: contributors get
// precise errors instead of silently losing fields from their submission.
export function validateDevResourceSubmission(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { errors: ["Dev Resource JSON must be one object."], resource: null };
  // This is the public submission contract, intentionally distinct from the
  // checked-in catalog record. `addedAt` is owned by the approval workflow so
  // a contributor cannot control catalog ordering.
  const fields = ["id", "name", "category", "description", "url", "favicon", "tags", "tech", "pricing", "openSource", "noSignup", "copyable"];
  const allowed = new Set(fields);
  const errors = Object.keys(raw).filter((key) => !allowed.has(key)).map((key) => `Unsupported field: ${key}.`);
  for (const field of fields) if (!Object.hasOwn(raw, field)) errors.push(`Missing required field: ${field}.`);
  if (typeof raw.id === "string" && raw.id.length > 80) errors.push("id must be at most 80 characters.");
  if (typeof raw.name === "string" && raw.name.length > 120) errors.push("name must be at most 120 characters.");
  if (typeof raw.description === "string" && raw.description.length > 500) errors.push("description must be at most 500 characters.");
  for (const field of ["url", "favicon"]) if (typeof raw[field] === "string" && raw[field].length > 2048) errors.push(`${field} must be at most 2048 characters.`);
  for (const field of ["tags", "tech"]) {
    if (Array.isArray(raw[field])) {
      if (raw[field].length > 20) errors.push(`${field} must contain at most 20 values.`);
      if (raw[field].some((item) => typeof item === "string" && item.length > 50)) errors.push(`${field} values must be at most 50 characters.`);
    }
  }
  const dataErrors = validateDevResourcesData({ resources: [raw] }).map((error) => error.replace(/^resource 0(?: \([^)]*\))?: /, ""));
  errors.push(...dataErrors);
  const normalized = normalizeDevResource(raw);
  if (!normalized && !errors.length) errors.push("Dev Resource JSON is invalid.");
  // Keep this result in the public submission shape. Derived `domain` and
  // maintainer-owned `addedAt` appear only after approval writes catalog data.
  const resource = normalized ? Object.fromEntries(fields.map((field) => [field, normalized[field]])) : null;
  // Validate the raw values above, then canonicalize accepted URL identities
  // for every browser and workflow caller.
  if (resource) {
    resource.url = canonicalDevResourceUrl(raw.url);
    resource.favicon = raw.favicon ? canonicalDevResourceUrl(raw.favicon) : "";
  }
  return { errors, resource: errors.length ? null : resource };
}

export function findDevResourceDuplicates(resource, resources = [], excludeId = "") {
  const canonical = canonicalDevResourceUrl(resource?.url);
  const domain = text(resource?.domain) || (canonical ? new URL(canonical).hostname.replace(/^www\./, "") : "");
  const name = text(resource?.name).toLowerCase();
  return resources.filter((existing) => existing.id !== excludeId).flatMap((existing) => {
    const reasons = [];
    const existingCanonical = canonicalDevResourceUrl(existing.url);
    const existingDomain = text(existing.domain) || (existingCanonical ? new URL(existingCanonical).hostname.replace(/^www\./, "") : "");
    if (existing.id === resource.id) reasons.push("same id");
    if (canonical && existingCanonical === canonical) reasons.push("same canonical URL");
    if (domain && existingDomain.toLowerCase() === domain) reasons.push("same domain");
    if (name && text(existing.name).toLowerCase() === name) reasons.push("same name");
    return reasons.length ? [{ id: existing.id, name: existing.name, reasons }] : [];
  });
}

// Parse a dev-resources source (parsed value or JSON string) into a safe array.
// Never throws; drops malformed entries and duplicate ids; preserves order.
export function parseDevResources(raw) {
  let source = raw;
  if (typeof raw === "string") {
    try {
      source = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(source) ? source : Array.isArray(source?.resources) ? source.resources : [];
  const seen = new Set();
  const result = [];
  for (const entry of list) {
    const resource = normalizeDevResource(entry);
    if (!resource || seen.has(resource.id)) continue;
    seen.add(resource.id);
    result.push(resource);
  }
  return result;
}

// ---- Pure catalog helpers (mirror the tool-catalog filter surface) ----

function asSet(value) {
  return value instanceof Set ? value : value ? new Set(value) : null;
}

export function sortDevResources(resources = [], sort = "recent") {
  const values = [...resources];
  if (sort === "name") return values.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "category") return values.sort((a, b) => devCategoryMeta(a.category).label.localeCompare(devCategoryMeta(b.category).label) || a.name.localeCompare(b.name));
  return values.sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || "") || a.name.localeCompare(b.name));
}

// Apply the dev-catalog structured filters to a list of resources.
export function filterDevResources(resources, options = {}) {
  const allowedIds = asSet(options.allowedIds);
  const favoriteIds = asSet(options.favoriteIds);
  return resources.filter((resource) =>
    (!options.category || resource.category === options.category) &&
    (!options.pricing || resource.pricing === options.pricing) &&
    (!options.openSource || resource.openSource === true) &&
    (!options.noSignup || resource.noSignup === true) &&
    (!options.copyable || resource.copyable === true) &&
    (!options.favoritesOnly || (favoriteIds && favoriteIds.has(resource.id))) &&
    (!allowedIds || allowedIds.has(resource.id))
  );
}
