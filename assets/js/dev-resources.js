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
