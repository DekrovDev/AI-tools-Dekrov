import { createCatalogSearch, filterCatalogTools, formatDetectedFilters, matchesParsedFilters } from "./assets/js/search-engine.js";
import { COLLECTIONS_KEY, STACK_KEY, STACK_NAME, MAX_COLLECTION_NAME, createCollectionAndAppend, deleteCollection, filterKnownIds, normalizeCollectionName, parseCollections, parseStack, renameCollection, toggleStackTool, toggleToolInCollection } from "./assets/js/saved-library.js";
import { parseUseCases, resolveUseCaseTools, useCaseById, useCaseCount } from "./assets/js/use-cases.js";
import { START_HERE_PATH, DEFAULT_PRIMARY_LIMIT, applyStartAnswer, computeCandidates, findOption, parseStartHere, resolveGoal } from "./assets/js/start-here.js";
import { parseRouteHash, readOptionalJson, requiredResponsesAreOk } from "./assets/js/app-runtime-helpers.js";
import { SETUP_RECIPES_PATH, emptySetupRecipes, parseOptionalSetupRecipes, setupForTool, listAvailableCommands } from "./assets/js/setup-recipes.js";
import { buildEnvTextForState, canCopyCommands, clearEnvState, commandSequenceRows, createSetupState, envIncluded, hasEnvInput, hasSetupCapability, maskedEnvPreview, moveCommand, selectedCommandOutputs, setEnvValue, setRecipeValue, setupStateForTool, toggleCommandSelected, toggleEnvInclude } from "./assets/js/setup-ui.js";
import { decodeSharedCollection, importSharedCollection, resolveSharedToolIds, sharedCollectionUrl, sharedFailureMessage } from "./assets/js/shared-collections.js";
import { INSTALL_FAILURE_TEMPLATE, INSTALL_FAILURE_LABEL, installFailureIssueUrl } from "./assets/js/install-failure.js";
import { looksLikeOfficialUrlQuery, matchingToolsForUrl, missingToolPrefill, shouldOfferMissingToolSuggestion } from "./assets/js/missing-tool-suggestion.js";

const CATEGORY_META = {
  "coding-agents": { label: "Coding agents", short: "Coding", color: "#d2f25b" }, orchestration: { label: "Orchestration", short: "Agents", color: "#c2a5ff" },
  "chat-llm": { label: "Chat / LLM", short: "Chat / LLM", color: "#8db7ff" }, research: { label: "Research", short: "Research", color: "#ffb26b" },
  audio: { label: "Audio", short: "Audio", color: "#8db7ff" }, "dev-tools": { label: "Dev tools", short: "Dev tools", color: "#d2f25b" },
  hosting: { label: "Hosting / Infrastructure", short: "Hosting", color: "#ffb26b" }, other: { label: "Other", short: "Other", color: "#98a0ad" }
};
const PRICE_LABELS = { free: "Free", freemium: "Freemium", paid: "Paid", "usage-based": "Usage-based" };
const EXECUTION_LABELS = { local: "Local", cloud: "Cloud", hybrid: "Hybrid", unknown: "Unknown" };
const REQUIREMENT_LABELS = { required: "Required", optional: "Optional", "not-required": "Not required", depends: "Depends", unknown: "Unknown" };
const FAVORITES_KEY = "ai-dekrov-favorites";
const THEME_KEY = "ai-dekrov-theme";
const PERSONAL_NOTES_KEY = "ai-dekrov-personal-notes";
const DEFAULT_DESCRIPTION = document.querySelector('meta[name="description"]')?.content || "AI-Dekrov — a public catalog of AI tools";
const ICONS = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.3 4.3"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="2" fill="currentColor" stroke="none"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6m11 11 1.6 1.6M2 12h2.2m15.6 0H22M4.9 19.1l1.6-1.6m11-11 1.6-1.6"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 15.4A8.5 8.5 0 0 1 8.6 4a8.5 8.5 0 1 0 11.4 11.4Z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 12H5m7 7-7-7 7-7"/></svg>', arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 5v14M5 12h14"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 10.5v5M12 7.5h.01"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z"/></svg>',
  stack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
  collections: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><path d="M13 17h7M16.5 13.5v7"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h6l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13 7 4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 7h14M9 7V5h6v2m-8 0 1 12h8l1-12"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 6 6 6-6 6"/></svg>',
  terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M13 4l-2 16"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 18 9 5 9-5"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.5 5.3 3.5 8.5S14.5 18.1 12 20.5C9.5 18.1 8.5 15.2 8.5 12S9.5 5.9 12 3.5Z"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="6" width="12" height="12" rx="1"/><rect x="10" y="10" width="4" height="4"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/></svg>',
  api: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 9 4 12l4 3M16 9l4 3-4 3M14 5l-4 14"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 19V5m-7 7 7-7 7 7"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14m-7-7 7 7 7-7"/></svg>',
  bug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="9" width="8" height="10" rx="2"/><path d="M12 9V6M9 7l-2-2m8 2 2-2M9 13H5m10 0h4M9 17H5m10 0h4"/></svg>'
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const icon = (name) => ICONS[name] || "";
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const categoryMeta = (category) => CATEGORY_META[category] || CATEGORY_META.other;
const initials = (name = "") => name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
const labelize = (value = "") => value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
const hasValue = (value) => typeof value === "string" && value.trim().length > 0;
function readStoredArray(key) { try { const result = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(result) ? result : []; } catch { return []; } }
function readStoredObject(key) { try { const result = JSON.parse(localStorage.getItem(key) || "{}"); return result && typeof result === "object" && !Array.isArray(result) ? result : {}; } catch { return {}; } }

