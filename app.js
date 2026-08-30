import { createCatalogSearch, filterCatalogTools, formatDetectedFilters, matchesParsedFilters } from "./assets/js/search-engine.js";
import { COLLECTIONS_KEY, STACK_KEY, STACK_NAME, MAX_COLLECTION_NAME, createCollectionAndAppend, deleteCollection, filterKnownIds, normalizeCollectionName, parseCollections, parseStack, renameCollection, toggleStackTool, toggleToolInCollection } from "./assets/js/saved-library.js";
import { parseUseCases, resolveUseCaseTools, useCaseById, useCaseCount } from "./assets/js/use-cases.js";
import { START_HERE_PATH, DEFAULT_PRIMARY_LIMIT, applyStartAnswer, computeCandidates, findOption, parseStartHere, resolveGoal } from "./assets/js/start-here.js";
import { parseRouteHash, readOptionalJson, requiredResponsesAreOk } from "./assets/js/app-runtime-helpers.js";

const CATEGORY_META = {
  "coding-agents": { label: "Coding agents", short: "Coding", color: "#d2f25b" }, orchestration: { label: "Orchestration", short: "Agents", color: "#c2a5ff" },
  "chat-llm": { label: "Chat / LLM", short: "Chat / LLM", color: "#8db7ff" }, research: { label: "Research", short: "Research", color: "#ffb26b" },
  audio: { label: "Audio", short: "Audio", color: "#8db7ff" }, "dev-tools": { label: "Dev tools", short: "Dev tools", color: "#d2f25b" },
  hosting: { label: "Hosting / Infrastructure", short: "Hosting", color: "#ffb26b" }, other: { label: "Other", short: "Other", color: "#98a0ad" }
};
const PRICE_LABELS = { free: "Free", freemium: "Freemium", paid: "Paid", "usage-based": "Usage-based" };
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
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></svg>'
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

