import { create, insertMultiple, search as searchOrama } from "@orama/orama";

export const ORAMA_VERSION = "3.1.18";

export const SEARCHABLE_PROPERTIES = [
  "id",
  "name",
  "models",
  "tags",
  "category",
  "platforms",
  "bestFor",
  "strengths",
  "description",
  "usageNotes",
  "gettingStarted",
  "pricing",
  "aliases"
];

export const FIELD_BOOSTS = {
  name: 12,
  id: 9,
  models: 8,
  tags: 7,
  category: 5.5,
  platforms: 5,
  bestFor: 5,
  aliases: 4.5,
  pricing: 4,
  strengths: 3.5,
  description: 3,
  usageNotes: 1.25,
  gettingStarted: 1
};

const MIN_STRICT_RESULTS = 3;
const CONNECTOR_WORDS = new Set(["a", "an", "and", "for", "of", "that", "the", "to", "tool", "tools", "with"]);

const PRICING_RULES = [
  { pattern: /\b(?:pay[\s-]+as[\s-]+you[\s-]+go|usage[\s-]+based)\b/giu, value: "usage-based" },
  { pattern: /\bfreemium\b/giu, value: "freemium" },
  { pattern: /\bfree\b/giu, value: "free" },
  { pattern: /\bpaid\b/giu, value: "paid" }
];

const PLATFORM_RULES = [
  { pattern: /\b(?:visual[\s-]+studio[\s-]+code|vs[\s-]+code|vscode)\b/giu, value: "vscode" },
  { pattern: /\b(?:(?:browser|chrome|firefox)[\s-]+extensions?|browser[\s-]+add(?:[\s-]?on)s?)\b/giu, value: "browser-extension" },
  { pattern: /\b(?:command[\s-]+line|terminal|shell|tui|cli)\b/giu, value: "cli" },
  { pattern: /\b(?:web|browser)\b/giu, value: "web" },
  { pattern: /\bdesktop\b/giu, value: "desktop" },
  { pattern: /\bmobile\b/giu, value: "mobile" },
  { pattern: /\bapi\b/giu, value: "api" }
];