const state = { schema: null, siteConfig: null, searchEngine: null, searchIntent: null, searchPhase: "catalog", baseTools: [], tools: [], toolById: new Map(), query: "", category: "", pricing: "", platform: "", executionMode: "", noSignup: false, noApiKey: false, favoritesOnly: false, sort: "recent", catalogSort: "recent", favorites: new Set(readStoredArray(FAVORITES_KEY)), personalNotes: readStoredObject(PERSONAL_NOTES_KEY), theme: localStorage.getItem(THEME_KEY) || "dark", detailReturn: null, collections: parseCollections(localStorage.getItem(COLLECTIONS_KEY)), stack: parseStack(localStorage.getItem(STACK_KEY)), saveDialogContext: null, useCases: [], setupRecipes: emptySetupRecipes(), startHere: { config: null, answers: {} }, setup: null, shared: null };
function refreshTools() { state.tools = [...state.baseTools]; state.toolById = new Map(state.baseTools.map((tool) => [tool.id, tool])); }
function saveCollections() { localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(state.collections)); renderNavigation(); }
function saveStack() { localStorage.setItem(STACK_KEY, JSON.stringify(state.stack)); renderNavigation(); }
function collectionById(id) { return state.collections.collections.find((collection) => collection.id === id); }
function stackCount() { return state.stack.filter((id) => state.toolById.has(id)).length; }
function collectionToolCount(collection) { return collection ? filterKnownIds(collection.toolIds, new Set(state.toolById.keys())).length : 0; }
function pricingLabel(pricing) { return PRICE_LABELS[pricing] || "Not specified"; }
function priceSummary(tool) { return tool.pricing ? [pricingLabel(tool.pricing), tool.priceDetails].filter(Boolean).join(" · ") : tool.priceDetails || "Not specified"; }
function detailMetadataRow(label, value, labels) { return value && value !== "unknown" ? `<div class="info-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(labels[value] || labelize(value))}</dd></div>` : ""; }
function personalNote(id) { return state.personalNotes[id] || ""; }
function savePersonalNote(id, note) { const value = note.trim(); if (value) state.personalNotes[id] = value; else delete state.personalNotes[id]; localStorage.setItem(PERSONAL_NOTES_KEY, JSON.stringify(state.personalNotes)); }
function schemaEnum(name) { const definition = state.schema?.properties?.[name]; return definition?.enum || definition?.items?.enum || []; }
function enumOptions(name, labels = {}) { return schemaEnum(name).map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(labels[id] || labelize(id))}</option>`).join(""); }
function renderSchemaControls() {
  const categoryOptions = schemaEnum("category").map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(categoryMeta(id).label)}</option>`).join("");
  const priceOptions = schemaEnum("pricing").map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(pricingLabel(id))}</option>`).join("");
  const platformOptions = enumOptions("platforms");
  const executionOptions = enumOptions("executionMode", EXECUTION_LABELS);
  const signupOptions = enumOptions("signupRequirement", REQUIREMENT_LABELS);
  const apiKeyOptions = enumOptions("apiKeyRequirement", REQUIREMENT_LABELS);
  const unknownFirst = (options) => `<option value="unknown">Unknown</option>${options.replace('<option value="unknown">Unknown</option>', "")}`;
  $("#tool-form [name=category]").innerHTML = categoryOptions;
  $("#tool-form [name=pricing]").innerHTML = `<option value="">Select a price</option>${priceOptions}`;
  $("#tool-form [name=executionMode]").innerHTML = unknownFirst(executionOptions);
  $("#tool-form [name=signupRequirement]").innerHTML = unknownFirst(signupOptions);
  $("#tool-form [name=apiKeyRequirement]").innerHTML = unknownFirst(apiKeyOptions);
  $("#pricing-filter").innerHTML = `<option value="">Price: Any</option>${priceOptions}`;
  $("#platform-filter").innerHTML = `<option value="">Platform: Any</option>${platformOptions}`;
  $("#execution-filter").innerHTML = `<option value="">Execution: Any</option>${executionOptions.replace('<option value="unknown">Unknown</option>', "")}`;
}
function getHttpUrl(value) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url : null; } catch { return null; } }
function getDomain(value) { return getHttpUrl(value)?.hostname.replace(/^www\./, "") || ""; }
function logoMarkup(tool, meta, detail = false) { const className = detail ? "detail-logo" : "tool-logo"; const image = hasValue(tool.favicon) ? `<img class="tool-favicon" src="${escapeHtml(tool.favicon)}" alt="" onerror="this.remove()" />` : ""; return `<div class="${className}" style="--logo-color:${meta.color};--logo-bg:${meta.color}18;--logo-border:${meta.color}35">${image}<span>${escapeHtml(initials(tool.name))}</span></div>`; }

function setTheme(theme) { state.theme = theme; document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme); $("#theme-toggle").innerHTML = icon(theme === "dark" ? "sun" : "moon"); $("#theme-toggle").setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme"); }
function setMobileDrawer(open) { const isOpen = Boolean(open) && window.matchMedia("(max-width: 980px)").matches; $("#sidebar").classList.toggle("is-open", isOpen); $("#drawer-backdrop").classList.toggle("is-visible", isOpen); document.body.classList.toggle("is-drawer-open", isOpen); const toggle = $("#mobile-menu-toggle"); toggle.innerHTML = icon(isOpen ? "x" : "menu"); toggle.setAttribute("aria-expanded", String(isOpen)); toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation"); }
function renderStaticIcons() { $$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); }); setMobileDrawer(false); }
function setDocumentMeta(title = "AI-Dekrov", description = DEFAULT_DESCRIPTION) { document.title = title; const descriptionTag = document.querySelector('meta[name="description"]'); if (descriptionTag) descriptionTag.content = description || DEFAULT_DESCRIPTION; }
function formatDate(value) { if (!hasValue(value)) return ""; const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date); }
function sourceLabel(value) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value; } }

function currentView() {
  const route = parseRouteHash(location.hash);
  return ["start", "use-cases", "use-case", "stack", "collection", "collections", "shared"].includes(route?.type) ? route : null;
}
function currentUseCase() {
  const view = currentView();
  return view?.type === "use-case" ? useCaseById(state.useCases, view.id) : null;
}
function viewAllowedIds(view) {
  view = view || currentView();
  if (!view || view.type === "collections" || view.type === "use-cases") return null;
  if (view.type === "stack") return new Set(state.stack);
  if (view.type === "use-case") { const useCase = useCaseById(state.useCases, view.id); return useCase ? new Set(resolveUseCaseTools(useCase, state.toolById).map((tool) => tool.id)) : new Set(); }
  if (view.type === "shared") {
    if (state.shared && state.shared.token === view.token) return new Set(state.shared.knownIds);
    const decoded = decodeSharedCollection(view.token);
    if (!decoded.ok) return new Set();
    return new Set(resolveSharedToolIds(decoded.payload, new Set(state.toolById.keys())).knownIds);
  }
  const collection = collectionById(view.id);
  return collection ? new Set(collection.toolIds) : new Set();
}
function renderNavigation() {
  const counts = state.tools.reduce((all, tool) => { all[tool.category] = (all[tool.category] || 0) + 1; return all; }, {});
  const categories = Object.keys(counts);
  $("#all-count").textContent = state.tools.length; $("#favorites-count").textContent = state.favorites.size; $("#stack-count").textContent = stackCount(); $("#collections-count").textContent = state.collections.collections.length; $("#category-navigation").hidden = categories.length === 0;
  $("#category-links").innerHTML = categories.map((category) => { const meta = categoryMeta(category); return `<a class="category-link ${state.category === category ? "is-active" : ""}" href="#/category/${encodeURIComponent(category)}"><i class="category-dot" style="background:${meta.color}"></i><span>${escapeHtml(meta.label)}</span><span>${counts[category]}</span></a>`; }).join("");
  $("#category-filters").innerHTML = (categories.length ? ["", ...categories] : []).map((category) => `<button class="chip ${state.category === category ? "is-active" : ""}" type="button" data-category-filter="${escapeHtml(category)}">${escapeHtml(category ? categoryMeta(category).short : "All categories")}</button>`).join("");
  const hash = location.hash;
  let active = "all";
  if (hash.startsWith("#/shared")) active = "";
  else if (hash === "#/start") active = "start";
  else if (hash === "#/favorites") active = "favorites";
  else if (hash === "#/use-cases" || hash.startsWith("#/use-cases/")) active = "use-cases";
  else if (hash === "#/stack") active = "stack";
  else if (hash === "#/collections" || hash.startsWith("#/collections/")) active = "collections";
  $$("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === active && !getDetailId()));
}

function getFilteredTools() {
  const options = { category: state.category, pricing: state.pricing, platform: state.platform, executionMode: state.executionMode, noSignup: state.noSignup, noApiKey: state.noApiKey, favoritesOnly: state.favoritesOnly, favoriteIds: state.favorites, allowedIds: viewAllowedIds() };
  const urlQuery = looksLikeOfficialUrlQuery(state.query);
  let result = state.searchEngine
    ? state.searchEngine.search(state.query, options)
    : { tools: filterCatalogTools(state.tools, options), parsed: null, queryActive: false, phase: "catalog" };
  if (urlQuery) result = { ...result, tools: filterCatalogTools(matchingToolsForUrl(state.query, state.baseTools), options) };
  state.searchIntent = result.parsed;
  state.searchPhase = result.phase;
  const found = [...result.tools];
  if (result.queryActive && result.parsed?.text) {
    const noteTerm = result.parsed.text.toLocaleLowerCase("en");
    const rankedIds = new Set(found.map((tool) => tool.id));
    const noteMatches = filterCatalogTools(state.tools, options).filter((tool) => !rankedIds.has(tool.id) && matchesParsedFilters(tool, result.parsed.filters) && personalNote(tool.id).toLocaleLowerCase("en").includes(noteTerm));
    found.push(...noteMatches);
  }
  if (result.queryActive && state.sort === "relevance") return found;
  return found.sort((a, b) => state.sort === "name" ? a.name.localeCompare(b.name) : state.sort === "category" ? categoryMeta(a.category).label.localeCompare(categoryMeta(b.category).label) || a.name.localeCompare(b.name) : (b.addedAt || "").localeCompare(a.addedAt || "") || a.name.localeCompare(b.name));
}

function toolCard(tool) {
  const meta = categoryMeta(tool.category); const isFavorite = state.favorites.has(tool.id); const tags = (tool.tags || []).slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(""); const platforms = (tool.platforms || []).slice(0, 3).map((platform) => `<span>${escapeHtml(labelize(platform))}</span>`).join(""); const price = priceSummary(tool);
  return `<article class="tool-card"><div class="tool-card-top">${logoMarkup(tool, meta)}<div class="tool-title-block"><div class="tool-category"><i style="background:${meta.color}"></i>${escapeHtml(meta.label)}</div><h3 class="tool-name" title="${escapeHtml(tool.name)}">${escapeHtml(tool.name)}</h3></div><button class="favorite-button ${isFavorite ? "is-favorite" : ""}" type="button" data-favorite="${escapeHtml(tool.id)}" aria-label="${isFavorite ? "Remove from favorites" : "Add to favorites"}">${icon("star")}</button></div><p class="tool-description">${escapeHtml(tool.description || "No description yet.")}</p><div class="tool-card-meta"><div class="tool-platforms" aria-label="Platforms">${platforms || '<span>Platform not specified</span>'}</div><div class="tool-tags">${tags || '<span class="tag">No tags</span>'}</div></div><div class="tool-footer"><span class="price-badge price-${escapeHtml(tool.pricing || "unspecified")}" title="${escapeHtml(price)}">${escapeHtml(tool.pricing ? pricingLabel(tool.pricing) : "Not specified")}</span><div class="card-actions"><button class="save-tool-button" type="button" data-save-tool="${escapeHtml(tool.id)}" aria-label="Save ${escapeHtml(tool.name)} to collections or stack" title="Save to collections or stack">${icon("bookmark")}</button><a class="card-link card-link-detail" data-tool-detail href="#/tools/${encodeURIComponent(tool.id)}">Details ${icon("arrowRight")}</a>${hasValue(tool.url) ? `<a class="external-link" href="${escapeHtml(tool.url)}" target="_blank" rel="noreferrer">Website ${icon("external")}</a>` : ""}</div></div></article>`;
}

function renderCatalog() {
  const detailId = getDetailId(); const detail = Boolean(detailId);
  const view = currentView();
  if (view?.type === "use-case") { const useCase = useCaseById(state.useCases, view.id); if (!useCase) { location.hash = "#/use-cases"; return; } }
  const isStart = view?.type === "start";
  const isCollectionsIndex = view?.type === "collections";
  const isUseCasesIndex = view?.type === "use-cases";
  const isShared = view?.type === "shared";
  $("#start-view").hidden = !isStart;
  $("#use-cases-view").hidden = !isUseCasesIndex;
  $("#collections-view").hidden = !isCollectionsIndex;
  $("#catalog-view").hidden = detail || isShared;
  $("#shared-view").hidden = !isShared;
  $(".toolbar").hidden = detail || isCollectionsIndex || isUseCasesIndex || isStart;
  $(".results-head").hidden = detail || isCollectionsIndex || isUseCasesIndex || isStart || isShared;
  $("#tools-grid").hidden = detail || isCollectionsIndex || isUseCasesIndex || isStart;
  $("#detail-view").hidden = !detail;
  if (detail) { renderDetail(detailId); renderProfileExtras(detailId); return; }
  if (isStart) { setDocumentMeta("Start Here — AI-Dekrov"); renderStartHere(); return; }
  if (isCollectionsIndex) { setDocumentMeta("Collections — AI-Dekrov"); renderCollectionsView(); return; }
  if (isUseCasesIndex) { setDocumentMeta("Use cases — AI-Dekrov"); renderUseCasesView(); return; }
  if (isShared) {
    const decoded = decodeSharedCollection(view.token);
    if (!decoded.ok) { state.shared = null; renderSharedInvalid(decoded.reason); setDocumentMeta("Shared Collection — AI-Dekrov"); return; }
    const resolved = resolveSharedToolIds(decoded.payload, new Set(state.toolById.keys()));
    state.shared = { token: view.token, payload: decoded.payload, knownIds: resolved.knownIds, missingCount: resolved.missingCount };
    renderSharedBanner(state.shared);
  } else {
    state.shared = null;
  }
  const tools = getFilteredTools(); const active = Boolean(state.query || state.category || state.pricing || state.platform || state.executionMode || state.noSignup || state.noApiKey);
  const globalSearch = state.searchEngine?.search(state.query);
  const globalMatchCount = looksLikeOfficialUrlQuery(state.query) ? matchingToolsForUrl(state.query, state.baseTools).length : globalSearch?.tools.length || 0;
  const missingPrefill = !detail && !isShared && shouldOfferMissingToolSuggestion({
    query: state.query,
    parsed: globalSearch?.parsed || state.searchIntent,
    globalMatchCount,
    isNormalCatalog: !state.favoritesOnly && !view,
    tools: state.baseTools
  }) ? missingToolPrefill(state.query) : null;
  const useCase = currentUseCase();
  const viewTitle = view?.type === "use-case" ? (useCase?.name || "Use case") : view?.type === "stack" ? "My Stack" : view?.type === "collection" ? (collectionById(view.id)?.name || "Collection") : state.favoritesOnly || location.hash === "#/favorites" ? "Favorites" : state.category ? categoryMeta(state.category).label : "All tools";
  if (!isShared) setDocumentMeta(viewTitle === "AI-Dekrov" ? "AI-Dekrov" : `${viewTitle} — AI-Dekrov`);
  $("#tools-grid").innerHTML = tools.map(toolCard).join(""); $("#results-count").textContent = tools.length; $("#results-title").textContent = viewTitle; $("#clear-filters").hidden = !active; [["#pricing-filter", state.pricing], ["#platform-filter", state.platform], ["#execution-filter", state.executionMode]].forEach(([selector, value]) => $(selector).closest(".select-field").classList.toggle("is-active", Boolean(value))); $("#no-signup-filter").closest(".filter-toggle").classList.toggle("is-active", state.noSignup); $("#no-api-key-filter").closest(".filter-toggle").classList.toggle("is-active", state.noApiKey); $("#empty-state").hidden = tools.length > 0; $("#empty-state .empty-icon").dataset.icon = view?.type === "stack" ? "stack" : view?.type === "collection" ? "folder" : view?.type === "use-case" ? "layers" : "search"; $("#empty-state .empty-icon").innerHTML = icon($("#empty-state .empty-icon").dataset.icon);
  if (!tools.length) {
    const queryActive = Boolean(state.query.trim());
    const detected = formatDetectedFilters(state.searchIntent);
    let title = queryActive ? "No matching tools found" : active ? "Nothing found" : "No tools yet";
    let copy = queryActive ? `Try removing a filter or using fewer keywords.${detected ? ` Detected: ${detected}.` : ""}` : active ? "Change the search or clear the filters." : "Suggest the first tool to start the catalog.";
    let action = active ? "Clear filters" : "Suggest a tool"; let recovery = active ? "clear" : "suggest";
    const scopedToolCount = state.favoritesOnly ? state.tools.filter((tool) => state.favorites.has(tool.id)).length : ["stack", "collection", "use-case"].includes(view?.type) ? [...(viewAllowedIds(view) || [])].filter((id) => state.toolById.has(id)).length : 0;
    const canRecoverScopedView = Boolean(active && scopedToolCount);
    if (state.favoritesOnly) { title = canRecoverScopedView ? "No matching favorites" : "No favorites yet"; copy = canRecoverScopedView ? "Clear search and filters to see your favorites." : "Save favorites to keep useful tools close."; action = canRecoverScopedView ? "Clear search & filters" : "Browse all tools"; recovery = canRecoverScopedView ? "clear" : "browse"; }
    if (view?.type === "stack") { title = canRecoverScopedView ? "No matching tools in your stack" : "Your stack is empty"; copy = canRecoverScopedView ? "Clear search and filters to see the tools in your stack." : "Add tools you actively use together. Open a tool and press Save to build your stack."; action = canRecoverScopedView ? "Clear search & filters" : "Browse all tools"; recovery = canRecoverScopedView ? "clear" : "browse"; }
    if (view?.type === "collection") { title = canRecoverScopedView ? "No matching tools in this collection" : "This collection is empty"; copy = canRecoverScopedView ? "Clear search and filters to see this collection." : "Add tools to this collection from any tool card or detail page."; action = canRecoverScopedView ? "Clear search & filters" : "Browse all tools"; recovery = canRecoverScopedView ? "clear" : "browse"; }
    if (view?.type === "use-case") { title = canRecoverScopedView ? `No matching tools in ${useCase?.name || "this use case"}` : "No tools in this use case"; copy = canRecoverScopedView ? `Clear search and filters to see tools in ${useCase?.name || "this use case"}.` : "This use case has no valid tools in the current catalog."; action = canRecoverScopedView ? "Clear search & filters" : "Browse all tools"; recovery = canRecoverScopedView ? "clear" : "browse"; }
    if (view?.type === "shared") {
      const noneAvailable = (state.shared?.knownIds.length || 0) === 0;
      if (noneAvailable) {
        title = "No tools available";
        copy = state.shared?.missingCount ? "None of the tools in this shared collection are currently available in the catalog." : "This shared collection has no tools in the current catalog.";
        action = "Browse all tools"; recovery = "browse";
      } else {
        title = "No matching tools in this shared collection";
        copy = "Try removing a filter or using fewer keywords.";
        action = "Clear filters"; recovery = "clear";
      }
    }
    $("#empty-state h2").textContent = title;
    $("#empty-state p").textContent = copy;
    $("#empty-action").textContent = action; $("#empty-action").dataset.recovery = recovery;
  }
  $("#missing-tool-suggestion").hidden = !missingPrefill;
  if (missingPrefill) {
    $("#missing-tool-query").textContent = missingPrefill.name || missingPrefill.url;
    $("#missing-tool-action").dataset.missingToolMode = missingPrefill.mode;
    $("#missing-tool-action").dataset.missingToolValue = missingPrefill.name || missingPrefill.url;
  }
  const viewActions = $("#view-actions");
  if (view?.type === "collection") {
    const collection = collectionById(view.id);
    viewActions.hidden = !collection;
    viewActions.innerHTML = collection ? `<button class=" button button-secondary" type="button" data-share-collection="${escapeHtml(collection.id)}" aria-label="Copy a share link for ${escapeHtml(collection.name)}">${icon("external")} Share</button><button class="button button-secondary" type="button" data-rename-collection="${escapeHtml(collection.id)}">${icon("edit")} Rename</button><button class="button button-secondary button-danger" type="button" data-delete-collection="${escapeHtml(collection.id)}">${icon("trash")} Delete</button>` : "";
  } else {
    viewActions.hidden = true;
    viewActions.innerHTML = "";
  }
}
function renderUseCasesView() {
  const list = state.useCases;
  $("#use-cases-grid").innerHTML = list.length ? list.map((useCase) => {
    const count = useCaseCount(useCase, state.toolById);
    return `<a class="use-case-card" href="#/use-cases/${encodeURIComponent(useCase.id)}"><span class="use-case-icon">${icon(useCase.icon)}</span><div class="use-case-card-main"><h3>${escapeHtml(useCase.name)}</h3><p>${escapeHtml(useCase.description)}</p></div><span class="use-case-count">${count} tool${count === 1 ? "" : "s"}</span><span class="collection-chevron">${icon("chevronRight")}</span></a>`;
  }).join("") : `<div class="collection-empty"><h3>No use cases yet</h3><p>Curated use cases are added over time.</p></div>`;
}
function renderStartHere() {
  const inner = $("#start-inner"); if (!inner) return;
  const config = state.startHere.config;
  if (!config || !config.steps.length) {
    inner.innerHTML = `<div class="start-empty"><p class="kicker">START HERE</p><h2>Start Here</h2><p>The guided flow is not configured yet.</p><a class="button button-primary" href="#/use-cases">Browse use cases ${icon("arrowRight")}</a></div>`;
    return;
  }
  const steps = config.steps;
  const answered = steps.map((step) => state.startHere.answers[step.id] || "");
  const currentIndex = answered.findIndex((value) => !value);
  if (currentIndex === -1) { renderStartResults(inner, steps); return; }
  renderStartStep(inner, steps, currentIndex);
}
function renderStartStep(inner, steps, index) {
  const step = steps[index];
  const isGoal = index === 0;
  const options = step.options.filter((option) => { if (isGoal) return Boolean(useCaseById(state.useCases, option.useCaseId)); return true; });
  const optionsHtml = options.map((option) => {
    const selected = state.startHere.answers[step.id] === option.id;
    let sub = hasValue(option.description) ? `<span class="start-option-sub">${escapeHtml(option.description)}</span>` : "";
    if (isGoal) { const useCase = useCaseById(state.useCases, option.useCaseId); sub = `<span class="start-option-sub">${useCaseCount(useCase, state.toolById)} tools · ${escapeHtml(option.description || "")}</span>`; }
    return `<button class="start-option ${selected ? "is-selected" : ""}" type="button" data-start-option="${escapeHtml(step.id)}:${escapeHtml(option.id)}" aria-pressed="${selected}"><span class="start-option-icon">${icon(option.icon || "folder")}</span><span class="start-option-text"><strong>${escapeHtml(option.label)}</strong>${sub}</span></button>`;
  }).join("");
  inner.innerHTML = `<div class="start-head"><p class="kicker">START HERE · STEP ${index + 1} OF ${steps.length}</p><h2>${escapeHtml(step.title)}</h2></div><div class="start-options">${optionsHtml}</div><div class="start-controls">${index > 0 ? `<button class="button button-secondary" type="button" data-start-back>${icon("arrowLeft")} Back</button>` : ""}${index > 0 ? `<button class="button button-secondary" type="button" data-start-over>Start over</button>` : ""}</div>`;
}
function startReasonChips(steps) {
  const chips = [];
  const platformOption = findOption(steps[1], state.startHere.answers.platform);
  if (platformOption?.platform) chips.push(platformOption.label);
  const pricingOption = findOption(steps[2], state.startHere.answers.pricing);
  if (pricingOption?.pricing) chips.push(pricingOption.label);
  return chips;
}
function renderStartResults(inner, steps) {
  const result = computeCandidates(state.startHere.config, state.startHere.answers, state.useCases, state.toolById, { primaryLimit: DEFAULT_PRIMARY_LIMIT });
  if (!result.useCase) {
    inner.innerHTML = `<div class="start-empty"><p class="kicker">START HERE</p><h2>Nothing to show</h2><p>The selected goal is no longer available.</p><div class="start-empty-actions"><div class="start-empty-secondary"><button class="button button-secondary" type="button" data-start-back>${icon("arrowLeft")} Back</button><button class="button button-secondary" type="button" data-start-over>Start over</button></div></div></div>`;
    return;
  }
  const chips = startReasonChips(steps);
  const chipsHtml = chips.length ? `<p class="start-reasons">${chips.map((chip) => `<span class="tag">${escapeHtml(chip)}</span>`).join("")}</p>` : "";
  if (!result.total) {
    const relaxActions = [];
    if (state.startHere.answers.pricing) relaxActions.push(`<button class="button button-secondary" type="button" data-start-relax="pricing">Remove pricing preference</button>`);
    if (state.startHere.answers.platform) relaxActions.push(`<button class="button button-secondary" type="button" data-start-relax="platform">Remove platform preference</button>`);
    inner.innerHTML = `<div class="start-empty"><p class="kicker">YOUR PATH</p><h2>No exact matches</h2><p>${escapeHtml(result.useCase.name)} has no tools matching your choices. Try relaxing one preference.</p>${chipsHtml}<div class="start-empty-actions"><div class="start-empty-secondary">${relaxActions.join("")}<button class="button button-secondary" type="button" data-start-back>${icon("arrowLeft")} Back</button></div><a class="button button-primary" href="#/use-cases/${encodeURIComponent(result.useCase.id)}">View all tools in this use case ${icon("arrowRight")}</a></div></div>`;
    return;
  }
  const cards = result.matches.map(toolCard).join("");
  const viewAllLabel = result.total > result.matches.length ? `View all ${result.total} matching tools` : "Open use case";
  inner.innerHTML = `<div class="start-results-head"><p class="kicker">YOUR PATH</p><h2>${escapeHtml(result.useCase.name)}</h2><p>${result.total} tool${result.total === 1 ? "" : "s"} match your choices${chips.length ? ` · ${chips.join(" · ")}` : ""}</p></div><div class="tools-grid start-results-grid">${cards}</div><div class="start-results-actions"><button class="button button-secondary" type="button" data-start-back>${icon("arrowLeft")} Back</button><a class="button button-primary" href="#/use-cases/${encodeURIComponent(result.useCase.id)}">${viewAllLabel} ${icon("arrowRight")}</a><button class="button button-secondary" type="button" data-start-over>Start over</button></div>`;
}
function setStartAnswer(stepId, optionId) { state.startHere.answers = applyStartAnswer(state.startHere.config, state.startHere.answers, stepId, optionId); renderStartHere(); }
function goStartBack() {
  const steps = state.startHere.config?.steps || [];
  const answered = steps.map((step) => state.startHere.answers[step.id] || "");
  const current = answered.findIndex((value) => !value);
  const target = current === -1 ? steps.length - 1 : Math.max(0, current - 1);
  if (target <= 0 && current <= 0) return;
  delete state.startHere.answers[steps[target].id];
  renderStartHere();
}
function renderCollectionsView() {
  const list = state.collections.collections;
  $("#collections-grid").innerHTML = list.length ? list.map((collection) => {
    const count = collectionToolCount(collection);
    return `<article class="collection-card"><a class="collection-card-link" href="#/collections/${encodeURIComponent(collection.id)}"><span class="collection-icon">${icon("folder")}</span><div class="collection-card-main"><strong>${escapeHtml(collection.name)}</strong><span>${count} tool${count === 1 ? "" : "s"}</span></div><span class="collection-chevron">${icon("chevronRight")}</span></a><div class="collection-card-actions"><button class="button button-secondary" type="button" data-rename-collection="${escapeHtml(collection.id)}">${icon("edit")} Rename</button><button class="button button-secondary button-danger" type="button" data-delete-collection="${escapeHtml(collection.id)}">${icon("trash")} Delete</button></div></article>`;
  }).join("") : `<div class="collection-empty"><h3>No collections yet</h3><p>Create a collection to group tools together, like “Try later” or “Work”.</p></div>`;
}

function renderSharedBanner(shared) {
  const total = shared.payload.toolIds.length;
  const available = shared.knownIds.length;
  const count = `${available} of ${total} tool${total === 1 ? "" : "s"}`;
  const missing = shared.missingCount > 0 ? `<p class="shared-missing">${shared.missingCount} tool${shared.missingCount === 1 ? "" : "s"} from this shared collection are no longer available.</p>` : "";
  setDocumentMeta(`${shared.payload.name} — Shared Collection — AI-Dekrov`, "Shared set of AI tools.");
  $("#shared-view").innerHTML = `<div class="shared-head"><div><p class="kicker">SHARED COLLECTION</p><h2>${escapeHtml(shared.payload.name)}</h2><p>${count} · shared as a read-only snapshot in this link.</p>${missing}</div><div class="shared-actions"><button class="button button-primary" type="button" data-shared-save ${available === 0 ? "disabled" : ""} aria-label="Save this shared collection to your collections">${icon("bookmark")} Save to Collections</button><a class="button button-secondary" href="#/">Back to catalog</a></div></div><p class="shared-note">Opening this link does not save anything. Save to Collections makes your own local copy; later edits to the original collection are not reflected in this link.</p>`;
}
function renderSharedInvalid(reason) {
  $("#shared-view").innerHTML = `<div class="shared-head shared-invalid"><div><p class="kicker">SHARED COLLECTION</p><h2>Invalid shared collection</h2><p>${escapeHtml(sharedFailureMessage(reason))}</p></div><div class="shared-actions"><a class="button button-secondary" href="#/">Back to catalog</a></div></div>`;
  $("#tools-grid").innerHTML = "";
  $("#empty-state").hidden = true;
}

function commandBlock(label, command) { return hasValue(command) ? `<div class="command-block"><div class="command-head"><span>${escapeHtml(label)}</span><button class="copy-command" type="button" data-copy="${escapeHtml(command)}">${icon("copy")} Copy</button></div><pre>${escapeHtml(command)}</pre></div>` : ""; }
function inferredStrengths(tool) { const values = []; if ((tool.tags || []).includes("open-source")) values.push("Open-source"); if ((tool.platforms || []).includes("cli")) values.push("Built for terminal workflows"); if ((tool.models || []).length) values.push(`Works with ${tool.models.length} listed model${tool.models.length === 1 ? "" : "s"}`); if (tool.pricing === "free") values.push("Free to use"); return values; }
function guideSteps(tool) { const explicit = Array.isArray(tool.gettingStarted) ? tool.gettingStarted.filter(hasValue).map((description, index) => ({ title: `Step ${index + 1}`, description })) : []; if (explicit.length) return explicit; return [{ title: "Install", description: "Run the verified installation command.", command: tool.install }, { title: "Start", description: "Run the verified start command.", command: tool.start }, tool.docs ? { title: "Read the official setup guide", description: "Use the official documentation for the next setup steps.", url: tool.docs } : null].filter((step) => step && (step.command || step.url)); }
function guideMarkup(step, index) { const link = hasValue(step.url) ? `<a class="guide-link" href="${escapeHtml(step.url)}" target="_blank" rel="noreferrer">Open guide ${icon("external")}</a>` : ""; return `<article class="guide-step"><span class="guide-number">${index + 1}</span><div><h3>${escapeHtml(step.title || "Next step")}</h3>${hasValue(step.description) ? `<p>${escapeHtml(step.description)}</p>` : ""}${commandBlock("Command", step.command)}${link}</div></article>`; }
function getDetailId() { const route = parseRouteHash(location.hash); return route?.type === "tool" && route.id ? route.id : ""; }
function renderDetail(id) {
  const tool = state.tools.find((item) => item.id === id); if (!tool) { location.hash = "#/"; return; }
  setDocumentMeta(`${tool.name} — AI-Dekrov`, tool.description || DEFAULT_DESCRIPTION);
  const meta = categoryMeta(tool.category); const favorite = state.favorites.has(tool.id); const platforms = (tool.platforms || []).map((platform) => `<span class="tag">${escapeHtml(labelize(platform))}</span>`).join("") || "<span>Not specified</span>"; const models = (tool.models || []).map((model) => `<span class="model-pill">${escapeHtml(model)}</span>`).join(""); const commands = (tool.commands || []).map((item) => commandBlock(item.label || "Command", item.command)).join(""); const strengths = (tool.strengths || inferredStrengths(tool)).filter(hasValue); const guide = guideSteps(tool); const note = personalNote(tool.id); const setupMarkup = renderSetupSection(tool);
  const links = [tool.github && `<a class="card-link" href="${escapeHtml(tool.github)}" target="_blank" rel="noreferrer">GitHub ${icon("external")}</a>`, tool.docs && `<a class="card-link" href="${escapeHtml(tool.docs)}" target="_blank" rel="noreferrer">Documentation ${icon("external")}</a>`].filter(Boolean).join("");
  const sources = (tool.sources || []).filter(hasValue).map((source) => `<a class="source-link" href="${escapeHtml(source)}" target="_blank" rel="noreferrer">${escapeHtml(sourceLabel(source))}${icon("external")}</a>`).join("");
  const accessMetadata = [detailMetadataRow("Execution", tool.executionMode, EXECUTION_LABELS), detailMetadataRow("Signup", tool.signupRequirement, REQUIREMENT_LABELS), detailMetadataRow("API key", tool.apiKeyRequirement, REQUIREMENT_LABELS)].join("");
  const metadata = [tool.addedAt && `<div class="info-row"><dt>Added</dt><dd>${escapeHtml(formatDate(tool.addedAt))}</dd></div>`, tool.updatedAt && `<div class="info-row"><dt>Updated</dt><dd>${escapeHtml(formatDate(tool.updatedAt))}</dd></div>`, tool.lastVerifiedAt && `<div class="info-row"><dt>Last verified</dt><dd>${escapeHtml(formatDate(tool.lastVerifiedAt))}</dd></div>`].filter(Boolean).join("");
  const price = priceSummary(tool);
  $("#detail-view").innerHTML = `<button class="back-link" type="button" data-back-catalog><span>${icon("arrowLeft")}</span> Back to catalog</button><div class="detail-header">${logoMarkup(tool, meta, true)}<div class="detail-heading"><div class="tool-category">${escapeHtml(meta.label)}</div><h1>${escapeHtml(tool.name)}</h1>${hasValue(tool.description) ? `<p>${escapeHtml(tool.description)}</p>` : ""}</div><div class="detail-actions">${hasValue(tool.url) ? `<a class="button button-primary" href="${escapeHtml(tool.url)}" target="_blank" rel="noreferrer">Open website ${icon("external")}</a>` : ""}<button class="button button-secondary" type="button" data-save-tool="${escapeHtml(tool.id)}">${icon("bookmark")} Save</button><button class="button button-secondary" type="button" data-propose-update="${escapeHtml(tool.id)}">Suggest an update</button><button class="button button-secondary" type="button" data-favorite="${escapeHtml(tool.id)}">${icon("star")} ${favorite ? "Favorited" : "Add to favorites"}</button></div></div><div class="detail-grid"><div class="detail-main">${strengths.length ? `<section class="detail-section strengths-section"><h2>Why it stands out</h2><div class="strength-list">${strengths.map((strength) => `<div>${icon("star")}<span>${escapeHtml(strength)}</span></div>`).join("")}</div></section>` : ""}${guide.length ? `<section class="detail-section getting-started-section"><h2>Getting started</h2><p class="detail-caption">Use only the verified steps shown below. Check the official guide for service-specific menus and options.</p><div class="guide-list">${guide.map(guideMarkup).join("")}</div></section>` : ""}${hasValue(tool.install) || hasValue(tool.start) || commands ? `<section class="detail-section"><h2>More commands</h2>${commands}</section>` : ""}${models ? `<section class="detail-section"><h2>Models</h2><div class="model-list">${models}</div></section>` : ""}${setupMarkup}${links ? `<section class="detail-section"><h2>Links</h2><div class="detail-links">${links}</div></section>` : ""}${sources ? `<section class="detail-section"><h2>Sources</h2><div class="source-list">${sources}</div></section>` : ""}<section class="detail-section personal-note-section"><h2>Personal note</h2><p class="detail-caption">Stored only in this browser. It is never published or sent with a submission.</p><textarea class="personal-note-input" id="personal-note-input" rows="4" placeholder="Add a private note for yourself">${escapeHtml(note)}</textarea><div class="note-actions"><button class="button button-primary" type="button" data-note-save="${escapeHtml(tool.id)}">Save note</button>${note ? `<button class="button button-secondary" type="button" data-note-delete="${escapeHtml(tool.id)}">Delete note</button>` : ""}</div></section></div><aside class="detail-aside"><dl class="info-list">${tool.pricing || tool.priceDetails ? `<div class="info-row"><dt>Price</dt><dd>${escapeHtml(price)}</dd></div>` : ""}<div class="info-row"><dt>Platforms</dt><dd><div class="platform-list">${platforms}</div></dd></div>${accessMetadata}${tool.domain ? `<div class="info-row"><dt>Domain</dt><dd>${escapeHtml(tool.domain)}</dd></div>` : ""}${metadata}</dl><div class="detail-tags">${(tool.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div></aside></div>`;
}
function setupRequirementBadge(requirement) {
  const labels = { required: "Required", optional: "Optional", depends: "Depends" };
  return `<span class="env-requirement env-req-${escapeHtml(requirement)}">${escapeHtml(labels[requirement] || requirement)}</span>`;
}
function currentDetailSetup() {
  const id = getDetailId();
  if (!id) return null;
  const tool = state.toolById.get(id);
  if (!tool) return null;
  return { tool, setup: setupForTool(state.setupRecipes, id) };
}
function envRowMarkup(envVar, index) {
  const included = envIncluded(state.setup, envVar);
  const revealed = state.setup.reveal.has(envVar.name);
  const inputType = envVar.secret && !revealed ? "password" : "text";
  const value = state.setup.values[envVar.name] || "";
  const id = `setup-env-${index}`;
  const source = envVar.source ? `<a class="setup-source" href="${escapeHtml(envVar.source)}" target="_blank" rel="noreferrer">Docs ${icon("external")}</a>` : "";
  const toggle = envVar.requirement === "required"
    ? `<span class="env-include env-include-always">Included</span>`
    : `<label class="env-include"><input type="checkbox" data-env-include="${escapeHtml(envVar.name)}" ${included ? "checked" : ""} /><span>Include in .env</span></label>`;
  const reveal = envVar.secret ? `<button class="env-reveal" type="button" data-env-reveal="${escapeHtml(envVar.name)}" aria-pressed="${revealed}" aria-label="${revealed ? "Hide" : "Show"} ${escapeHtml(envVar.name)} value">${revealed ? "Hide" : "Show"}</button>` : "";
  return `<div class="env-row"><div class="env-head"><div class="env-title"><label class="env-name" for="${id}">${escapeHtml(envVar.name)}</label>${envVar.label && envVar.label !== envVar.name ? `<span class="env-label-text">${escapeHtml(envVar.label)}</span>` : ""}</div><div class="env-meta">${setupRequirementBadge(envVar.requirement)}${source}</div></div><p class="env-desc">${escapeHtml(envVar.description)}</p><div class="env-controls">${toggle}<div class="env-field"><input id="${id}" type="${inputType}" data-env-input="${escapeHtml(envVar.name)}" placeholder="${escapeHtml(envVar.valueHint || "")}" value="${escapeHtml(value)}" autocomplete="off" spellcheck="false" />${reveal}</div></div></div>`;
}
function recipeInputsMarkup(recipe, selected) {
  const values = state.setup.recipeValues[recipe.id] || {};
  const fields = recipe.inputs.map((input) => {
    const value = values[input.key] || "";
    if (input.type === "select") {
      const options = input.options.map((option) => `<option value="${escapeHtml(option.value)}" ${value === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
      return `<label class="form-field"><span>${escapeHtml(input.label)}</span><select data-recipe-input="${escapeHtml(recipe.id)}:${escapeHtml(input.key)}"><option value="">—</option>${options}</select></label>`;
    }
    return `<label class="form-field"><span>${escapeHtml(input.label)}</span><input type="text" data-recipe-input="${escapeHtml(recipe.id)}:${escapeHtml(input.key)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(input.placeholder || "")}" spellcheck="false" /></label>`;
  }).join("");
  return `<div class="recipe-inputs" ${selected ? "" : "hidden"}>${fields}</div>`;
}
function commandChoiceMarkup(choice) {
  const selected = state.setup.selected.includes(choice.id);
  const order = selected ? state.setup.selected.indexOf(choice.id) + 1 : 0;
  const recipeInputs = choice.kind === "recipe" ? recipeInputsMarkup(choice.recipe, selected) : "";
  return `<div class="command-choice ${selected ? "is-selected" : ""}"><label class="command-choice-toggle"><input type="checkbox" data-command-toggle="${escapeHtml(choice.id)}" ${selected ? "checked" : ""} /><span class="command-choice-label">${escapeHtml(choice.label)}</span>${selected ? `<span class="command-order">#${order}</span>` : ""}</label>${choice.description ? `<p class="command-choice-desc">${escapeHtml(choice.description)}</p>` : ""}${choice.kind === "command" ? `<code class="command-choice-code">${escapeHtml(choice.command)}</code>` : ""}${recipeInputs}</div>`;
}
function commandSequenceMarkup(tool, setup) {
  const result = commandSequenceRows(state.setup, tool, setup);
  const choices = listAvailableCommands(tool, setup);
  const byId = new Map(choices.map((choice) => [choice.id, choice]));
  const rows = result.rows.map((row, index) => {
    const choice = byId.get(row.id);
    const label = choice?.label || row.label || "Command";
    return `<div class="command-seq-row"><span class="seq-num">${index + 1}</span><code>${escapeHtml(row.text)}</code><span class="seq-controls"><button class="seq-move" type="button" data-command-move="${escapeHtml(row.id)}:-1" aria-label="Move ${escapeHtml(label)} up">${icon("arrowUp")}</button><button class="seq-move" type="button" data-command-move="${escapeHtml(row.id)}:1" aria-label="Move ${escapeHtml(label)} down">${icon("arrowDown")}</button><button class="seq-remove" type="button" data-command-toggle="${escapeHtml(row.id)}" aria-label="Remove ${escapeHtml(label)}">${icon("x")}</button></span></div>`;
  }).join("");
  const seqText = result.rows.map((row) => row.text).join("\n");
  const body = rows
    ? `<div class="command-seq-list">${rows}</div><pre class="setup-output-text">${escapeHtml(seqText)}</pre>`
    : `<p class="setup-hint">${result.incompleteRecipe ? "Fill in the selected recipe inputs to add it to the sequence." : "Select commands to build a setup sequence."}</p>`;
  return `<div class="setup-preview"><div class="setup-preview-head"><span>Your sequence</span></div>${body}</div>`;
}
function renderSetupSection(tool) {
  const setup = setupForTool(state.setupRecipes, tool.id);
  const envVars = setup.envVars || [];
  const choices = listAvailableCommands(tool, setup);
  const hasEnv = envVars.length > 0;
  const hasCommands = choices.length > 0;
  if (!hasSetupCapability(tool, setup)) return "";
  state.setup = setupStateForTool(state.setup, tool.id);
  const activeTab = state.setup.tab === "env" && hasEnv ? "env" : state.setup.tab === "commands" && hasCommands ? "commands" : hasEnv ? "env" : "commands";
  state.setup.tab = activeTab;
  const tabs = [];
  if (hasEnv) tabs.push(`<button class="setup-tab ${activeTab === "env" ? "is-active" : ""}" type="button" role="tab" aria-selected="${activeTab === "env"}" data-setup-tab="env">.env</button>`);
  if (hasCommands) tabs.push(`<button class="setup-tab ${activeTab === "commands" ? "is-active" : ""}" type="button" role="tab" aria-selected="${activeTab === "commands"}" data-setup-tab="commands">Commands</button>`);
  const { text: envText, masked: maskedText } = envBuildOutputs();
  const envPanel = hasEnv ? `<div class="setup-panel" role="tabpanel" data-setup-panel="env" ${activeTab === "env" ? "" : "hidden"}><div class="env-list">${envVars.map((envVar, index) => envRowMarkup(envVar, index)).join("")}</div><div class="setup-actions"><button class="button button-primary" type="button" data-setup-copy-env ${envText ? "" : "disabled"}>${icon("copy")} Copy .env</button><button class="button button-secondary" type="button" data-setup-clear ${hasEnvInput(state.setup) ? "" : "hidden"}>Clear values</button></div><div class="setup-preview"><div class="setup-preview-head"><span>Generated .env</span><span class="setup-preview-note">Secret values are masked here and copied directly from this page.</span></div><pre class="setup-output-text" ${maskedText ? "" : "hidden"}>${escapeHtml(maskedText)}</pre><p class="setup-hint" ${maskedText ? "hidden" : ""}>Enter values to generate your .env file.</p></div><p class="setup-security">Values stay in this tab and are never sent or saved by AI-Dekrov.</p></div>` : "";
  const commandsPanel = hasCommands ? `<div class="setup-panel" role="tabpanel" data-setup-panel="commands" ${activeTab === "commands" ? "" : "hidden"}><div class="command-choices">${choices.map(commandChoiceMarkup).join("")}</div><div class="setup-actions"><button class="button button-primary" type="button" data-setup-copy-commands ${canCopyCommands(state.setup, tool, setup) ? "" : "disabled"}>${icon("copy")} Copy commands</button><button class="button button-secondary" type="button" data-report-install-issue aria-label="Report an installation or setup failure for ${escapeHtml(tool.name)}">${icon("bug")} Report install issue</button></div>${commandSequenceMarkup(tool, setup)}<p class="setup-security">Review commands before running them in your terminal.</p></div>` : "";
  return `<section class="detail-section setup-section"><h2>Setup</h2><p class="detail-caption">Build a local setup without leaving the page. AI-Dekrov never executes these commands.</p><div class="setup-tabs" role="tablist" aria-label="Setup builder">${tabs.join("")}</div>${envPanel}${commandsPanel}</section>`;
}
// Compute the .env preview/text for the currently opened tool. A malformed
// entered value (containing CR/LF/NUL bytes) must never crash the detail UI or
// surface the value, so any buildEnvText rejection collapses both outputs.
function envBuildOutputs() {
  const current = currentDetailSetup();
  if (!current || !state.setup) return { text: "", masked: "" };
  const envVars = current.setup.envVars || [];
  try {
    return {
      text: buildEnvTextForState(state.setup, envVars),
      masked: maskedEnvPreview(state.setup, envVars)
    };
  } catch {
    return { text: "", masked: "" };
  }
}
function updateEnvPreview() {
  const { text, masked } = envBuildOutputs();
  const pre = document.querySelector('[data-setup-panel="env"] .setup-output-text');
  const hint = document.querySelector('[data-setup-panel="env"] .setup-hint');
  if (pre) { pre.hidden = !masked; pre.textContent = masked; }
  if (hint) hint.hidden = Boolean(masked);
  const copyButton = document.querySelector("[data-setup-copy-env]");
  if (copyButton) copyButton.disabled = !text;
  const clearButton = document.querySelector("[data-setup-clear]");
  if (clearButton) clearButton.hidden = !hasEnvInput(state.setup);
}
function handleSetupEnvInput(event) {
  const input = event.target.closest("[data-env-input]");
  if (!input || !state.setup) return;
  const name = input.dataset.envInput;
  setEnvValue(state.setup, name, input.value);
  const row = input.closest(".env-row");
  const checkbox = row?.querySelector("[data-env-include]");
  if (checkbox) {
    const current = currentDetailSetup();
    const envVar = current?.setup.envVars?.find((entry) => entry.name === name);
    checkbox.checked = envVar ? envIncluded(state.setup, envVar) : false;
  }
  updateEnvPreview();
}
function handleRecipeInputChange(event) {
  const input = event.target.closest("[data-recipe-input]");
  if (!input || !state.setup) return;
  const parts = input.dataset.recipeInput.split(":");
  if (parts.length !== 2) return;
  setRecipeValue(state.setup, parts[0], parts[1], input.value);
  renderCatalog();
}
function renderProfileExtras(id) { const tool = state.tools.find((item) => item.id === id); const main = $("#detail-view .detail-main"); if (!tool || !main) return; const list = (values) => (values || []).filter(hasValue).map((value) => `<li>${escapeHtml(value)}</li>`).join(""); const bestFor = list(tool.bestFor); const notes = list(tool.usageNotes); if (!bestFor && !notes) return; main.insertAdjacentHTML("afterbegin", `${bestFor ? `<section class="detail-section profile-section"><h2>Best for</h2><ul class="profile-list">${bestFor}</ul></section>` : ""}${notes ? `<section class="detail-section profile-section"><h2>Usage notes</h2><ul class="profile-list">${notes}</ul></section>` : ""}`); }