const state = { schema: null, siteConfig: null, searchEngine: null, searchIntent: null, searchPhase: "catalog", baseTools: [], tools: [], toolById: new Map(), query: "", category: "", pricing: "", platform: "", favoritesOnly: false, sort: "recent", catalogSort: "recent", favorites: new Set(readStoredArray(FAVORITES_KEY)), personalNotes: readStoredObject(PERSONAL_NOTES_KEY), theme: localStorage.getItem(THEME_KEY) || "dark", detailReturn: null, collections: parseCollections(localStorage.getItem(COLLECTIONS_KEY)), stack: parseStack(localStorage.getItem(STACK_KEY)), saveDialogContext: null, useCases: [], startHere: { config: null, answers: {} } };
function refreshTools() { state.tools = [...state.baseTools]; state.toolById = new Map(state.baseTools.map((tool) => [tool.id, tool])); }
function saveCollections() { localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(state.collections)); renderNavigation(); }
function saveStack() { localStorage.setItem(STACK_KEY, JSON.stringify(state.stack)); renderNavigation(); }
function collectionById(id) { return state.collections.collections.find((collection) => collection.id === id); }
function stackCount() { return state.stack.filter((id) => state.toolById.has(id)).length; }
function collectionToolCount(collection) { return collection ? filterKnownIds(collection.toolIds, new Set(state.toolById.keys())).length : 0; }
function pricingLabel(pricing) { return PRICE_LABELS[pricing] || "Not specified"; }
function priceSummary(tool) { return tool.pricing ? [pricingLabel(tool.pricing), tool.priceDetails].filter(Boolean).join(" · ") : tool.priceDetails || "Not specified"; }
function personalNote(id) { return state.personalNotes[id] || ""; }
function savePersonalNote(id, note) { const value = note.trim(); if (value) state.personalNotes[id] = value; else delete state.personalNotes[id]; localStorage.setItem(PERSONAL_NOTES_KEY, JSON.stringify(state.personalNotes)); }
function schemaEnum(name) { const definition = state.schema?.properties?.[name]; return definition?.enum || definition?.items?.enum || []; }
function renderSchemaControls() { const categoryOptions = schemaEnum("category").map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(categoryMeta(id).label)}</option>`).join(""); const priceOptions = schemaEnum("pricing").map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(pricingLabel(id))}</option>`).join(""); const platformOptions = schemaEnum("platforms").map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(labelize(id))}</option>`).join(""); $("#tool-form [name=category]").innerHTML = categoryOptions; $("#tool-form [name=pricing]").innerHTML = `<option value="">Select a price</option>${priceOptions}`; $("#pricing-filter").innerHTML = `<option value="">Any</option>${priceOptions}`; $("#platform-filter").innerHTML = `<option value="">Any</option>${platformOptions}`; }
function getHttpUrl(value) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url : null; } catch { return null; } }
function getDomain(value) { return getHttpUrl(value)?.hostname.replace(/^www\./, "") || ""; }
function logoMarkup(tool, meta, detail = false) { const className = detail ? "detail-logo" : "tool-logo"; const image = hasValue(tool.favicon) ? `<img class="tool-favicon" src="${escapeHtml(tool.favicon)}" alt="" onerror="this.remove()" />` : ""; return `<div class="${className}" style="--logo-color:${meta.color};--logo-bg:${meta.color}18;--logo-border:${meta.color}35">${image}<span>${escapeHtml(initials(tool.name))}</span></div>`; }

function setTheme(theme) { state.theme = theme; document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme); $("#theme-toggle").innerHTML = icon(theme === "dark" ? "sun" : "moon"); $("#theme-toggle").setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme"); }
function renderStaticIcons() { $$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); }); $("#mobile-menu-toggle").innerHTML = icon("menu"); }
function setDocumentMeta(title = "AI-Dekrov", description = DEFAULT_DESCRIPTION) { document.title = title; const descriptionTag = document.querySelector('meta[name="description"]'); if (descriptionTag) descriptionTag.content = description || DEFAULT_DESCRIPTION; }
function formatDate(value) { if (!hasValue(value)) return ""; const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date); }
function sourceLabel(value) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value; } }

function currentView() {
  const route = parseRouteHash(location.hash);
  return ["start", "use-cases", "use-case", "stack", "collection", "collections"].includes(route?.type) ? route : null;
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
  if (hash === "#/start") active = "start";
  else if (hash === "#/favorites") active = "favorites";
  else if (hash === "#/use-cases" || hash.startsWith("#/use-cases/")) active = "use-cases";
  else if (hash === "#/stack") active = "stack";
  else if (hash === "#/collections" || hash.startsWith("#/collections/")) active = "collections";
  $$("[data-nav]").forEach((item) => item.classList.toggle("is-active", item.dataset.nav === active && !getDetailId()));
}

function getFilteredTools() {
  const options = { category: state.category, pricing: state.pricing, platform: state.platform, favoritesOnly: state.favoritesOnly, favoriteIds: state.favorites, allowedIds: viewAllowedIds() };
  const result = state.searchEngine
    ? state.searchEngine.search(state.query, options)
    : { tools: filterCatalogTools(state.tools, options), parsed: null, queryActive: false, phase: "catalog" };
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
  $("#start-view").hidden = !isStart;
  $("#use-cases-view").hidden = !isUseCasesIndex;
  $("#collections-view").hidden = !isCollectionsIndex;
  $("#catalog-view").hidden = detail;
  $(".toolbar").hidden = detail || isCollectionsIndex || isUseCasesIndex || isStart;
  $(".results-head").hidden = detail || isCollectionsIndex || isUseCasesIndex || isStart;
  $("#tools-grid").hidden = detail || isCollectionsIndex || isUseCasesIndex || isStart;
  $("#detail-view").hidden = !detail;
  if (detail) { renderDetail(detailId); renderProfileExtras(detailId); return; }
  if (isStart) { setDocumentMeta("Start Here — AI-Dekrov"); renderStartHere(); return; }
  if (isCollectionsIndex) { setDocumentMeta("Collections — AI-Dekrov"); renderCollectionsView(); return; }
  if (isUseCasesIndex) { setDocumentMeta("Use cases — AI-Dekrov"); renderUseCasesView(); return; }
  const tools = getFilteredTools(); const active = Boolean(state.query || state.category || state.pricing || state.platform);
  const useCase = currentUseCase();
  const viewTitle = view?.type === "use-case" ? (useCase?.name || "Use case") : view?.type === "stack" ? "My Stack" : view?.type === "collection" ? (collectionById(view.id)?.name || "Collection") : state.favoritesOnly || location.hash === "#/favorites" ? "Favorites" : state.category ? categoryMeta(state.category).label : "All tools";
  setDocumentMeta(viewTitle === "AI-Dekrov" ? "AI-Dekrov" : `${viewTitle} — AI-Dekrov`);
  $("#tools-grid").innerHTML = tools.map(toolCard).join(""); $("#results-count").textContent = tools.length; $("#results-title").textContent = viewTitle; $("#clear-filters").hidden = !active; $("#empty-state").hidden = tools.length > 0; $("#empty-state .empty-icon").dataset.icon = view?.type === "stack" ? "stack" : view?.type === "collection" ? "folder" : view?.type === "use-case" ? "layers" : "search"; $("#empty-state .empty-icon").innerHTML = icon($("#empty-state .empty-icon").dataset.icon);
  if (!tools.length) {
    const queryActive = Boolean(state.query.trim());
    const detected = formatDetectedFilters(state.searchIntent);
    let title = queryActive ? "No matching tools found" : active ? "Nothing found" : "No tools yet";
    let copy = queryActive ? `Try removing a filter or using fewer keywords.${detected ? ` Detected: ${detected}.` : ""}` : active ? "Change the search or clear the filters." : "Suggest the first tool to start the catalog.";
    let action = active ? "Clear filters" : "Suggest a tool";
    if (view?.type === "stack") { title = queryActive ? "No matching tools in your stack" : "Your stack is empty"; copy = queryActive ? "Try a different search within your stack." : "Add tools you actively use together. Open a tool and press Save to build your stack."; action = "Browse all tools"; }
    if (view?.type === "collection") { title = queryActive ? "No matching tools in this collection" : "This collection is empty"; copy = queryActive ? "Try a different search within this collection." : "Add tools to this collection from any tool card or detail page."; action = "Browse all tools"; }
    if (view?.type === "use-case") { title = queryActive ? `No matching tools in ${useCase?.name || "this use case"}` : "No tools in this use case"; copy = queryActive ? "Try a different search within this use case." : "This use case has no valid tools in the current catalog."; action = "Browse all tools"; }
    $("#empty-state h2").textContent = title;
    $("#empty-state p").textContent = copy;
    $("#empty-action").textContent = action;
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
    inner.innerHTML = `<div class="start-empty"><p class="kicker">START HERE</p><h2>Nothing to show</h2><p>The selected goal is no longer available.</p><div class="start-controls"><button class="button button-secondary" type="button" data-start-back>${icon("arrowLeft")} Back</button><button class="button button-secondary" type="button" data-start-over>Start over</button></div></div>`;
    return;
  }
  const chips = startReasonChips(steps);
  const chipsHtml = chips.length ? `<p class="start-reasons">${chips.map((chip) => `<span class="tag">${escapeHtml(chip)}</span>`).join("")}</p>` : "";
  if (!result.total) {
    const relaxActions = [];
    if (state.startHere.answers.pricing) relaxActions.push(`<button class="button button-secondary" type="button" data-start-relax="pricing">Remove pricing preference</button>`);
    if (state.startHere.answers.platform) relaxActions.push(`<button class="button button-secondary" type="button" data-start-relax="platform">Remove platform preference</button>`);
    inner.innerHTML = `<div class="start-empty"><p class="kicker">YOUR PATH</p><h2>No exact matches</h2><p>${escapeHtml(result.useCase.name)} has no tools matching your choices. Try relaxing one preference.</p>${chipsHtml}<div class="start-controls">${relaxActions.join("")}<button class="button button-secondary" type="button" data-start-back>${icon("arrowLeft")} Back</button><a class="button button-primary" href="#/use-cases/${encodeURIComponent(result.useCase.id)}">View all tools in this use case ${icon("arrowRight")}</a></div></div>`;
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

function commandBlock(label, command) { return hasValue(command) ? `<div class="command-block"><div class="command-head"><span>${escapeHtml(label)}</span><button class="copy-command" type="button" data-copy="${escapeHtml(command)}">${icon("copy")} Copy</button></div><pre>${escapeHtml(command)}</pre></div>` : ""; }
function inferredStrengths(tool) { const values = []; if ((tool.tags || []).includes("open-source")) values.push("Open-source"); if ((tool.platforms || []).includes("cli")) values.push("Built for terminal workflows"); if ((tool.models || []).length) values.push(`Works with ${tool.models.length} listed model${tool.models.length === 1 ? "" : "s"}`); if (tool.pricing === "free") values.push("Free to use"); return values; }
function guideSteps(tool) { const explicit = Array.isArray(tool.gettingStarted) ? tool.gettingStarted.filter(hasValue).map((description, index) => ({ title: `Step ${index + 1}`, description })) : []; if (explicit.length) return explicit; return [{ title: "Install", description: "Run the verified installation command.", command: tool.install }, { title: "Start", description: "Run the verified start command.", command: tool.start }, tool.docs ? { title: "Read the official setup guide", description: "Use the official documentation for the next setup steps.", url: tool.docs } : null].filter((step) => step.command || step.url); }
function guideMarkup(step, index) { const link = hasValue(step.url) ? `<a class="guide-link" href="${escapeHtml(step.url)}" target="_blank" rel="noreferrer">Open guide ${icon("external")}</a>` : ""; return `<article class="guide-step"><span class="guide-number">${index + 1}</span><div><h3>${escapeHtml(step.title || "Next step")}</h3>${hasValue(step.description) ? `<p>${escapeHtml(step.description)}</p>` : ""}${commandBlock("Command", step.command)}${link}</div></article>`; }
function getDetailId() { const route = parseRouteHash(location.hash); return route?.type === "tool" && route.id ? route.id : ""; }
function renderDetail(id) {
  const tool = state.tools.find((item) => item.id === id); if (!tool) { location.hash = "#/"; return; }
  setDocumentMeta(`${tool.name} — AI-Dekrov`, tool.description || DEFAULT_DESCRIPTION);
  const meta = categoryMeta(tool.category); const favorite = state.favorites.has(tool.id); const platforms = (tool.platforms || []).map((platform) => `<span class="tag">${escapeHtml(labelize(platform))}</span>`).join("") || "<span>Not specified</span>"; const models = (tool.models || []).map((model) => `<span class="model-pill">${escapeHtml(model)}</span>`).join(""); const commands = (tool.commands || []).map((item) => commandBlock(item.label || "Command", item.command)).join(""); const strengths = (tool.strengths || inferredStrengths(tool)).filter(hasValue); const guide = guideSteps(tool); const note = personalNote(tool.id);
  const links = [tool.github && `<a class="card-link" href="${escapeHtml(tool.github)}" target="_blank" rel="noreferrer">GitHub ${icon("external")}</a>`, tool.docs && `<a class="card-link" href="${escapeHtml(tool.docs)}" target="_blank" rel="noreferrer">Documentation ${icon("external")}</a>`].filter(Boolean).join("");
  const sources = (tool.sources || []).filter(hasValue).map((source) => `<a class="source-link" href="${escapeHtml(source)}" target="_blank" rel="noreferrer">${escapeHtml(sourceLabel(source))}${icon("external")}</a>`).join("");
  const metadata = [tool.addedAt && `<div class="info-row"><dt>Added</dt><dd>${escapeHtml(formatDate(tool.addedAt))}</dd></div>`, tool.updatedAt && `<div class="info-row"><dt>Updated</dt><dd>${escapeHtml(formatDate(tool.updatedAt))}</dd></div>`, tool.lastVerifiedAt && `<div class="info-row"><dt>Last verified</dt><dd>${escapeHtml(formatDate(tool.lastVerifiedAt))}</dd></div>`].filter(Boolean).join("");
  const price = priceSummary(tool);
  $("#detail-view").innerHTML = `<button class="back-link" type="button" data-back-catalog><span>${icon("arrowLeft")}</span> Back to catalog</button><div class="detail-header">${logoMarkup(tool, meta, true)}<div class="detail-heading"><div class="tool-category">${escapeHtml(meta.label)}</div><h1>${escapeHtml(tool.name)}</h1>${hasValue(tool.description) ? `<p>${escapeHtml(tool.description)}</p>` : ""}</div><div class="detail-actions">${hasValue(tool.url) ? `<a class="button button-primary" href="${escapeHtml(tool.url)}" target="_blank" rel="noreferrer">Open website ${icon("external")}</a>` : ""}<button class="button button-secondary" type="button" data-save-tool="${escapeHtml(tool.id)}">${icon("bookmark")} Save</button><button class="button button-secondary" type="button" data-propose-update="${escapeHtml(tool.id)}">Suggest an update</button><button class="button button-secondary" type="button" data-favorite="${escapeHtml(tool.id)}">${icon("star")} ${favorite ? "Favorited" : "Add to favorites"}</button></div></div><div class="detail-grid"><div class="detail-main">${strengths.length ? `<section class="detail-section strengths-section"><h2>Why it stands out</h2><div class="strength-list">${strengths.map((strength) => `<div>${icon("star")}<span>${escapeHtml(strength)}</span></div>`).join("")}</div></section>` : ""}${guide.length ? `<section class="detail-section getting-started-section"><h2>Getting started</h2><p class="detail-caption">Use only the verified steps shown below. Check the official guide for service-specific menus and options.</p><div class="guide-list">${guide.map(guideMarkup).join("")}</div></section>` : ""}${hasValue(tool.install) || hasValue(tool.start) || commands ? `<section class="detail-section"><h2>More commands</h2>${commands}</section>` : ""}${models ? `<section class="detail-section"><h2>Models</h2><div class="model-list">${models}</div></section>` : ""}${links ? `<section class="detail-section"><h2>Links</h2><div class="detail-links">${links}</div></section>` : ""}${sources ? `<section class="detail-section"><h2>Sources</h2><div class="source-list">${sources}</div></section>` : ""}<section class="detail-section personal-note-section"><h2>Personal note</h2><p class="detail-caption">Stored only in this browser. It is never published or sent with a submission.</p><textarea class="personal-note-input" id="personal-note-input" rows="4" placeholder="Add a private note for yourself">${escapeHtml(note)}</textarea><div class="note-actions"><button class="button button-primary" type="button" data-note-save="${escapeHtml(tool.id)}">Save note</button>${note ? `<button class="button button-secondary" type="button" data-note-delete="${escapeHtml(tool.id)}">Delete note</button>` : ""}</div></section></div><aside class="detail-aside"><dl class="info-list">${tool.pricing || tool.priceDetails ? `<div class="info-row"><dt>Price</dt><dd>${escapeHtml(price)}</dd></div>` : ""}<div class="info-row"><dt>Platforms</dt><dd><div class="platform-list">${platforms}</div></dd></div>${tool.domain ? `<div class="info-row"><dt>Domain</dt><dd>${escapeHtml(tool.domain)}</dd></div>` : ""}${metadata}</dl><div class="detail-tags">${(tool.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div></aside></div>`;
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
function syncUrlState() { const route = parseRouteHash(location.hash); if (route?.type === "favorites") { state.favoritesOnly = true; state.category = ""; } else if (route?.type === "category") { state.category = route.id; state.favoritesOnly = false; } else if (!getDetailId()) { state.favoritesOnly = false; state.category = ""; } renderNavigation(); renderCatalog(); const restoreScroll = state.restoreScroll; state.restoreScroll = null; window.scrollTo({ top: restoreScroll ?? 0, behavior: restoreScroll == null ? "smooth" : "auto" }); }
function rememberCatalogPosition() { state.detailReturn = { hash: location.hash && !getDetailId() ? location.hash : "#/", query: state.query, pricing: state.pricing, platform: state.platform, sort: state.sort, catalogSort: state.catalogSort, scrollY: window.scrollY }; }
function restoreCatalogPosition() { const saved = state.detailReturn; state.detailReturn = null; if (!saved) { location.hash = "#/"; return; } state.query = saved.query; state.pricing = saved.pricing; state.platform = saved.platform; state.sort = saved.sort; state.catalogSort = saved.catalogSort || "recent"; $("#search-input").value = saved.query; $("#pricing-filter").value = saved.pricing; $("#platform-filter").value = saved.platform; $("#sort-select option[value=relevance]").hidden = !saved.query.trim(); $("#sort-select").value = saved.sort; state.restoreScroll = saved.scrollY; history.pushState(null, "", saved.hash); syncUrlState(); }
function setSearchQuery(value) { const next = String(value || ""); const wasActive = Boolean(state.query.trim()); const active = Boolean(next.trim()); if (!wasActive && active && state.sort !== "relevance") { state.catalogSort = state.sort; state.sort = "relevance"; } else if (wasActive && !active && state.sort === "relevance") { state.sort = state.catalogSort || "recent"; } state.query = next; $("#sort-select option[value=relevance]").hidden = !active; $("#sort-select").value = state.sort; }
function clearFilters() { setSearchQuery(""); state.category = ""; state.pricing = ""; state.platform = ""; $("#search-input").value = ""; $("#pricing-filter").value = ""; $("#platform-filter").value = ""; if (!getDetailId()) { const view = currentView(); let target = state.favoritesOnly ? "#/favorites" : "#/"; if (view?.type === "stack") target = "#/stack"; else if (view?.type === "collections") target = "#/collections"; else if (view?.type === "collection" || view?.type === "use-case") target = location.hash; history.replaceState(null, "", target); renderNavigation(); renderCatalog(); } }
let jsonCandidate = null;
let submissionDraft = null;
function setAddMode(mode) { $$("[data-add-mode]").forEach((tab) => { const active = tab.dataset.addMode === mode; tab.classList.toggle("is-active", active); tab.setAttribute("aria-selected", String(active)); }); $$("[data-add-panel]").forEach((panel) => { panel.hidden = panel.dataset.addPanel !== mode; }); if (mode === "manual") $("#tool-form [name=name]").focus(); if (mode === "smart") $("#smart-url").focus(); if (mode === "json") updateAiPrompt(); }
function resetAddDraft() { submissionDraft = null; $("#smart-add-form").reset(); $("#tool-form").reset(); $("#tool-form").dataset.source = "manual"; delete $("#tool-form").dataset.existingId; resetJsonImport(); $("#submission-review").hidden = true; }
function openDialog(mode = "smart") { resetAddDraft(); if (!$("#tool-dialog").open) $("#tool-dialog").showModal(); setAddMode(mode); }
function closeDialog() { $("#tool-dialog").close(); }
function makeId(name) { const stem = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tool"; const taken = new Set(state.tools.map((tool) => tool.id)); let id = stem; let index = 2; while (taken.has(id)) { id = `${stem}-${index}`; index += 1; } return id; }
function splitList(value = "") { return String(value).split(",").map((item) => item.trim()).filter(Boolean); }
function fillManualForm(tool) { const form = $("#tool-form"); ["name", "category", "pricing", "priceDetails", "description", "url", "domain", "favicon", "install", "start", "github", "docs"].forEach((key) => { const input = form.elements.namedItem(key); if (input) input.value = tool[key] || ""; }); form.elements.bestFor.value = (tool.bestFor || []).join(", "); form.elements.strengths.value = (tool.strengths || []).join(", "); form.elements.gettingStarted.value = (tool.gettingStarted || []).join("\n"); form.elements.usageNotes.value = (tool.usageNotes || []).join("\n"); form.elements.tags.value = (tool.tags || []).join(", "); form.elements.models.value = (tool.models || []).join(", "); form.querySelectorAll('input[name="platforms"]').forEach((input) => { input.checked = (tool.platforms || []).includes(input.value); }); form.dataset.source = tool.source || "manual"; }
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
function promptSchema() { const generated = new Set(state.schema.generated || []); return Object.fromEntries(Object.entries(state.schema.properties).filter(([key]) => !generated.has(key)).map(([key, definition]) => [key, Object.fromEntries(Object.entries(definition).filter(([name]) => ["type", "required", "enum", "format", "pattern", "description", "humanOnly", "allowEmpty", "items"].includes(name)))])); }
function buildAiPrompt() { if (!state.schema) return "Loading schema..."; const url = $("#prompt-url").value.trim() || "<PASTE_TOOL_URL>"; const context = $("#prompt-context").value.trim(); return ["Analyze this AI tool using publicly available, verifiable information.", `Tool URL: ${url}`, context ? `User context: ${context}` : "", "", "Return ONLY one valid JSON object. Do not use Markdown code fences. Do not add explanations before or after the JSON.", "Do not invent facts. If a scalar value is unknown, return an empty string. If a list is unknown, return an empty array.", "Use only enum values explicitly allowed in the schema. The id must be lowercase kebab-case.", "Do not include generated fields: addedAt, updatedAt, lastVerifiedAt, or sources.", "", "Schema:", JSON.stringify(promptSchema(), null, 2)].filter(Boolean).join("\n"); }
function updateAiPrompt() { $("#ai-prompt").value = buildAiPrompt(); }
function setJsonErrors(errors = []) { const panel = $("#json-errors"); panel.hidden = errors.length === 0; panel.innerHTML = errors.length ? `<strong>Check the JSON:</strong><ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : ""; }
function resetJsonImport() { jsonCandidate = null; $("#prompt-url").value = ""; $("#prompt-context").value = ""; $("#json-import-input").value = ""; $("#json-preview").hidden = true; $("#json-import-confirm").hidden = true; $("#json-edit-manual").hidden = true; setJsonErrors(); updateAiPrompt(); }
function normalizeImportedTool(raw) {
  const errors = []; if (!raw || Array.isArray(raw) || typeof raw !== "object") errors.push("One JSON object is required.");
  if (errors.length) { const error = new Error(errors[0]); error.errors = errors; throw error; }
  const generated = new Set(state.schema.generated || []); const allowed = Object.keys(state.schema.properties).filter((key) => !generated.has(key)); const unknown = Object.keys(raw).filter((key) => !allowed.includes(key)); if (unknown.length) errors.push(`Unsupported fields: ${unknown.join(", ")}.`);
  const string = (key) => typeof raw[key] === "string" ? raw[key].trim() : raw[key] == null ? "" : (errors.push(`${key} must be a string.`), "");
  const list = (key) => { if (raw[key] == null) return []; if (!Array.isArray(raw[key])) { errors.push(`${key} must be an array.`); return []; } if (raw[key].some((item) => typeof item !== "string")) errors.push(`${key} must contain strings only.`); return raw[key].filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean); };
  const id = string("id"); const name = string("name"); const category = string("category"); const pricing = string("pricing"); const urlValue = string("url"); const url = urlValue ? getHttpUrl(urlValue) : null;
  if (!id) errors.push("id is required."); else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) errors.push("id must use kebab-case."); if (!name) errors.push("name is required."); if (!schemaEnum("category").includes(category)) errors.push(`category: ${schemaEnum("category").join(", ")}.`); if (pricing && !schemaEnum("pricing").includes(pricing)) errors.push(`pricing: ${schemaEnum("pricing").join(", ")}.`); if (!urlValue) errors.push("url is required."); else if (!url) errors.push("url must be a valid http(s) URL.");
  const platforms = list("platforms"); const invalidPlatforms = platforms.filter((item) => !schemaEnum("platforms").includes(item)); if (invalidPlatforms.length) errors.push(`Invalid platforms: ${invalidPlatforms.join(", ")}.`);
  const checkOptionalUrl = (key) => { const value = string(key); if (value && !getHttpUrl(value)) errors.push(`${key} must be a valid http(s) URL.`); return value; };
  const commands = raw.commands == null ? [] : Array.isArray(raw.commands) ? raw.commands.filter((item) => item && typeof item.label === "string" && typeof item.command === "string").map((item) => ({ label: item.label.trim(), command: item.command.trim() })) : (errors.push("commands must be an array."), []); if (Array.isArray(raw.commands) && commands.length !== raw.commands.length) errors.push("Each command requires string label and command values.");
  const domain = string("domain"); const description = string("description"); const bestFor = list("bestFor"); const strengths = list("strengths"); const gettingStarted = list("gettingStarted"); const usageNotes = list("usageNotes"); const priceDetails = string("priceDetails"); const tags = list("tags"); const install = string("install"); const start = string("start"); const models = list("models"); const favicon = checkOptionalUrl("favicon"); const github = checkOptionalUrl("github"); const docs = checkOptionalUrl("docs");
  if (errors.length) { const error = new Error(errors[0]); error.errors = errors; throw error; }
  return { id, name, category, pricing, priceDetails, url: url?.href || "", domain: domain || getDomain(url?.href || ""), favicon, description, bestFor, strengths, gettingStarted, usageNotes, platforms, tags, install, start, commands, models, github, docs, source: "json" };
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
  const tool = { id: form.dataset.existingId || makeId(name), name, category: fields.get("category"), description: fields.get("description").trim(), bestFor: splitList(fields.get("bestFor")), strengths: splitList(fields.get("strengths")), gettingStarted: String(fields.get("gettingStarted") || "").split("\n").map((x) => x.trim()).filter(Boolean), usageNotes: String(fields.get("usageNotes") || "").split("\n").map((x) => x.trim()).filter(Boolean), url: fields.get("url").trim(), domain: fields.get("domain").trim(), favicon: fields.get("favicon").trim(), platforms: [...form.querySelectorAll('input[name="platforms"]:checked')].map((input) => input.value), pricing: fields.get("pricing"), priceDetails: fields.get("priceDetails").trim(), tags: splitList(fields.get("tags")), install: fields.get("install").trim(), start: fields.get("start").trim(), commands: [], models: splitList(fields.get("models")), github: fields.get("github").trim(), docs: fields.get("docs").trim() };
  try { prepareSubmission({ ...normalizeImportedTool(tool), source: form.dataset.source || "manual" }); } catch (error) { setAddMode("manual"); showToast(error.errors?.[0] || error.message || "Check the required fields"); }
}
let toastTimer;
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("is-visible"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1800); }
async function copyText(value) { try { await navigator.clipboard.writeText(value); showToast("Copied"); } catch { showToast("Could not copy to clipboard"); } }
function toggleFavorite(id) { if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id); localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites])); renderNavigation(); renderCatalog(); }