const CATEGORY_RULES = [
  { pattern: /\b(?:app[\s-]+builders?|no[\s-]+code[\s-]+app|vibe[\s-]+coding)\b/giu, value: "app-builders" },
  { pattern: /\b(?:multi[\s-]+agent[\s-]+framework|agent[\s-]+framework|multi[\s-]+agent[\s-]+orchestration|orchestration)\b/giu, value: "orchestration" },
  { pattern: /\b(?:coding[\s-]+agents?|code[\s-]+agents?|programming[\s-]+agents?|code[\s-]+assistant)\b/giu, value: "coding-agents" },
  { pattern: /\b(?:workflow[\s-]+automation|automation[\s-]+platform|ai[\s-]+agents?)\b/giu, value: "automation" },
  { pattern: /\b(?:browser[\s-]+agents?|browser[\s-]+automation)\b/giu, value: "browser-agents" },
  { pattern: /\b(?:local[\s-]+ai|local[\s-]+llm|self[\s-]+hosted[\s-]+ai)\b/giu, value: "local-ai" },
  { pattern: /\b(?:model[\s-]+inference|inference[\s-]+api|inference[\s-]+platform)\b/giu, value: "inference" },
  { pattern: /\b(?:rag|retrieval[\s-]+augmented)\b/giu, value: "rag" },
  { pattern: /\b(?:llm[\s-]+observability|ai[\s-]+observability|tracing)\b/giu, value: "observability" },
  { pattern: /\b(?:developer[\s-]+tools?|dev[\s-]+tools?)\b/giu, value: "dev-tools" },
  { pattern: /\b(?:ai[\s-]+testing|test[\s-]+automation)\b/giu, value: "testing" },
  { pattern: /\b(?:ai[\s-]+security|security[\s-]+testing)\b/giu, value: "security" },
  { pattern: /\b(?:data[\s-]+analysis|data[\s-]+analytics)\b/giu, value: "data-analysis" },
  { pattern: /\b(?:vector[\s-]+databases?|ai[\s-]+databases?)\b/giu, value: "databases" },
  { pattern: /\b(?:ai[\s-]+writing|writing[\s-]+assistant)\b/giu, value: "writing" },
  { pattern: /\b(?:document[\s-]+ai|document[\s-]+processing|ocr)\b/giu, value: "documents" },
  { pattern: /\b(?:ai[\s-]+presentations?|slide[\s-]+generator)\b/giu, value: "presentations" },
  { pattern: /\b(?:ai[\s-]+meeting|meeting[\s-]+notetaker)\b/giu, value: "meetings" },
  { pattern: /\b(?:research[\s-]+tools?|research)\b/giu, value: "research" },
  { pattern: /\b(?:ai[\s-]+search|web[\s-]+search)\b/giu, value: "search" },
  { pattern: /\b(?:hosting[\s-]+infrastructure|infrastructure[\s-]+hosting)\b/giu, value: "hosting" },
  { pattern: /\b(?:chat[\s-]+llm|llm[\s-]+chat)\b/giu, value: "chat-llm" },
  { pattern: /\b(?:ai[\s-]+voice|voice[\s-]+ai|text[\s-]+to[\s-]+speech|speech[\s-]+to[\s-]+text)\b/giu, value: "voice" },
  { pattern: /\b(?:ai[\s-]+music|music[\s-]+generation)\b/giu, value: "music" },
  { pattern: /\b(?:ai[\s-]+image|image[\s-]+generation)\b/giu, value: "image" },
  { pattern: /\b(?:ai[\s-]+video|video[\s-]+generation)\b/giu, value: "video" },
  { pattern: /\b(?:ai[\s-]+design|design[\s-]+assistant)\b/giu, value: "design" },
  { pattern: /\b(?:ai[\s-]+3d|3d[\s-]+generation)\b/giu, value: "3d" },
  { pattern: /\b(?:ai[\s-]+translation|translation[\s-]+ai)\b/giu, value: "translation" },
  { pattern: /\b(?:ai[\s-]+education|ai[\s-]+tutor)\b/giu, value: "education" },
  { pattern: /\b(?:ai[\s-]+customer[\s-]+support|support[\s-]+agent)\b/giu, value: "customer-support" },
  { pattern: /\b(?:ai[\s-]+sales|sales[\s-]+ai)\b/giu, value: "sales" },
  { pattern: /\b(?:ai[\s-]+marketing|marketing[\s-]+ai)\b/giu, value: "marketing" },
  { pattern: /\b(?:ai[\s-]+legal|legal[\s-]+ai)\b/giu, value: "legal" },
  { pattern: /\b(?:ai[\s-]+finance|financial[\s-]+ai)\b/giu, value: "finance" },
  { pattern: /\b(?:ai[\s-]+healthcare|healthcare[\s-]+ai)\b/giu, value: "healthcare" },
  { pattern: /\b(?:ai[\s-]+productivity|productivity[\s-]+ai)\b/giu, value: "productivity" },
  { pattern: /\baudio[\s-]+tools?\b/giu, value: "audio" }
];

const CONCEPT_RULES = [
  { pattern: /\bopen[\s-]+source\b/giu, value: "open-source" },
  { pattern: /\b(?:self[\s-]+hosted|selfhosted)\b/giu, value: "self-hosted" },
  { pattern: /\bbyok\b/giu, value: "byok" }
];

