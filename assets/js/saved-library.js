// Pure saved-library logic: named collections + My Stack.
// No DOM, no framework. Every function is a pure transformation of plain data,
// so it can be tested headlessly and swapped for real storage by the app.

export const COLLECTIONS_KEY = "ai-dekrov-collections-v1";
export const STACK_KEY = "ai-dekrov-my-stack-v1";
const STORAGE_VERSION = 1;
export const MAX_COLLECTION_NAME = 40;
export const STACK_NAME = "My Stack";

export function dedupeStrings(values) {
  return [...new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : [])];
}

export function normalizeCollectionName(name) {
  return String(name ?? "").trim().slice(0, MAX_COLLECTION_NAME);
}

export function isReservedName(name) {
  return normalizeCollectionName(name).toLocaleLowerCase("en") === STACK_NAME.toLocaleLowerCase("en");
}

export function generateCollectionId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeCollection(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const name = normalizeCollectionName(raw.name);
  if (!name) return null;
  const now = new Date().toISOString();
  return {
    id: String(raw.id && String(raw.id).trim() ? raw.id : generateCollectionId()),
    name,
    toolIds: dedupeStrings(raw.toolIds),
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || now)
  };
}

// Parse raw localStorage string into a safe { version, collections } shape.
// Never throws. Duplicate collection names are collapsed case-insensitively,
// duplicate tool IDs are removed, and structurally invalid entries are dropped.
export function parseCollections(raw) {
  const base = { version: STORAGE_VERSION, collections: [] };
  if (raw == null) return base;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;
  if (!Array.isArray(parsed.collections)) return base;
  const seen = new Set();
  const collections = [];
  for (const rawCollection of parsed.collections) {
    const collection = sanitizeCollection(rawCollection);
    if (!collection) continue;
    const key = collection.name.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    collections.push(collection);
  }
  return { version: STORAGE_VERSION, collections };
}

// Parse the My Stack localStorage value into an ordered array of tool IDs.
export function parseStack(raw) {
  if (raw == null) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return dedupeStrings(parsed);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.toolIds)) return dedupeStrings(parsed.toolIds);
  return [];
}

// Keep only IDs that still exist in the loaded catalog, preserving order.
export function filterKnownIds(ids, known) {
  const set = known instanceof Set ? known : new Set(known || []);
  return (Array.isArray(ids) ? ids : []).filter((id) => set.has(id));
}

// Create a new collection object. Throws a plain Error for invalid input.
export function createCollection(collections, name) {
  const clean = normalizeCollectionName(name);
  if (!clean) throw new Error("Collection name cannot be empty.");
  if (isReservedName(clean)) throw new Error(`${STACK_NAME} is a built-in list and cannot be used as a collection name.`);
  const existing = Array.isArray(collections) ? collections : [];
  if (existing.some((collection) => collection.name.toLocaleLowerCase("en") === clean.toLocaleLowerCase("en"))) {
    throw new Error("A collection with that name already exists.");
  }
  const now = new Date().toISOString();
  return { id: generateCollectionId(), name: clean, toolIds: [], createdAt: now, updatedAt: now };
}

export function createCollectionAndAppend(collections, name) {
  return [...(Array.isArray(collections) ? collections : []), createCollection(collections, name)];
}

export function renameCollection(collections, id, name) {
  const clean = normalizeCollectionName(name);
  if (!clean) throw new Error("Collection name cannot be empty.");
  if (isReservedName(clean)) throw new Error(`${STACK_NAME} is a built-in list and cannot be used as a collection name.`);
  const list = Array.isArray(collections) ? collections : [];
  const index = list.findIndex((collection) => collection.id === id);
  if (index === -1) throw new Error("Collection not found.");
  if (list.some((collection, otherIndex) => otherIndex !== index && collection.name.toLocaleLowerCase("en") === clean.toLocaleLowerCase("en"))) {
    throw new Error("A collection with that name already exists.");
  }
  const next = [...list];
  next[index] = { ...next[index], name: clean, updatedAt: new Date().toISOString() };
  return next;
}

export function deleteCollection(collections, id) {
  return (Array.isArray(collections) ? collections : []).filter((collection) => collection.id !== id);
}

function findCollection(collections, id, label = "collection") {
  const list = Array.isArray(collections) ? collections : [];
  const match = list.find((collection) => collection.id === id);
  if (!match) throw new Error(`Collection ${label} not found.`);
  return match;
}

// Add a tool to a collection if absent, otherwise remove it (toggle membership).
export function toggleToolInCollection(collections, collectionId, toolId) {
  const list = Array.isArray(collections) ? collections : [];
  const index = list.findIndex((collection) => collection.id === collectionId);
  if (index === -1) throw new Error("Collection not found.");
  const next = [...list];
  const has = next[index].toolIds.includes(toolId);
  const toolIds = has ? next[index].toolIds.filter((value) => value !== toolId) : [...next[index].toolIds, toolId];
  next[index] = { ...next[index], toolIds, updatedAt: new Date().toISOString() };
  return next;
}

// Appends an ID to the end of My Stack if absent; removes it if present.
export function toggleStackTool(stack, toolId) {
  const list = Array.isArray(stack) ? stack : [];
  return list.includes(toolId) ? list.filter((value) => value !== toolId) : [...list, toolId];
}