let searchInputTimer;
function bindEvents() {
  $("#theme-toggle").addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark")); $("#add-tool-button").addEventListener("click", () => openDialog("smart")); $("#info-button").addEventListener("click", () => $("#info-dialog").showModal()); $$('[data-add-mode]').forEach((button) => button.addEventListener("click", () => setAddMode(button.dataset.addMode))); $$("[data-close-dialog]").forEach((button) => button.addEventListener("click", closeDialog)); $$("[data-close-info]").forEach((button) => button.addEventListener("click", () => $("#info-dialog").close())); $("#tool-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeDialog(); }); $("#tool-dialog").addEventListener("close", resetAddDraft); $("#info-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) $("#info-dialog").close(); }); $("#smart-add-form").addEventListener("submit", (event) => { event.preventDefault(); handleSmartAdd($("#smart-url").value); }); $("#tool-form").addEventListener("submit", (event) => { event.preventDefault(); saveNewTool(event.currentTarget); }); $("#prompt-url").addEventListener("input", updateAiPrompt); $("#prompt-context").addEventListener("input", updateAiPrompt); $("#copy-ai-prompt").addEventListener("click", () => copyText($("#ai-prompt").value)); $("#reset-json-import").addEventListener("click", resetJsonImport); $("#json-validate").addEventListener("click", () => { try { const raw = JSON.parse($("#json-import-input").value); jsonCandidate = normalizeImportedTool(raw); $("#json-import-input").value = JSON.stringify(raw, null, 2); setJsonErrors(); renderJsonPreview(jsonCandidate); $("#json-import-confirm").hidden = false; $("#json-edit-manual").hidden = false; showToast("JSON validated"); } catch (error) { jsonCandidate = null; $("#json-preview").hidden = true; $("#json-import-confirm").hidden = true; $("#json-edit-manual").hidden = true; setJsonErrors(error.errors || [error.message || "Could not parse JSON."]); } }); $("#json-edit-manual").addEventListener("click", () => { if (!jsonCandidate) return; fillManualForm(jsonCandidate); setAddMode("manual"); showToast("You can edit the fields"); }); $("#json-import-confirm").addEventListener("click", () => { if (!jsonCandidate) return; prepareSubmission(jsonCandidate); }); $("#submission-edit").addEventListener("click", () => { if (!submissionDraft?.tool) return; fillManualForm(submissionDraft.tool); $("#tool-form").dataset.existingId = submissionDraft.existingToolId || ""; setAddMode("manual"); }); $("#submission-open-issue").addEventListener("click", openGitHubIssue);
  $("#mobile-menu-toggle").addEventListener("click", () => { const sidebar = $("#sidebar"); const open = sidebar.classList.toggle("is-open"); $("#mobile-menu-toggle").innerHTML = icon(open ? "x" : "menu"); $("#mobile-menu-toggle").setAttribute("aria-expanded", String(open)); }); $("#search-input").addEventListener("input", (event) => { setSearchQuery(event.target.value); clearTimeout(searchInputTimer); searchInputTimer = setTimeout(renderCatalog, 90); }); $("#pricing-filter").addEventListener("change", (event) => { state.pricing = event.target.value; renderCatalog(); }); $("#platform-filter").addEventListener("change", (event) => { state.platform = event.target.value; renderCatalog(); }); $("#sort-select").addEventListener("change", (event) => { state.sort = event.target.value; if (state.sort !== "relevance") state.catalogSort = state.sort; renderCatalog(); });  $("#clear-filters").addEventListener("click", clearFilters);  $("#empty-action").addEventListener("click", () => { const view = currentView(); if (state.query || state.category || state.pricing || state.platform) { clearFilters(); return; } if (view?.type === "stack" || view?.type === "collection" || view?.type === "use-case") { location.hash = "#/"; return; } openDialog(); });
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
    const deleteCollectionButton = event.target.closest("[data-delete-collection]"); if (deleteCollectionButton) { event.preventDefault(); openDeleteCollectionDialog(deleteCollectionButton.dataset.deleteCollection); }
    const confirmDelete = event.target.closest("[data-confirm-delete]"); if (confirmDelete) { event.preventDefault(); const context = state.saveDialogContext; if (context?.collectionId) { state.collections.collections = deleteCollection(state.collections.collections, context.collectionId); saveCollections(); closeSavedDialog(); renderCatalog(); showToast("Collection deleted"); } }
    if (event.target.closest("[data-close-dialog]") && event.target.closest("#saved-dialog")) { event.preventDefault(); closeSavedDialog(); } const update = event.target.closest("[data-propose-update]"); if (update) { const tool = state.tools.find((item) => item.id === update.dataset.proposeUpdate); if (tool) startUpdateSubmission(tool); } const saveNote = event.target.closest("[data-note-save]"); if (saveNote) { savePersonalNote(saveNote.dataset.noteSave, $("#personal-note-input").value); renderDetail(saveNote.dataset.noteSave); showToast("Personal note saved"); } const deleteNote = event.target.closest("[data-note-delete]"); if (deleteNote) { savePersonalNote(deleteNote.dataset.noteDelete, ""); renderDetail(deleteNote.dataset.noteDelete); showToast("Personal note deleted"); } const copy = event.target.closest("[data-copy]"); if (copy) copyText(copy.dataset.copy); if (event.target.closest(".nav-item, .category-link")) { $("#sidebar").classList.remove("is-open"); $("#mobile-menu-toggle").innerHTML = icon("menu"); $("#mobile-menu-toggle").setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#search-input").focus(); } if (event.key === "Escape" && $("#tool-dialog").open) closeDialog(); if (event.key === "Escape" && $("#info-dialog").open) $("#info-dialog").close(); if (event.key === "Escape" && $("#saved-dialog").open) closeSavedDialog(); }); window.addEventListener("hashchange", syncUrlState);
}
const DATA_CACHE_BUST = Date.now();
function fetchJson(path, { bust = false } = {}) { return fetch(bust ? `${path}?v=${DATA_CACHE_BUST}` : path, { cache: "no-store" }); }
async function init() { setTheme(state.theme); renderStaticIcons(); bindEvents(); try { const [toolsResponse, schemaResponse, configResponse, useCasesResponse, startHereResponse] = await Promise.all([fetchJson("data/tools.json", { bust: true }), fetchJson("data/tool-schema.json"), fetchJson("data/site-config.json"), fetchJson("data/use-cases.json").catch(() => null), fetchJson(START_HERE_PATH).catch(() => null)]); if (!requiredResponsesAreOk([toolsResponse, schemaResponse, configResponse])) throw new Error("Could not load catalog data"); state.baseTools = await toolsResponse.json(); state.schema = await schemaResponse.json(); state.siteConfig = await configResponse.json(); const [useCasesSource, startHereSource] = await Promise.all([readOptionalJson(useCasesResponse), readOptionalJson(startHereResponse)]); state.useCases = parseUseCases(useCasesSource); state.startHere.config = startHereSource ? parseStartHere(startHereSource, { platforms: schemaEnum("platforms"), pricing: schemaEnum("pricing") }) : { version: 1, steps: [] }; state.searchEngine = createCatalogSearch(state.baseTools); renderSchemaControls(); updateAiPrompt(); refreshTools(); renderNavigation(); syncUrlState(); } catch (error) { console.error(error); $("#tools-grid").innerHTML = '<div class="empty-state"><h2>Could not load the catalog</h2><p>Run the site through a local server and refresh the page.</p></div>'; } }
init();