const FILTER_LABELS = {
  pricing: { free: "Free", freemium: "Freemium", paid: "Paid", "usage-based": "Usage-based" },
  platforms: { web: "Web", desktop: "Desktop", mobile: "Mobile", "browser-extension": "Browser extension", cli: "CLI", vscode: "VS Code", api: "API" },
  categories: { "coding-agents": "Coding agents", "app-builders": "App builders", orchestration: "Orchestration", "chat-llm": "Chat / LLM", research: "Research", search: "Search", automation: "Automation", "browser-agents": "Browser agents", "local-ai": "Local AI", inference: "Inference", hosting: "Hosting", rag: "RAG", observability: "Observability", "dev-tools": "Dev tools", testing: "Testing", security: "Security", "data-analysis": "Data analysis", databases: "Databases", writing: "Writing", documents: "Documents", presentations: "Presentations", meetings: "Meetings", audio: "Audio", voice: "Voice", music: "Music", image: "Image", video: "Video", design: "Design", "3d": "3D", translation: "Translation", education: "Education", "customer-support": "Customer support", sales: "Sales", marketing: "Marketing", legal: "Legal", finance: "Finance", healthcare: "Healthcare", productivity: "Productivity", other: "Other" },
  concepts: { "open-source": "Open source", "self-hosted": "Self-hosted", byok: "BYOK" }
};

function asStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeInput(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRules(text, rules, output) {
  let remaining = text;
  for (const rule of rules) {
    remaining = remaining.replace(rule.pattern, () => {
      output.push(rule.value);
      return " ";
    });
  }
  return remaining;
}

function normalizeSynonyms(text) {
  return text
    .replace(/\bopen[\s-]+source\b/giu, "open-source")
    .replace(/\b(?:self[\s-]+hosted|selfhosted)\b/giu, "self-hosted")
    .replace(/\bbyok\b/giu, "bring your own key")
    .replace(/\bmulti[\s-]+agent\b/giu, "multi-agent")
    .replace(/\bcode[\s-]+assistant\b/giu, "coding agent");
}

function removeConnectors(text) {
  return text
    .split(/\s+/)
    .filter((word) => word && !CONNECTOR_WORDS.has(word))
    .join(" ")
    .trim();
}

export function parseCatalogQuery(query = "") {
  const raw = String(query);
  let remaining = normalizeInput(raw);
  const filters = { pricing: [], platforms: [], categories: [], concepts: [] };
  const alternativeMatch = remaining.match(/\balternatives?\s+to\s+([\p{L}\p{N}._-]+(?:\s+[\p{L}\p{N}._-]+){0,3})/iu);
  const alternativeTarget = alternativeMatch?.[1]?.trim() || "";

  remaining = extractRules(remaining, PRICING_RULES, filters.pricing);
  remaining = extractRules(remaining, PLATFORM_RULES, filters.platforms);
  remaining = extractRules(remaining, CATEGORY_RULES, filters.categories);
  remaining = extractRules(remaining, CONCEPT_RULES, filters.concepts);

  // A bare "agent" is broad. Only interpret it as a coding-agent category
  // when the same query has a developer-oriented CLI or VS Code constraint.
  if (!filters.categories.length && filters.platforms.some((value) => value === "cli" || value === "vscode") && /\bagents?\b/iu.test(remaining)) {
    filters.categories.push("coding-agents");
    remaining = remaining.replace(/\bagents?\b/giu, " ");
  }

  remaining = normalizeSynonyms(remaining);
  remaining = remaining.replace(/\balternatives?\b/giu, " ");
  remaining = removeConnectors(remaining.replace(/[^\p{L}\p{N}._+-]+/gu, " ").replace(/\s+/g, " ").trim());

  return {
    raw,
    text: remaining,
    tokens: remaining ? remaining.split(/\s+/).filter(Boolean) : [],
    filters: {
      pricing: unique(filters.pricing),
      platforms: unique(filters.platforms),
      categories: unique(filters.categories),
      concepts: unique(filters.concepts)
    },
    alternativeTarget
  };
}

export function formatDetectedFilters(parsed) {
  if (!parsed?.filters) return "";
  const labels = [
    ...parsed.filters.platforms.map((value) => FILTER_LABELS.platforms[value] || value),
    ...parsed.filters.pricing.map((value) => FILTER_LABELS.pricing[value] || value),
    ...parsed.filters.categories.map((value) => FILTER_LABELS.categories[value] || value),
    ...parsed.filters.concepts.map((value) => FILTER_LABELS.concepts[value] || value)
  ];
  return unique(labels).join(" · ");
}

function buildAliases(tool) {
  const values = [];
  const domain = typeof tool.domain === "string" ? tool.domain.replace(/^www\./, "").split(".")[0] : "";
  if (domain && domain.length > 2) values.push(domain.replace(/[-_]+/g, " "));

  const allTerms = [...asStrings(tool.tags), ...asStrings(tool.strengths), ...asStrings(tool.usageNotes)];
  const joined = allTerms.join(" ").toLocaleLowerCase("en");
  if (/\bbyok\b|bring your own key/i.test(joined)) values.push("byok", "bring your own key");
  if (/open[\s-]+source/i.test(joined)) values.push("open source", "open-source");
  if (/self[\s-]*hosted/i.test(joined)) values.push("self hosted", "self-hosted");
  if (/multi[\s-]+agent/i.test(joined)) values.push("multi agent", "multi-agent");

  return unique(values);
}

function buildConceptFilters(tool) {
  const evidence = [tool.description, ...asStrings(tool.tags), ...asStrings(tool.strengths), ...asStrings(tool.usageNotes), ...asStrings(tool.bestFor)].filter(Boolean).join(" ").toLocaleLowerCase("en");
  const concepts = [];
  const deniesOpenSource = /\b(?:no|not|without)\b[^.]{0,40}\bopen[\s-]+source\b/i.test(evidence);
  const deniesSelfHosted = /\b(?:no|not|without)\b[^.]{0,55}\bself[\s-]*hosted\b/i.test(evidence);
  if (!deniesOpenSource && /\bopen[\s-]+source\b/i.test(evidence)) concepts.push("open-source");
  if (!deniesSelfHosted && /\bself[\s-]*hosted\b/i.test(evidence)) concepts.push("self-hosted");
  if (/\bbyok\b|bring your own key/i.test(evidence)) concepts.push("byok");
  return unique(concepts);
}

export function toSearchDocument(tool) {
  return {
    id: String(tool.id || ""),
    name: String(tool.name || ""),
    description: String(tool.description || ""),
    category: String(tool.category || ""),
    tags: asStrings(tool.tags),
    platforms: asStrings(tool.platforms),
    models: asStrings(tool.models),
    bestFor: asStrings(tool.bestFor),
    strengths: asStrings(tool.strengths),
    gettingStarted: asStrings(tool.gettingStarted),
    usageNotes: asStrings(tool.usageNotes),
    pricing: String(tool.pricing || ""),
    aliases: buildAliases(tool),
    categoryFilter: String(tool.category || "other"),
    platformFilters: asStrings(tool.platforms),
    pricingFilter: String(tool.pricing || "unspecified"),
    conceptFilters: buildConceptFilters(tool)
  };
}

function buildWhere(parsedFilters, uiFilters = {}) {
  const clauses = [];
  if (parsedFilters.categories.length) clauses.push({ categoryFilter: { in: parsedFilters.categories } });
  if (parsedFilters.pricing.length) clauses.push({ pricingFilter: { in: parsedFilters.pricing } });
  if (parsedFilters.platforms.length) clauses.push({ platformFilters: { containsAll: parsedFilters.platforms } });
  if (parsedFilters.concepts.length) clauses.push({ conceptFilters: { containsAll: parsedFilters.concepts } });
  if (uiFilters.category) clauses.push({ categoryFilter: { eq: uiFilters.category } });
  if (uiFilters.pricing) clauses.push({ pricingFilter: { eq: uiFilters.pricing } });
  if (uiFilters.platform) clauses.push({ platformFilters: { containsAll: [uiFilters.platform] } });
  if (!clauses.length) return undefined;
  return clauses.length === 1 ? clauses[0] : { and: clauses };
}

export function sortCatalogTools(tools, sort = "recent") {
  const values = [...tools];
  if (sort === "name") return values.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "category") return values.sort((a, b) => String(a.category).localeCompare(String(b.category)) || a.name.localeCompare(b.name));
  return values.sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || "") || a.name.localeCompare(b.name));
}