function isToolInStack(id) { return state.stack.includes(id); }
function isToolInCollection(collection, id) { return collection?.toolIds.includes(id) || false; }
function ensureSavedDialogOpen() { const dialog = $("#saved-dialog"); if (!dialog.open) dialog.showModal(); }
function closeSavedDialog() { state.saveDialogContext = null; const dialog = $("#saved-dialog"); if (dialog?.open) dialog.close(); }
function openSaveDialog(toolId) { state.saveDialogContext = { mode: "save", toolId, collectionId: null }; renderSavedDialog(); ensureSavedDialogOpen(); }
function openNewCollectionDialog(collectionId = null) { state.saveDialogContext = { mode: "new", toolId: state.saveDialogContext?.toolId || null, collectionId }; renderSavedDialog(); ensureSavedDialogOpen(); }
function openRenameCollectionDialog(collectionId) { state.saveDialogContext = { mode: "rename", toolId: null, collectionId }; renderSavedDialog(); ensureSavedDialogOpen(); }
function openDeleteCollectionDialog(collectionId) { state.saveDialogContext = { mode: "delete", toolId: null, collectionId }; renderSavedDialog(); ensureSavedDialogOpen(); }
function renderSavedDialog() {
  const context = state.saveDialogContext; const inner = $("#saved-dialog-inner"); if (!context || !inner) return;
  if (context.mode === "save") { renderSavePicker(inner); return; }
  if (context.mode === "new") { renderNameForm(inner, { title: "New collection", confirm: "Create collection", placeholder: "e.g. Try later" }); return; }
  if (context.mode === "rename") { renderNameForm(inner, { title: "Rename collection", confirm: "Save name", value: collectionById(context.collectionId)?.name || "" }); return; }
  if (context.mode === "delete") { renderDeleteConfirm(inner); return; }
}
function renderSavePicker(inner) {
  const toolId = state.saveDialogContext.toolId; const tool = state.toolById.get(toolId);
  const stackActive = isToolInStack(toolId);
  const collectionRows = state.collections.collections.map((collection) => { const inCollection = isToolInCollection(collection, toolId); return `<button class="save-collection-row" type="button" data-toggle-collection="${escapeHtml(collection.id)}" aria-pressed="${inCollection}"><span class="check ${inCollection ? "is-checked" : ""}">${inCollection ? "✓" : ""}</span><span>${escapeHtml(collection.name)}</span><span class="save-collection-count">${collectionToolCount(collection)}</span></button>`; }).join("");
  inner.innerHTML = `<div class="saved-dialog-header"><div><p class="kicker">SAVE</p><h2 id="saved-dialog-title">Save tool</h2></div><button class="icon-button close-saved" type="button" data-close-dialog aria-label="Close">×</button></div><div class="saved-tool-label">${escapeHtml(tool?.name || toolId)}</div><div class="saved-stack-toggle"><span class="saved-list-name">My Stack</span><button class="stack-toggle-button ${stackActive ? "is-active" : ""}" type="button" data-toggle-stack aria-pressed="${stackActive}">${icon("stack")} ${stackActive ? "In My Stack" : "Add to My Stack"}</button></div><div class="saved-collections-section"><span class="saved-list-name">Collections</span><div class="save-collections-list">${collectionRows || '<span class="save-collections-empty">No collections yet.</span>'}</div><button class="new-collection-inline" type="button" data-new-collection>${icon("plus")} New collection</button></div><div class="dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Done</button></div>`;
}
function renderNameForm(inner, { title, confirm, value = "", placeholder = "Collection name" }) {
  inner.innerHTML = `<div class="saved-dialog-header"><div><p class="kicker">COLLECTIONS</p><h2 id="saved-dialog-title">${escapeHtml(title)}</h2></div><button class="icon-button" type="button" data-close-dialog aria-label="Close">×</button></div><form class="saved-name-form" data-saved-name-form><label class="form-field"><span>Name</span><input class="saved-name-input" type="text" maxlength="${MAX_COLLECTION_NAME}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autofocus /></label><div class="dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button button-primary" type="submit">${escapeHtml(confirm)}</button></div></form>`;
}
function renderDeleteConfirm(inner) {
  const collection = collectionById(state.saveDialogContext.collectionId);
  inner.innerHTML = `<div class="saved-dialog-header"><div><p class="kicker">COLLECTIONS</p><h2 id="saved-dialog-title">Delete collection?</h2></div><button class="icon-button" type="button" data-close-dialog aria-label="Close">×</button></div><p class="add-panel-copy">Delete <strong>${escapeHtml(collection?.name || "")}</strong> permanently? This does not delete any tools, but they will no longer appear in this collection.</p><div class="dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Cancel</button><button class="button button-primary button-danger" type="button" data-confirm-delete>${icon("trash")} Delete collection</button></div>`;
}
function flipCollectionMembership(collectionId) {
  const context = state.saveDialogContext; if (!context?.toolId) return;
  try { state.collections.collections = toggleToolInCollection(state.collections.collections, collectionId, context.toolId); saveCollections(); renderSavedDialog(); renderCatalog(); } catch (error) { showToast(error.message || "Could not update collection"); }
}
function commitSavedNameForm(form) {
  const context = state.saveDialogContext;
  const input = form.querySelector(".saved-name-input");
  const name = normalizeCollectionName(input?.value ?? "");
  try {
    if (context.mode === "new") {
      state.collections.collections = createCollectionAndAppend(state.collections.collections, name); saveCollections();
      closeSavedDialog();
      if (context.toolId) { openSaveDialog(context.toolId); } else { renderCollectionsView(); }
    } else if (context.mode === "rename") { state.collections.collections = renameCollection(state.collections.collections, context.collectionId, name); saveCollections(); closeSavedDialog(); renderCatalog(); }
  } catch (error) { showToast(error.message || "Could not save collection"); }
}
function syncUrlState() { setMobileDrawer(false); const route = parseRouteHash(location.hash); if (route?.type === "favorites") { state.favoritesOnly = true; state.category = ""; } else if (route?.type === "category") { state.category = route.id; state.favoritesOnly = false; } else if (!getDetailId()) { state.favoritesOnly = false; state.category = ""; } renderNavigation(); renderCatalog(); const restoreScroll = state.restoreScroll; state.restoreScroll = null; window.scrollTo({ top: restoreScroll ?? 0, behavior: restoreScroll == null ? "smooth" : "auto" }); }
function rememberCatalogPosition() { state.detailReturn = { hash: location.hash && !getDetailId() ? location.hash : "#/", query: state.query, pricing: state.pricing, platform: state.platform, executionMode: state.executionMode, noSignup: state.noSignup, noApiKey: state.noApiKey, sort: state.sort, catalogSort: state.catalogSort, scrollY: window.scrollY }; }
function restoreCatalogPosition() { const saved = state.detailReturn; state.detailReturn = null; if (!saved) { location.hash = "#/"; return; } state.query = saved.query; state.pricing = saved.pricing; state.platform = saved.platform; state.executionMode = saved.executionMode || ""; state.noSignup = Boolean(saved.noSignup); state.noApiKey = Boolean(saved.noApiKey); state.sort = saved.sort; state.catalogSort = saved.catalogSort || "recent"; $("#search-input").value = saved.query; $("#pricing-filter").value = saved.pricing; $("#platform-filter").value = saved.platform; $("#execution-filter").value = state.executionMode; $("#no-signup-filter").checked = state.noSignup; $("#no-api-key-filter").checked = state.noApiKey; $("#sort-select option[value=relevance]").hidden = !saved.query.trim(); $("#sort-select").value = saved.sort; state.restoreScroll = saved.scrollY; history.pushState(null, "", saved.hash); syncUrlState(); }
function setSearchQuery(value) { const next = String(value || ""); const wasActive = Boolean(state.query.trim()); const active = Boolean(next.trim()); if (!wasActive && active && state.sort !== "relevance") { state.catalogSort = state.sort; state.sort = "relevance"; } else if (wasActive && !active && state.sort === "relevance") { state.sort = state.catalogSort || "recent"; } state.query = next; $("#sort-select option[value=relevance]").hidden = !active; $("#sort-select").value = state.sort; }
function clearFilters() { setSearchQuery(""); state.category = ""; state.pricing = ""; state.platform = ""; state.executionMode = ""; state.noSignup = false; state.noApiKey = false; $("#search-input").value = ""; $("#pricing-filter").value = ""; $("#platform-filter").value = ""; $("#execution-filter").value = ""; $("#no-signup-filter").checked = false; $("#no-api-key-filter").checked = false; if (!getDetailId()) { const view = currentView(); let target = state.favoritesOnly ? "#/favorites" : "#/"; if (view?.type === "stack") target = "#/stack"; else if (view?.type === "collections") target = "#/collections"; else if (view?.type === "collection" || view?.type === "use-case" || view?.type === "shared") target = location.hash; history.replaceState(null, "", target); renderNavigation(); renderCatalog(); } }
let jsonCandidate = null;
let submissionDraft = null;
function setAddMode(mode) { $$("[data-add-mode]").forEach((tab) => { const active = tab.dataset.addMode === mode; tab.classList.toggle("is-active", active); tab.setAttribute("aria-selected", String(active)); }); $$("[data-add-panel]").forEach((panel) => { panel.hidden = panel.dataset.addPanel !== mode; }); if (mode === "manual") $("#tool-form [name=name]").focus(); if (mode === "smart") $("#smart-url").focus(); if (mode === "json") updateAiPrompt(); }
function resetAddDraft() { submissionDraft = null; $("#smart-add-form").reset(); $("#tool-form").reset(); $("#tool-form").dataset.source = "manual"; delete $("#tool-form").dataset.existingId; resetJsonImport(); $("#submission-review").hidden = true; }
function openDialog(mode = "smart") { resetAddDraft(); if (!$("#tool-dialog").open) $("#tool-dialog").showModal(); setAddMode(mode); }
function openSuggestDialog({ mode = "smart", name = "", url = "" } = {}) {
  openDialog(mode);
  if (mode === "manual" && name) $("#tool-form").elements.name.value = name;
  if (mode === "smart" && url) $("#smart-url").value = url;
}
function closeDialog() { $("#tool-dialog").close(); }
function makeId(name) { const stem = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tool"; const taken = new Set(state.tools.map((tool) => tool.id)); let id = stem; let index = 2; while (taken.has(id)) { id = `${stem}-${index}`; index += 1; } return id; }
function splitList(value = "") { return String(value).split(",").map((item) => item.trim()).filter(Boolean); }
function fillManualForm(tool) { const form = $("#tool-form"); ["name", "category", "pricing", "priceDetails", "description", "url", "domain", "favicon", "install", "start", "github", "docs"].forEach((key) => { const input = form.elements.namedItem(key); if (input) input.value = tool[key] || ""; }); ["executionMode", "signupRequirement", "apiKeyRequirement"].forEach((key) => { form.elements[key].value = tool[key] || "unknown"; }); form.elements.bestFor.value = (tool.bestFor || []).join(", "); form.elements.strengths.value = (tool.strengths || []).join(", "); form.elements.gettingStarted.value = (tool.gettingStarted || []).join("\n"); form.elements.usageNotes.value = (tool.usageNotes || []).join("\n"); form.elements.tags.value = (tool.tags || []).join(", "); form.elements.models.value = (tool.models || []).join(", "); form.querySelectorAll('input[name="platforms"]').forEach((input) => { input.checked = (tool.platforms || []).includes(input.value); }); form.dataset.source = tool.source || "manual"; }
function suggestName(domain) { return domain.split(".")[0].split(/[-_]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "); }
function handleSmartAdd(urlValue) {
  const url = getHttpUrl(urlValue);
  if (!url) { showToast("Enter a valid URL"); return; }
  if (!state.siteConfig?.githubRepository) { showToast("Set the GitHub repository in data/site-config.json first"); return; }
  const template = state.siteConfig.smartAddTemplate || "smart-add.yml";
  const context = $("#smart-context").value.trim();
  const params = new URLSearchParams({ template, title: `[Smart Add] ${suggestName(getDomain(url.href))}` });
  params.set("tool_url", url.href);
  if (context) params.set("context", context);
  window.open(`https://github.com/${state.siteConfig.githubRepository}/issues/new?${params.toString()}`, "_blank", "noopener");
  copyText([url.href, context].filter(Boolean).join("\n"));
  showToast("GitHub Issue Form opened — review and submit");
}
const AI_JSON_PROMPT_TEMPLATE = `
You are creating ONE canonical Tool JSON record for the AI-Dekrov AI tools catalog.

Your job is to research the tool using OFFICIAL PUBLIC SOURCES and return one factual JSON object that conforms exactly to AI-Dekrov Tool Schema v2.

TOOL_URL:
{{TOOL_URL}}

OPTIONAL_CONTEXT:
{{OPTIONAL_CONTEXT}}

# OUTPUT RULES

Return ONLY one valid JSON object.

Do NOT:
- use Markdown code fences;
- add explanations before or after the JSON;
- add comments;
- add citations outside JSON;
- invent fields;
- omit canonical fields listed below;
- use null;
- fabricate facts to avoid empty/unknown values.

The result must be directly pasteable into AI-Dekrov JSON Import.

# SOURCE POLICY

Use official evidence only.

Preferred source order:

1. official product website;
2. official documentation;
3. official GitHub repository;
4. official pricing page;
5. other official pages controlled by the product/vendor.

Do NOT rely on:
- Reddit;
- blogs;
- random tutorials;
- comparison websites;
- search-result snippets;
- community descriptions;
- unofficial repositories;
- general knowledge when official evidence does not confirm it.

If a fact cannot be verified from official evidence, leave it unknown according to the rules below.

# IMPORTANT CONSERVATIVE RULE

Accuracy is more important than completeness.

Never invent:
- features;
- commands;
- prices;
- models;
- installation instructions;
- platform support;
- signup requirements;
- API-key requirements;
- execution architecture;
- integrations.

If uncertain, use the appropriate empty or \`unknown\` value.

# EXACT OUTPUT STRUCTURE

Return exactly this field structure:

{
  "id": "",
  "name": "",
  "category": "",
  "description": "",
  "bestFor": [],
  "strengths": [],
  "gettingStarted": [],
  "usageNotes": [],
  "url": "",
  "domain": "",
  "favicon": "",
  "platforms": [],
  "executionMode": "unknown",
  "signupRequirement": "unknown",
  "apiKeyRequirement": "unknown",
  "pricing": "",
  "priceDetails": "",
  "tags": [],
  "install": "",
  "start": "",
  "commands": [],
  "models": [],
  "github": "",
  "docs": ""
}

Do NOT add:

- addedAt
- updatedAt
- lastVerifiedAt
- sources
- notes

Those are generated or managed separately by AI-Dekrov.

# FIELD RULES

## id

Stable lowercase kebab-case identifier.

Valid examples:

cursor
openrouter
openai-agents-sdk
visual-studio-code-agent

Rules:
- lowercase;
- numbers allowed;
- hyphens between words;
- no spaces;
- no underscores;
- no punctuation;
- use the actual product/tool name where possible.

Do not include company slogans or page titles in the ID.

## name

Official product/tool name.

Do not copy marketing slogans into the name.

Example:

Correct:
"Cursor"

Wrong:
"Cursor - The AI Code Editor"

## category

MUST be exactly one of:

- coding-agents
- orchestration
- chat-llm
- research
- audio
- dev-tools
- hosting
- other

Choose the category describing the tool's PRIMARY role.

Use \`other\` only when none of the defined categories reasonably fits.

Category guidance:

coding-agents
= AI coding agents, coding assistants, autonomous software-development agents

orchestration
= agent frameworks, multi-agent systems, AI workflow/orchestration frameworks

chat-llm
= general-purpose AI chat/model interfaces

research
= tools primarily intended for AI-assisted research/search/investigation

audio
= speech/audio AI tooling

dev-tools
= developer-focused AI infrastructure/utilities that are not primarily coding agents

hosting
= inference/API/model hosting/cloud AI infrastructure

other
= genuinely outside the above

## description

Short factual description of what the product is and does.

Prefer approximately 1-2 concise sentences.

Avoid:
- hype;
- "best";
- "revolutionary";
- unverifiable performance claims;
- repeating the product name unnecessarily.

## bestFor

Array of specific tasks or audiences the tool is particularly suitable for.

Examples:

[
  "Editing existing codebases with AI",
  "Terminal-based pair programming",
  "Developers using multiple LLM providers"
]

Use factual, specific phrases.

Do not fill this with generic marketing.

If evidence is insufficient:

[]

## strengths

Array of factual differentiators or strengths supported by official evidence.

Examples:

[
  "Supports multiple model providers",
  "Can edit files directly from the terminal",
  "Open-source repository available"
]

Only say "open-source" when an official repository/license clearly supports that claim.

Do NOT infer open-source merely because a GitHub repository exists.

If uncertain:

[]

## gettingStarted

Verified first-use steps.

One action per array item.

Example:

[
  "Install the CLI with npm",
  "Configure a supported model provider",
  "Run the CLI inside a project directory"
]

Do not invent setup steps.

If official instructions are insufficient:

[]

## usageNotes

Important verified operational details, workflows, limitations, menus, authentication requirements, or usage behavior.

Examples:

[
  "Supports both hosted and local model providers",
  "Provider configuration varies by selected model",
  "The VS Code extension requires authentication for cloud features"
]

Do not duplicate description unless useful.

If uncertain:

[]

## url

Official public product URL.

Must use http:// or https://.

Prefer the canonical product homepage rather than:
- tracking URLs;
- search URLs;
- unofficial mirrors.

## domain

Hostname from the official URL without protocol.

Example:

URL:
https://aider.chat/

domain:
aider.chat

Do not include paths.

## favicon

Public official favicon/logo URL when clearly available.

Must be an http(s) URL.

Prefer an asset hosted by the official domain.

Do not invent a favicon path unless it is actually valid.

If uncertain:

""

## platforms

Array containing ONLY values from:

- web
- desktop
- mobile
- browser-extension
- cli
- vscode
- api

Include only officially supported interfaces.

Examples:

CLI tool:

[
  "cli"
]

Hosted model API with web console:

[
  "web",
  "api"
]

VS Code extension:

[
  "vscode"
]

Do NOT classify generic editor plugins as \`browser-extension\`.

Do NOT add \`web\` merely because the product has a website.

A documentation or marketing website does not mean the tool itself is a web application.

# EXECUTION METADATA

These fields require especially conservative reasoning.

Do NOT infer them from platform labels alone.

## executionMode

MUST be exactly one of:

- local
- cloud
- hybrid
- unknown

This describes WHERE THE TOOL PRODUCT ITSELF OPERATES.

It does NOT describe where the selected AI model performs inference.

### local

Use when the core tool can operate as locally installed/self-hosted software without depending on a mandatory vendor-hosted product service.

Examples conceptually:
- local CLI;
- local framework;
- self-hosted agent runtime.

IMPORTANT:

A local CLI that calls OpenAI, Anthropic, OpenRouter, etc. can still be:

"executionMode": "local"

Remote model inference does NOT automatically make the tool cloud-based.

### cloud

Use when meaningful/core usage is primarily dependent on a vendor-hosted service.

Examples:
- hosted inference API;
- web-only hosted AI application;
- cloud platform.

### hybrid

Use when official supported operation meaningfully spans local/self-hosted AND hosted/cloud components or editions.

Also use hybrid when a locally installed client materially depends on a vendor cloud service for its core functionality.

Examples conceptually:
- product with official cloud and self-hosted editions;
- local IDE client with mandatory vendor-hosted AI backend;
- platform that genuinely provides both local framework and managed hosted infrastructure.

Do NOT use \`hybrid\` simply because a local application calls a third-party LLM API.

### unknown

Use when official evidence does not establish the architecture confidently.

Do NOT make these shortcuts:

CLI -> local
desktop -> local
VS Code -> local
web -> cloud
API -> cloud
supports Ollama -> local
supports OpenAI -> cloud

Investigate the actual product architecture.

# SIGNUP METADATA

## signupRequirement

MUST be exactly one of:

- required
- optional
- not-required
- depends
- unknown

This means PRODUCT ACCOUNT CREATION / SIGN-IN.

### required

A normal/core supported workflow requires creating or signing into an account.

### not-required

A normal/core officially supported workflow works without product account creation or sign-in.

### optional

Accounts exist and may provide additional functionality, but a normal supported workflow works without one.

### depends

The requirement materially differs by edition, interface, deployment, authentication method, or workflow.

### unknown

Official evidence is insufficient.

Important distinctions:

- downloading from GitHub is NOT signup;
- having a Login button does NOT prove signup is required;
- optional GitHub authentication does NOT automatically mean required signup;
- an API key and a user account are different concepts;
- OAuth/login and API keys must not be conflated.

# API KEY METADATA

## apiKeyRequirement

MUST be exactly one of:

- required
- optional
- not-required
- depends
- unknown

This field refers ONLY to a USER-PROVIDED API KEY.

OAuth, browser login, subscription authentication, vendor account sessions, automatically managed credentials, etc. are NOT API keys for this field.

### required

A normal/core workflow requires the user to supply an API key.

### not-required

A normal/core officially supported workflow works without the user supplying an API key.

### optional

BYOK/API-key configuration is supported, but at least one normal official workflow works without supplying a key.

Example conceptually:
- built-in hosted models are available;
- BYOK is additionally supported.

### depends

Whether a user-provided API key is needed materially depends on:
- selected provider;
- model;
- deployment;
- authentication path;
- workflow.

This is common for multi-provider developer tools.

Example:

Provider A -> OAuth
Provider B -> API key
Local Ollama -> neither

Then \`depends\` may be more accurate than \`optional\`.

### unknown

Official evidence is insufficient.

Do NOT infer:

supports OpenAI
-> API key required

The tool may also support OAuth, built-in models, subscriptions or local providers.

Do NOT infer:

supports local model
-> API key not required

unless that is a real supported normal workflow.

# PRICING

## pricing

MUST be exactly one of:

- free
- freemium
- paid
- usage-based
- ""

Use:

free
= normal product is free

freemium
= free tier plus paid plans/features

paid
= normal access requires payment/subscription

usage-based
= primarily billed by actual usage, tokens, API calls, compute, etc.

If pricing cannot be confidently verified:

""

Do not guess based on reputation.

## priceDetails

Short specific pricing information when officially verified.

Examples:

"$20/month Pro plan"

"Pay per token"

"Free tier available; paid usage beyond included quota"

If pricing is complicated, summarize conservatively.

If no reliable detail:

""

# TAGS

## tags

Short factual searchable keywords.

Examples:

[
  "coding",
  "agent",
  "cli",
  "open-source"
]

Avoid:
- marketing phrases;
- duplicate variants;
- unsupported claims.

Use lowercase where reasonable.

# INSTALL / START / COMMANDS

## install

Verified primary installation command.

Example:

"pip install aider-install"

Only provide an actual documented command.

Do not invent package names.

If no command exists or cannot be verified:

""

## start

Verified primary command to start/use the tool after installation.

Example:

"aider"

If uncertain:

""

## commands

Array of additional officially documented useful commands.

Each item MUST have exactly:

{
  "label": "",
  "command": ""
}

Example:

[
  {
    "label": "Run tests",
    "command": "npx agent-qa test"
  }
]

Do not represent commands as strings.

Do not invent useful-looking commands.

Do not duplicate \`install\` or \`start\` unnecessarily.

If none:

[]

# MODELS

## models

This field is STRICT.

Include ONLY actual AI model names or model families that the official evidence explicitly indicates the tool:

- supports;
- offers;
- runs;
- selects;
- configures;
- integrates as a model.

Examples of potentially valid entries:

[
  "Claude 4",
  "GPT-5",
  "Gemini 2.5",
  "DeepSeek R1"
]

Provider names are NOT models.

Do NOT include values such as:

- OpenAI
- Anthropic
- Google
- Azure OpenAI
- Amazon Bedrock
- AWS
- Hugging Face
- Replicate
- Ollama
- OpenRouter
- Groq

Those are providers, runtimes, platforms or marketplaces.

Do NOT include:
- "100+ models"
- "OpenAI-compatible models"
- "custom models"
- "local models"
- "other LLMs"
- model counts
- provider compatibility statements

A model being casually mentioned in documentation is NOT sufficient.

The official evidence must show that the TOOL actually supports/offers/selects/configures/runs it.

If this cannot be confidently established:

[]

Be conservative.

# github

Official GitHub repository URL for the product/project.

Do not use:
- unofficial forks;
- random plugins;
- unrelated company repositories.

If none:

""

# docs

Canonical official documentation URL.

Prefer the documentation homepage for the actual product.

If none can be verified:

""

# UNKNOWN VALUE RULES

For the three structured metadata fields, always use:

"executionMode": "unknown"
"signupRequirement": "unknown"
"apiKeyRequirement": "unknown"

when evidence is insufficient.

Do NOT use empty strings for those three fields.

For unknown ordinary scalar fields use:

""

For unknown list fields use:

[]

Never use:
- null
- "N/A"
- "none"
- "unsure"
- "probably"
- arbitrary values outside the enums

# CONSISTENCY CHECK

Before answering, internally verify:

1. JSON parses successfully.
2. There is exactly one JSON object.
3. All expected fields are present.
4. No unsupported fields are present.
5. id is lowercase kebab-case.
6. category is from the allowed enum.
7. platforms contain only allowed values.
8. executionMode is from its allowed enum.
9. signupRequirement is from its allowed enum.
10. apiKeyRequirement is from its allowed enum.
11. pricing is allowed or empty.
12. commands are objects with label + command.
13. models contain actual model names/families, not provider names.
14. generated metadata is absent.
15. all claims are supported by official evidence.
16. unknown execution/signup/API-key information uses \`unknown\`, not guesses.
17. OAuth/login has not been confused with an API key.
18. model inference location has not been confused with tool execution architecture.

Return ONLY the final JSON object.
`;

function buildAiPrompt() {
  const url = $("#prompt-url").value.trim() || "<PASTE_TOOL_URL>";
  const context = $("#prompt-context").value.trim();
  return AI_JSON_PROMPT_TEMPLATE.trim()
    .replace("{{TOOL_URL}}", () => url)
    .replace("{{OPTIONAL_CONTEXT}}", () => context);
}
function updateAiPrompt() { $("#ai-prompt").value = buildAiPrompt(); }
function setJsonErrors(errors = []) { const panel = $("#json-errors"); panel.hidden = errors.length === 0; panel.innerHTML = errors.length ? `<strong>Check the JSON:</strong><ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : ""; }
function resetJsonImport() { jsonCandidate = null; $("#prompt-url").value = ""; $("#prompt-context").value = ""; $("#json-import-input").value = ""; $("#json-preview").hidden = true; $("#json-import-confirm").hidden = true; $("#json-edit-manual").hidden = true; setJsonErrors(); updateAiPrompt(); }
function normalizeImportedTool(raw) {
  const errors = []; if (!raw || Array.isArray(raw) || typeof raw !== "object") errors.push("One JSON object is required.");
  if (errors.length) { const error = new Error(errors[0]); error.errors = errors; throw error; }
  const generated = new Set(state.schema.generated || []); const allowed = Object.keys(state.schema.properties).filter((key) => !generated.has(key)); const unknown = Object.keys(raw).filter((key) => !allowed.includes(key)); if (unknown.length) errors.push(`Unsupported fields: ${unknown.join(", ")}.`);
  const string = (key) => typeof raw[key] === "string" ? raw[key].trim() : raw[key] == null ? "" : (errors.push(`${key} must be a string.`), "");
  const enumValue = (key) => { const value = string(key); if (!value) return "unknown"; if (!schemaEnum(key).includes(value)) errors.push(`${key}: ${schemaEnum(key).join(", ")}.`); return value; };
  const list = (key) => { if (raw[key] == null) return []; if (!Array.isArray(raw[key])) { errors.push(`${key} must be an array.`); return []; } if (raw[key].some((item) => typeof item !== "string")) errors.push(`${key} must contain strings only.`); return raw[key].filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean); };
  const id = string("id"); const name = string("name"); const category = string("category"); const pricing = string("pricing"); const urlValue = string("url"); const url = urlValue ? getHttpUrl(urlValue) : null;
  if (!id) errors.push("id is required."); else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) errors.push("id must use kebab-case."); if (!name) errors.push("name is required."); if (!schemaEnum("category").includes(category)) errors.push(`category: ${schemaEnum("category").join(", ")}.`); if (pricing && !schemaEnum("pricing").includes(pricing)) errors.push(`pricing: ${schemaEnum("pricing").join(", ")}.`); if (!urlValue) errors.push("url is required."); else if (!url) errors.push("url must be a valid http(s) URL.");
  const platforms = list("platforms"); const invalidPlatforms = platforms.filter((item) => !schemaEnum("platforms").includes(item)); if (invalidPlatforms.length) errors.push(`Invalid platforms: ${invalidPlatforms.join(", ")}.`);
  const checkOptionalUrl = (key) => { const value = string(key); if (value && !getHttpUrl(value)) errors.push(`${key} must be a valid http(s) URL.`); return value; };
  const commands = raw.commands == null ? [] : Array.isArray(raw.commands) ? raw.commands.filter((item) => item && typeof item.label === "string" && typeof item.command === "string").map((item) => ({ label: item.label.trim(), command: item.command.trim() })) : (errors.push("commands must be an array."), []); if (Array.isArray(raw.commands) && commands.length !== raw.commands.length) errors.push("Each command requires string label and command values.");
  const domain = string("domain"); const description = string("description"); const bestFor = list("bestFor"); const strengths = list("strengths"); const gettingStarted = list("gettingStarted"); const usageNotes = list("usageNotes"); const executionMode = enumValue("executionMode"); const signupRequirement = enumValue("signupRequirement"); const apiKeyRequirement = enumValue("apiKeyRequirement"); const priceDetails = string("priceDetails"); const tags = list("tags"); const install = string("install"); const start = string("start"); const models = list("models"); const favicon = checkOptionalUrl("favicon"); const github = checkOptionalUrl("github"); const docs = checkOptionalUrl("docs");
  if (errors.length) { const error = new Error(errors[0]); error.errors = errors; throw error; }
  return { id, name, category, pricing, priceDetails, url: url?.href || "", domain: domain || getDomain(url?.href || ""), favicon, description, bestFor, strengths, gettingStarted, usageNotes, platforms, executionMode, signupRequirement, apiKeyRequirement, tags, install, start, commands, models, github, docs, source: "json" };
}
function renderJsonPreview(tool) { const meta = categoryMeta(tool.category); const price = priceSummary(tool); const details = [tool.url && `<a href="${escapeHtml(tool.url)}" target="_blank" rel="noreferrer">${escapeHtml(tool.domain || tool.url)}</a>`, tool.platforms.length && `<span>${escapeHtml(tool.platforms.map(labelize).join(" · "))}</span>`, tool.tags.length && `<span>${escapeHtml(tool.tags.join(", "))}</span>`].filter(Boolean).join(""); $("#json-preview").hidden = false; $("#json-preview").innerHTML = `<div class="json-preview-heading">Preview</div><div class="json-preview-card">${logoMarkup(tool, meta)}<div><strong>${escapeHtml(tool.name)}</strong><span>${escapeHtml(meta.label)} · ${escapeHtml(price)}</span>${tool.description ? `<p>${escapeHtml(tool.description)}</p>` : ""}<div class="json-preview-details">${details}</div></div></div>`; }
function publicSubmissionTool(tool) { const generated = new Set(state.schema.generated || []); return Object.fromEntries(Object.entries(tool).filter(([key]) => key !== "source" && !generated.has(key))); }
function comparableUrl(value) { try { const url = new URL(value); url.hash = ""; url.search = ""; url.pathname = url.pathname.replace(/\/$/, "") || "/"; return url.href.toLowerCase(); } catch { return ""; } }
function similarName(first, second) { const normalize = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); const a = normalize(first); const b = normalize(second); return Boolean(a && b && (a === b || a.includes(b) || b.includes(a))); }
function findPublicDuplicates(tool, excludeId = "") { return state.tools.filter((item) => item.id !== excludeId).flatMap((item) => { const reasons = []; if (item.id === tool.id) reasons.push("same id"); if (comparableUrl(item.url) && comparableUrl(item.url) === comparableUrl(tool.url)) reasons.push("same URL");  if (similarName(item.name, tool.name)) reasons.push("similar name"); return reasons.length ? [{ ...item, reasons }] : []; }); }
function renderSubmissionReview() { const tool = submissionDraft.tool; const meta = categoryMeta(tool.category); const duplicates = findPublicDuplicates(tool, submissionDraft.type === "update" ? submissionDraft.existingToolId : ""); const type = submissionDraft.type === "update" ? `Update: ${submissionDraft.existingToolId}` : "New tool"; const price = priceSummary(tool); $("#submission-preview").innerHTML = `<div class="json-preview-heading">${escapeHtml(type)}</div><div class="json-preview-card">${logoMarkup(tool, meta)}<div><strong>${escapeHtml(tool.name)}</strong><span>${escapeHtml(meta.label)} · ${escapeHtml(price)}</span>${tool.description ? `<p>${escapeHtml(tool.description)}</p>` : ""}</div></div>`; $("#submission-instructions").innerHTML = submissionDraft.type === "update" ? `You need a GitHub account to submit. The JSON is copied and the official Issue Form opens next. Choose <strong>update</strong>, enter Existing tool ID: <strong>${escapeHtml(submissionDraft.existingToolId)}</strong>, then paste the JSON into Tool JSON.` : "You need a GitHub account to submit. The JSON is copied and the official Issue Form opens next. Choose <strong>new</strong>, then paste the JSON into Tool JSON."; const warning = $("#duplicate-warning"); warning.hidden = duplicates.length === 0; warning.innerHTML = duplicates.length ? `<strong>A similar entry already exists in the catalog</strong><ul>${duplicates.map((item) => `<li>${escapeHtml(item.name)} (${escapeHtml(item.reasons.join(", "))})</li>`).join("")}</ul>` : ""; }
function prepareSubmission(tool) { const safeTool = publicSubmissionTool(tool); submissionDraft = { type: submissionDraft?.type || "new", existingToolId: submissionDraft?.existingToolId || "", tool: safeTool }; renderSubmissionReview(); setAddMode("review"); showToast("Submission prepared"); }
function openGitHubIssue() { if (!submissionDraft || !state.siteConfig?.githubRepository) { showToast("Set the GitHub repository in data/site-config.json first"); return; } const params = new URLSearchParams({ template: state.siteConfig.issueTemplate || "tool-submission.yml", title: `[Tool] ${submissionDraft.tool.name}` }); window.open(`https://github.com/${state.siteConfig.githubRepository}/issues/new?${params.toString()}`, "_blank", "noopener"); copyText(JSON.stringify(submissionDraft.tool, null, 2)); showToast("GitHub Issue Form opened — paste the copied JSON there"); }
function startUpdateSubmission(tool) { openDialog("manual"); submissionDraft = { type: "update", existingToolId: tool.id, tool: null }; fillManualForm(tool); $("#tool-form").dataset.existingId = tool.id; showToast("Edit the details and submit them for moderation"); }
function saveNewTool(form) {
  const fields = new FormData(form); const name = fields.get("name").trim();
  const tool = { id: form.dataset.existingId || makeId(name), name, category: fields.get("category"), description: fields.get("description").trim(), bestFor: splitList(fields.get("bestFor")), strengths: splitList(fields.get("strengths")), gettingStarted: String(fields.get("gettingStarted") || "").split("\n").map((x) => x.trim()).filter(Boolean), usageNotes: String(fields.get("usageNotes") || "").split("\n").map((x) => x.trim()).filter(Boolean), url: fields.get("url").trim(), domain: fields.get("domain").trim(), favicon: fields.get("favicon").trim(), platforms: [...form.querySelectorAll('input[name="platforms"]:checked')].map((input) => input.value), executionMode: fields.get("executionMode"), signupRequirement: fields.get("signupRequirement"), apiKeyRequirement: fields.get("apiKeyRequirement"), pricing: fields.get("pricing"), priceDetails: fields.get("priceDetails").trim(), tags: splitList(fields.get("tags")), install: fields.get("install").trim(), start: fields.get("start").trim(), commands: [], models: splitList(fields.get("models")), github: fields.get("github").trim(), docs: fields.get("docs").trim() };
  try { prepareSubmission({ ...normalizeImportedTool(tool), source: form.dataset.source || "manual" }); } catch (error) { setAddMode("manual"); showToast(error.errors?.[0] || error.message || "Check the required fields"); }
}
let toastTimer;
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("is-visible"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1800); }
async function copyText(value, message = "Copied") { try { await navigator.clipboard.writeText(value); showToast(message); } catch { showToast("Could not copy to clipboard"); } }
function toggleFavorite(id) { if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id); localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites])); renderNavigation(); renderCatalog(); }

