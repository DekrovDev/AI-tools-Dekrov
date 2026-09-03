import { create, insertMultiple, search as searchOrama } from "@orama/orama";
import { filterDevResources } from "./dev-resources.js";

// Dev-resource search engine. Mirrors the AI-tool engine's external contract
// ({ search(query, options) -> { items, queryActive, phase } }) and shares its
// Orama version, but indexes the dev-resource schema (no platform/model
// fields). Structured filters are applied deterministically afterwards via
// filterDevResources so results are always exact.

const SEARCHABLE_PROPERTIES = ["id", "name", "description", "tags", "tech", "category", "domain"];

const FIELD_BOOSTS = {
  name: 12,
  id: 9,
  category: 6,
  tags: 6,
  tech: 5.5,
  description: 3,
  domain: 3
};

const MIN_STRICT_RESULTS = 3;

const CONNECTOR_WORDS = new Set(["a", "an", "and", "for", "of", "that", "the", "to", "with"]);

const PRICING_WORDS = [
  { word: "free", value: "free" },
  { word: "freemium", value: "freemium" },
  { word: "paid", value: "paid" }
];

function asStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function normalizeInput(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function removeConnectors(text) {
  return text
    .split(/\s+/)
    .filter((word) => word && !CONNECTOR_WORDS.has(word))
    .join(" ")
    .trim();
}

function toleranceFor(tokens, fallback = false) {
  if (!tokens.length) return 0;
  const shortest = Math.min(...tokens.map((token) => token.length));
  if (shortest <= 3) return 0;
  if (!fallback) return 1;
  return shortest >= 7 ? 2 : 1;
}

function uniqueIds(hits) {
  const seen = new Set();
  const result = [];
  for (const hit of hits) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    result.push(hit);
  }
  return result;
}

// Pull leading facet words ("free", "freemium", "paid") out of the raw query
// text so they act as exact pricing filters rather than fuzzy search terms.
export function parseDevQuery(query = "") {
  const raw = String(query);
  const normalized = normalizeInput(raw);
  const words = normalized ? normalized.split(/\s+/).filter(Boolean) : [];
  const pricingWord = PRICING_WORDS.find((entry) => words.includes(entry.word));
  const remaining = words.filter((word) => word !== pricingWord?.word).join(" ");
  return {
    raw,
    pricing: pricingWord ? pricingWord.value : "",
    text: removeConnectors(remaining.replace(/[^\p{L}\p{N}._+-]+/gu, " ").replace(/\s+/g, " ").trim())
  };
}

export function createDevSearch(resources = []) {
  const sourceResources = Array.isArray(resources) ? resources : [];
  const resourcesById = new Map(sourceResources.map((resource) => [resource.id, resource]));

  const database = create({
    schema: {
      id: "string",
      name: "string",
      description: "string",
      category: "string",
      tags: "string[]",
      tech: "string[]",
      domain: "string",
      aliases: "string[]"
    },
    id: "ai-dekrov-dev-catalog"
  });
  insertMultiple(database, sourceResources.map((resource) => ({
    id: String(resource.id || ""),
    name: String(resource.name || ""),
    description: String(resource.description || ""),
    category: String(resource.category || ""),
    tags: asStrings(resource.tags),
    tech: asStrings(resource.tech),
    domain: String(resource.domain || ""),
    aliases: []
  })));

  function runPass(parsed, { fallback = false, text = parsed.text } = {}) {
    const tokens = text ? text.split(/\s+/).filter(Boolean) : [];
    return searchOrama(database, {
      term: text || undefined,
      properties: SEARCHABLE_PROPERTIES,
      boost: FIELD_BOOSTS,
      tolerance: toleranceFor(tokens, fallback),
      threshold: text ? (fallback ? 0.5 : 0) : undefined,
      limit: Math.max(sourceResources.length, 1)
    });
  }

  function search(query = "", options = {}) {
    const parsed = parseDevQuery(query);
    const queryActive = Boolean(parsed.raw);
    const filters = {
      category: options.category || "",
      pricing: parsed.pricing || options.pricing || "",
      openSource: Boolean(options.openSource),
      noSignup: Boolean(options.noSignup),
      copyable: Boolean(options.copyable),
      favoritesOnly: Boolean(options.favoritesOnly),
      favoriteIds: options.favoriteIds,
      allowedIds: options.allowedIds
    };
    const applyFilters = (items) => filterDevResources(items, filters);

    if (!queryActive) {
      return { items: applyFilters(sourceResources), hits: [], queryActive: false, phase: "catalog" };
    }

    if (!parsed.text) {
      // Pricing-only query (e.g. "free"): deterministic filter, nothing to rank.
      return { items: applyFilters(sourceResources), hits: [], queryActive: true, phase: "catalog" };
    }

    let strict = { hits: [] };
    let fallback = { hits: [] };
    const tokens = parsed.text ? parsed.text.split(/\s+/) : [];
    strict = runPass(parsed);
    const needsFallback = strict.hits.length === 0 || (tokens.length > 1 && strict.hits.length < MIN_STRICT_RESULTS);
    if (needsFallback) fallback = runPass(parsed, { fallback: true });
    const hits = uniqueIds([...strict.hits, ...fallback.hits]);
    const items = applyFilters(hits.map((hit) => resourcesById.get(hit.id)).filter(Boolean));
    const phase = fallback.hits.length ? "fallback" : "strict";
    return { items, hits, queryActive: true, phase };
  }

  return {
    database,
    search,
    size: sourceResources.length
  };
}