function toAllowedSet(value) {
  return value instanceof Set ? value : value ? new Set(value) : null;
}

export function filterCatalogTools(tools, options = {}) {
  const favoriteIds = options.favoriteIds instanceof Set ? options.favoriteIds : new Set(options.favoriteIds || []);
  const allowedIds = toAllowedSet(options.allowedIds);
  const noRequirementValues = new Set(["not-required", "optional"]);
  return tools.filter((tool) =>
    (!options.category || tool.category === options.category) &&
    (!options.pricing || tool.pricing === options.pricing) &&
    (!options.platform || asStrings(tool.platforms).includes(options.platform)) &&
    (!options.executionMode || tool.executionMode === options.executionMode) &&
    (!options.noSignup || noRequirementValues.has(tool.signupRequirement)) &&
    (!options.noApiKey || noRequirementValues.has(tool.apiKeyRequirement)) &&
    (!options.favoritesOnly || favoriteIds.has(tool.id)) &&
    (!allowedIds || allowedIds.has(tool.id))
  );
}

export function matchesParsedFilters(tool, filters = {}) {
  const categories = filters.categories || [];
  const pricing = filters.pricing || [];
  const platforms = filters.platforms || [];
  const concepts = filters.concepts || [];
  return (!categories.length || categories.includes(tool.category)) &&
    (!pricing.length || pricing.includes(tool.pricing)) &&
    (!platforms.length || platforms.every((platform) => asStrings(tool.platforms).includes(platform))) &&
    (!concepts.length || concepts.every((concept) => buildConceptFilters(tool).includes(concept)));
}

function toleranceFor(tokens, fallback = false) {
  if (!tokens.length) return 0;
  const shortest = Math.min(...tokens.map((token) => token.length));
  if (shortest <= 3) return 0;
  if (!fallback) return 1;
  return shortest >= 7 ? 2 : 1;
}

function adjacentSwapVariants(text, limit = 16) {
  const words = text.split(/\s+/).filter(Boolean);
  const variants = [];
  for (let wordIndex = 0; wordIndex < words.length && variants.length < limit; wordIndex += 1) {
    const word = words[wordIndex];
    if (word.length < 4) continue;
    for (let index = 0; index < word.length - 1 && variants.length < limit; index += 1) {
      if (word[index] === word[index + 1]) continue;
      const swapped = `${word.slice(0, index)}${word[index + 1]}${word[index]}${word.slice(index + 2)}`;
      const candidate = [...words];
      candidate[wordIndex] = swapped;
      variants.push(candidate.join(" "));
    }
  }
  return unique(variants);
}

function mergeHits(primary, secondary) {
  const seen = new Set();
  const merged = [];
  for (const hit of [...primary, ...secondary]) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    merged.push(hit);
  }
  return merged;
}

function findAlternativeTarget(tools, target) {
  const normalized = normalizeInput(target);
  if (!normalized) return null;
  return tools.find((tool) => {
    const candidates = [tool.id, tool.name, tool.domain?.split(".")[0]].filter(Boolean).map(normalizeInput);
    return candidates.some((value) => value === normalized || value.includes(normalized) || normalized.includes(value));
  }) || null;
}