let searchInputTimer;
function bindEvents() {
  $("#theme-toggle").addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark")); $("#add-tool-button").addEventListener("click", () => openDialog("smart")); $("#info-button").addEventListener("click", () => $("#info-dialog").showModal()); $$('[data-add-mode]').forEach((button) => button.addEventListener("click", () => setAddMode(button.dataset.addMode))); $$("[data-close-dialog]").forEach((button) => button.addEventListener("click", closeDialog)); $$("[data-close-info]").forEach((button) => button.addEventListener("click", () => $("#info-dialog").close())); $("#tool-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeDialog(); }); $("#tool-dialog").addEventListener("close", resetAddDraft); $("#info-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) $("#info-dialog").close(); }); $("#smart-add-form").addEventListener("submit", (event) => { event.preventDefault(); handleSmartAdd($("#smart-url").value); }); $("#tool-form").addEventListener("submit", (event) => { event.preventDefault(); saveNewTool(event.currentTarget); }); $("#prompt-url").addEventListener("input", updateAiPrompt); $("#prompt-context").addEventListener("input", updateAiPrompt); $("#copy-ai-prompt").addEventListener("click", () => copyText($("#ai-prompt").value)); $("#reset-json-import").addEventListener("click", resetJsonImport); $("#json-validate").addEventListener("click", () => { try { const raw = JSON.parse($("#json-import-input").value); jsonCandidate = normalizeImportedTool(raw); $("#json-import-input").value = JSON.stringify(raw, null, 2); setJsonErrors(); renderJsonPreview(jsonCandidate); $("#json-import-confirm").hidden = false; $("#json-edit-manual").hidden = false; showToast("JSON validated"); } catch (error) { jsonCandidate = null; $("#json-preview").hidden = true; $("#json-import-confirm").hidden = true; $("#json-edit-manual").hidden = true; setJsonErrors(error.errors || [error.message || "Could not parse JSON."]); } }); $("#json-edit-manual").addEventListener("click", () => { if (!jsonCandidate) return; fillManualForm(jsonCandidate); setAddMode("manual"); showToast("You can edit the fields"); }); $("#json-import-confirm").addEventListener("click", () => { if (!jsonCandidate) return; prepareSubmission(jsonCandidate); }); $("#submission-edit").addEventListener("click", () => { if (!submissionDraft?.tool) return; fillManualForm(submissionDraft.tool); $("#tool-form").dataset.existingId = submissionDraft.existingToolId || ""; setAddMode("manual"); }); $("#submission-open-issue").addEventListener("click", openGitHubIssue);
  $("#mobile-menu-toggle").addEventListener("click", () => setMobileDrawer(!$("#sidebar").classList.contains("is-open"))); $("#drawer-backdrop").addEventListener("click", () => setMobileDrawer(false)); $("#search-input").addEventListener("input", (event) => { setSearchQuery(event.target.value); clearTimeout(searchInputTimer); searchInputTimer = setTimeout(renderCatalog, 90); }); $("#pricing-filter").addEventListener("change", (event) => { state.pricing = event.target.value; renderCatalog(); }); $("#platform-filter").addEventListener("change", (event) => { state.platform = event.target.value; renderCatalog(); }); $("#execution-filter").addEventListener("change", (event) => { state.executionMode = event.target.value; renderCatalog(); }); $("#no-signup-filter").addEventListener("change", (event) => { state.noSignup = event.target.checked; renderCatalog(); }); $("#no-api-key-filter").addEventListener("change", (event) => { state.noApiKey = event.target.checked; renderCatalog(); }); $("#sort-select").addEventListener("change", (event) => { state.sort = event.target.value; if (state.sort !== "relevance") state.catalogSort = state.sort; renderCatalog(); });  $("#clear-filters").addEventListener("click", clearFilters);  $("#empty-action").addEventListener("click", (event) => { const recovery = event.currentTarget.dataset.recovery; if (recovery === "clear") { clearFilters(); return; } if (recovery === "browse") { location.hash = "#/"; return; } openDialog(); }); $("#missing-tool-action").addEventListener("click", (event) => { const button = event.currentTarget; const value = button.dataset.missingToolValue || ""; if (button.dataset.missingToolMode === "smart") openSuggestDialog({ mode: "smart", url: value }); else openSuggestDialog({ mode: "manual", name: value }); });
  $("#new-collection-button").addEventListener("click", () => openNewCollectionDialog());
  $("#saved-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeSavedDialog(); });
  $("#saved-dialog").addEventListener("close", () => { state.saveDialogContext = null; });
  document.addEventListener("submit", (event) => { const nameForm = event.target.closest("[data-saved-name-form]"); if (nameForm) { event.preventDefault(); commitSavedNameForm(nameForm); } });
  document.addEventListener("click", (event) => { const category = event.target.closest("[data-category-filter]"); if (category) { state.category = category.dataset.categoryFilter; history.replaceState(null, "", state.category ? `#/category/${encodeURIComponent(state.category)}` : "#/"); renderNavigation(); renderCatalog(); } const toolDetail = event.target.closest("[data-tool-detail]"); if (toolDetail) rememberCatalogPosition(); const back = event.target.closest("[data-back-catalog]"); if (back) restoreCatalogPosition();    const favorite = event.target.closest("[data-favorite]"); if (favorite) { event.preventDefault(); toggleFavorite(favorite.dataset.favorite); }
    const startOption = event.target.closest("[data-start-option]"); if (startOption) { event.preventDefault(); const parts = startOption.dataset.startOption.split(":"); setStartAnswer(parts[0], parts[1]); }
    const startBack = event.target.closest("[data-start-back]"); if (startBack) { event.preventDefault(); goStartBack(); }
    const startOver = event.target.closest("[data-start-over]"); if (startOver) { event.preventDefault(); state.startHere.answers = {}; renderStartHere(); }
    const startRelax = event.target.closest("[data-start-relax]"); if (startRelax) { event.preventDefault(); delete state.startHere.answers[startRelax.dataset.startRelax]; renderStartHere(); }
    const saveTool = event.target.closest("[data-save-tool]"); if (saveTool) { event.preventDefault(); openSaveDialog(saveTool.dataset.saveTool); }
    const toggleStack = event.target.closest("[data-toggle-stack]"); if (toggleStack) { event.preventDefault(); const context = state.saveDialogContext; if (context?.toolId) { state.stack = toggleStackTool(state.stack, context.toolId); saveStack(); renderSavedDialog(); renderCatalog(); } }
    const toggleCollection = event.target.closest("[data-toggle-collection]"); if (toggleCollection) { event.preventDefault(); flipCollectionMembership(toggleCollection.dataset.toggleCollection); }
    const newCollection = event.target.closest("[data-new-collection]"); if (newCollection) { event.preventDefault(); openNewCollectionDialog(); }
    const renameCollectionButton = event.target.closest("[data-rename-collection]"); if (renameCollectionButton) { event.preventDefault(); openRenameCollectionDialog(renameCollectionButton.dataset.renameCollection); }
    const shareCollectionButton = event.target.closest("[data-share-collection]"); if (shareCollectionButton) { event.preventDefault(); const collection = collectionById(shareCollectionButton.dataset.shareCollection); if (collection) { copyText(sharedCollectionUrl(collection, window.location), "Share link copied"); } }
    const deleteCollectionButton = event.target.closest("[data-delete-collection]"); if (deleteCollectionButton) { event.preventDefault(); openDeleteCollectionDialog(deleteCollectionButton.dataset.deleteCollection); }
    const sharedSave = event.target.closest("[data-shared-save]"); if (sharedSave) { event.preventDefault(); const shared = state.shared; if (shared) { const importer = importSharedCollection(state.collections.collections, shared.payload, new Set(state.toolById.keys())); if (!importer) { showToast("Nothing to save in this shared collection"); return; } state.collections.collections = importer.collections; saveCollections(); showToast("Collection saved"); location.hash = `#/collections/${encodeURIComponent(importer.collection.id)}`; } }
    const confirmDelete = event.target.closest("[data-confirm-delete]"); if (confirmDelete) { event.preventDefault(); const context = state.saveDialogContext; if (context?.collectionId) { state.collections.collections = deleteCollection(state.collections.collections, context.collectionId); saveCollections(); closeSavedDialog(); renderCatalog(); showToast("Collection deleted"); } }
    if (event.target.closest("[data-close-dialog]") && event.target.closest("#saved-dialog")) { event.preventDefault(); closeSavedDialog(); } const update = event.target.closest("[data-propose-update]"); if (update) { const tool = state.tools.find((item) => item.id === update.dataset.proposeUpdate); if (tool) startUpdateSubmission(tool); } const saveNote = event.target.closest("[data-note-save]"); if (saveNote) { savePersonalNote(saveNote.dataset.noteSave, $("#personal-note-input").value); renderDetail(saveNote.dataset.noteSave); showToast("Personal note saved"); } const deleteNote = event.target.closest("[data-note-delete]"); if (deleteNote) { savePersonalNote(deleteNote.dataset.noteDelete, ""); renderDetail(deleteNote.dataset.noteDelete); showToast("Personal note deleted"); }    const copy = event.target.closest("[data-copy]"); if (copy) copyText(copy.dataset.copy);
    const setupTab = event.target.closest("[data-setup-tab]"); if (setupTab) { event.preventDefault(); if (state.setup) state.setup.tab = setupTab.dataset.setupTab; renderCatalog(); }
    const envInclude = event.target.closest("[data-env-include]"); if (envInclude) { const current = currentDetailSetup(); const envVar = current?.setup.envVars?.find((entry) => entry.name === envInclude.dataset.envInclude); if (envVar && state.setup) { toggleEnvInclude(state.setup, envVar, envInclude.checked); renderCatalog(); } }
    const envReveal = event.target.closest("[data-env-reveal]"); if (envReveal) { event.preventDefault(); if (state.setup) { const name = envReveal.dataset.envReveal; if (state.setup.reveal.has(name)) state.setup.reveal.delete(name); else state.setup.reveal.add(name); renderCatalog(); } }
    const setupClear = event.target.closest("[data-setup-clear]"); if (setupClear) { event.preventDefault(); if (state.setup) { clearEnvState(state.setup); renderCatalog(); showToast("Values cleared"); } }
    const copyEnv = event.target.closest("[data-setup-copy-env]"); if (copyEnv) { event.preventDefault(); const { text } = envBuildOutputs(); if (text) copyText(text, ".env copied"); }
    const copyCommands = event.target.closest("[data-setup-copy-commands]"); if (copyCommands) { event.preventDefault(); const current = currentDetailSetup(); if (current && state.setup) { const text = selectedCommandOutputs(state.setup, current.tool, current.setup).text; if (text) copyText(text, "Commands copied"); } }
    const reportInstall = event.target.closest("[data-report-install-issue]"); if (reportInstall) { event.preventDefault(); const current = currentDetailSetup(); if (!current) return; if (!state.siteConfig?.githubRepository) { showToast("Set the GitHub repository in data/site-config.json first"); return; } const url = installFailureIssueUrl(current.tool, state.siteConfig.githubRepository, state.siteConfig.installFailureTemplate || INSTALL_FAILURE_TEMPLATE); if (url) { window.open(url, "_blank", "noopener"); showToast("Install failure report form opened — fill it on GitHub"); } }
    const commandToggle = event.target.closest("[data-command-toggle]"); if (commandToggle) { if (state.setup) { toggleCommandSelected(state.setup, commandToggle.dataset.commandToggle); renderCatalog(); } }
    const commandMove = event.target.closest("[data-command-move]"); if (commandMove) { event.preventDefault(); if (state.setup) { const parts = commandMove.dataset.commandMove.split(":"); moveCommand(state.setup, parts[0], Number(parts[1])); renderCatalog(); } }
    if (event.target.closest(".nav-item, .category-link")) setMobileDrawer(false); });
  document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#search-input").focus(); } if (event.key === "Escape" && $("#sidebar").classList.contains("is-open")) setMobileDrawer(false); if (event.key === "Escape" && $("#tool-dialog").open) closeDialog(); if (event.key === "Escape" && $("#info-dialog").open) $("#info-dialog").close(); if (event.key === "Escape" && $("#saved-dialog").open) closeSavedDialog(); }); window.addEventListener("hashchange", syncUrlState); window.addEventListener("resize", () => { if (!window.matchMedia("(max-width: 980px)").matches) setMobileDrawer(false); }); document.addEventListener("input", handleSetupEnvInput); document.addEventListener("change", handleRecipeInputChange);
}
const DATA_CACHE_BUST = Date.now();
function fetchJson(path, { bust = false } = {}) { return fetch(bust ? `${path}?v=${DATA_CACHE_BUST}` : path, { cache: "no-store" }); }
async function init() {
  setTheme(state.theme);
  renderStaticIcons();
  bindEvents();
  try {
    const [toolsResponse, schemaResponse, configResponse, useCasesResponse, startHereResponse, setupResponse] = await Promise.all([
      fetchJson("data/tools.json", { bust: true }),
      fetchJson("data/tool-schema.json"),
      fetchJson("data/site-config.json"),
      fetchJson("data/use-cases.json").catch(() => null),
      fetchJson(START_HERE_PATH).catch(() => null),
      fetchJson(SETUP_RECIPES_PATH).catch(() => null)
    ]);
    if (!requiredResponsesAreOk([toolsResponse, schemaResponse, configResponse])) throw new Error("Could not load catalog data");
    state.baseTools = await toolsResponse.json();
    state.schema = await schemaResponse.json();
    state.siteConfig = await configResponse.json();
    const [useCasesSource, startHereSource, setupSource] = await Promise.all([
      readOptionalJson(useCasesResponse),
      readOptionalJson(startHereResponse),
      readOptionalJson(setupResponse)
    ]);
    state.useCases = parseUseCases(useCasesSource);
    state.startHere.config = startHereSource ? parseStartHere(startHereSource, { platforms: schemaEnum("platforms"), pricing: schemaEnum("pricing") }) : { version: 1, steps: [] };
    state.setupRecipes = parseOptionalSetupRecipes(setupSource, new Set(state.baseTools.map((tool) => tool.id)));
    state.searchEngine = createCatalogSearch(state.baseTools);
    renderSchemaControls();
    updateAiPrompt();
    refreshTools();
    renderNavigation();
    syncUrlState();
  } catch (error) {
    console.error(error);
    $("#tools-grid").innerHTML = '<div class="empty-state"><h2>Could not load the catalog</h2><p>Run the site through a local server and refresh the page.</p></div>';
  }
}
init();