export function createCatalogSearch(tools = []) {
  const sourceTools = Array.isArray(tools) ? tools : [];
  const toolsById = new Map(sourceTools.map((tool) => [tool.id, tool]));
  const database = create({
    schema: {
      id: "string",
      name: "string",
      description: "string",
      category: "string",
      tags: "string[]",
      platforms: "string[]",
      models: "string[]",
      bestFor: "string[]",
      strengths: "string[]",
      gettingStarted: "string[]",
      usageNotes: "string[]",
      pricing: "string",
      aliases: "string[]",
      categoryFilter: "enum",
      platformFilters: "enum[]",
      pricingFilter: "enum",
      conceptFilters: "enum[]"
    },
    id: "ai-dekrov-catalog"
  });

  insertMultiple(database, sourceTools.map(toSearchDocument));

  function runPass(parsed, where, { fallback = false, text = parsed.text, tolerance, threshold } = {}) {
    return searchOrama(database, {
      term: text || undefined,
      properties: SEARCHABLE_PROPERTIES,
      boost: FIELD_BOOSTS,
      where,
      tolerance: tolerance ?? toleranceFor(text ? text.split(/\s+/).filter(Boolean) : [], fallback),
      threshold: text ? (threshold ?? (fallback ? 0.5 : 0)) : undefined,
      limit: Math.max(sourceTools.length, 1)
    });
  }

  function search(query = "", options = {}) {
    const parsed = parseCatalogQuery(query);
    const queryActive = Boolean(normalizeInput(query));
    const explicitFilters = {
      category: options.category || "",
      pricing: options.pricing || "",
      platform: options.platform || "",
      executionMode: options.executionMode || "",
      noSignup: Boolean(options.noSignup),
      noApiKey: Boolean(options.noApiKey)
    };

    if (!queryActive) {
      return {
        tools: filterCatalogTools(sourceTools, { ...explicitFilters, favoritesOnly: options.favoritesOnly, favoriteIds: options.favoriteIds, allowedIds: options.allowedIds }),
        hits: [],
        parsed,
        queryActive: false,
        phase: "catalog"
      };
    }

    let effectiveParsed = parsed;
    let where = buildWhere(effectiveParsed.filters, explicitFilters);
    let strict = runPass(effectiveParsed, where);
    let fallback = { hits: [] };

    const needsFallback = effectiveParsed.text && (strict.hits.length === 0 || (effectiveParsed.tokens.length > 1 && strict.hits.length < MIN_STRICT_RESULTS));
    if (needsFallback) {
      fallback = runPass(effectiveParsed, where, { fallback: true });
      if (strict.hits.length === 0) {
        const transpositionHits = adjacentSwapVariants(effectiveParsed.text).flatMap((text) => runPass(effectiveParsed, where, { text, tolerance: 0, threshold: effectiveParsed.tokens.length > 1 ? 0.5 : 0 }).hits);
        fallback = { ...fallback, hits: mergeHits(transpositionHits, fallback.hits) };
      }
    }

    let hits = mergeHits(strict.hits, fallback.hits);
    let phase = fallback.hits.length ? "fallback" : "strict";

    // "Alternative to X" is resolved only from the current catalog. If the
    // literal target yields nothing under the requested filters, reuse the
    // target's real category and tags as a conservative local expansion.
    if (!hits.length && parsed.alternativeTarget) {
      const target = findAlternativeTarget(sourceTools, parsed.alternativeTarget);
      if (target) {
        const expandedFilters = {
          ...parsed.filters,
          categories: parsed.filters.categories.length ? parsed.filters.categories : [target.category]
        };
        effectiveParsed = { ...parsed, filters: expandedFilters };
        where = buildWhere(expandedFilters, explicitFilters);
        const expansion = unique(asStrings(target.tags).filter((tag) => tag.length > 2)).slice(0, 5).join(" ");
        const expanded = runPass(effectiveParsed, where, { fallback: true, text: expansion });
        hits = expanded.hits.filter((hit) => hit.id !== target.id);
        phase = "alternative";
      }
    }

    const rankedTools = filterCatalogTools(hits
      .map((hit) => toolsById.get(hit.id))
      .filter(Boolean), {
        ...explicitFilters,
        favoritesOnly: options.favoritesOnly,
        favoriteIds: options.favoriteIds,
        allowedIds: options.allowedIds
      });

    return { tools: rankedTools, hits, parsed: effectiveParsed, queryActive: true, phase };
  }

  return {
    database,
    search,
    modelTerms: unique(sourceTools.flatMap((tool) => asStrings(tool.models))),
    size: sourceTools.length
  };
}
