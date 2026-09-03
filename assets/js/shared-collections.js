// Pure share-encoding logic for Collections.
// A collection is turned into a compact, versioned, URL-safe snapshot that
// lives entirely inside a URL. No backend, no API, no accounts, no storage:
// opening a shared link performs ZERO writes until the visitor explicitly
// chooses to import it. This module is DOM-free and never touches
// localStorage / fetch / the network, so it can be tested headlessly.
//
// Payload contains ONLY { v, name, toolIds }. Local IDs, timestamps, favorites,
// stack, notes and any other browser state are never serialized.

import {
  MAX_COLLECTION_NAME,
  STACK_NAME,
  dedupeStrings,
  generateCollectionId,
  isReservedName,
  normalizeCollectionName
} from "./saved-library.js";
import { entityRefParts, KIND_DEV, KIND_TOOLS } from "./entity-ids.js";

export const SHARED_VERSION = 1;
// How many tool IDs a single shared link may carry. The catalog currently has
// 29 tools and grows by a few per merge; 300 is comfortably forward-compatible
// for years without letting a malicious link allocate an absurd amount of UI.
export const MAX_SHARED_IDS = 300;
// Maximum encoded token length checked BEFORE decoding. A normal collection of
// a few hundred IDs fits in well under this. We reject the rest cheaply so a
// gigantic URL payload can never freeze or crash the page.
export const MAX_TOKEN_LENGTH = 20000;
// Conservative tool-ID shape matching existing kebab-style IDs
// (verified against every id in data/tools.json).
const TOOL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = new Map([...BASE64_ALPHABET].map((char, index) => [char, index]));

function isValidEntityRef(value) {
  if (typeof value !== "string" || !value) return false;
  const { kind, id } = entityRefParts(value);
  return (kind === KIND_TOOLS || kind === KIND_DEV) && TOOL_ID_PATTERN.test(id);
}

function utf8Encode(text) {
  return new TextEncoder().encode(text);
}

function utf8Decode(bytes) {
  // fatal: true makes invalid UTF-8 throw instead of producing replacement chars.
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function bytesToBase64(bytes) {
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index];
    const b1 = bytes[index + 1];
    const b2 = bytes[index + 2];
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 3) << 4) | (b1 == null ? 0 : b1 >> 4)];
    out += b1 == null ? "=" : BASE64_ALPHABET[((b1 & 15) << 2) | (b2 == null ? 0 : b2 >> 6)];
    out += b2 == null ? "=" : BASE64_ALPHABET[b2 & 63];
  }
  return out;
}

function base64UrlToBytes(token) {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) throw new Error("bad base64");
  const length = padded.length;
  const bytes = [];
  for (let index = 0; index < length; index += 4) {
    const a = BASE64_LOOKUP.get(padded[index]);
    const b = BASE64_LOOKUP.get(padded[index + 1]);
    if (a == null || b == null) throw new Error("bad base64");
    const c = BASE64_LOOKUP.get(padded[index + 2]);
    const d = BASE64_LOOKUP.get(padded[index + 3]);
    bytes.push((a << 2) | (b >> 4));
    if (padded[index + 2] !== "=") {
      if (c == null) throw new Error("bad base64");
      bytes.push(((b & 15) << 4) | (c >> 2));
    }
    if (padded[index + 3] !== "=") {
      if (d == null) throw new Error("bad base64");
      bytes.push(((c & 3) << 6) | d);
    }
  }
  return new Uint8Array(bytes);
}

// Build the explicit, allowlisted payload for a local collection.
// Local id / timestamps / notes / stack / favorites are never included.
export function createSharedCollectionPayload(collection) {
  const name = normalizeCollectionName(collection?.name);
  const ids = Array.isArray(collection?.toolIds)
    ? dedupeStrings(collection.toolIds).filter(isValidEntityRef).slice(0, MAX_SHARED_IDS)
    : [];
  return { v: SHARED_VERSION, name, toolIds: ids };
}

// Deterministic base64url token for the same normalized payload.
export function encodeSharedCollection(collection) {
  const payload = createSharedCollectionPayload(collection);
  const json = JSON.stringify(payload);
  return bytesToBase64(utf8Encode(json)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Safe, hardened normalization of an untrusted decoded object.
// Returns a plain { v, name, toolIds } or null. Unknown fields are ignored.
// toolIds are strings only, validated, deduplicated (first occurrence wins) and
// bounded. Names are trimmed/limited. Nothing from the raw object is spread in.
export function normalizeSharedCollection(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.v !== SHARED_VERSION) return null;
  const name = normalizeCollectionName(raw.name);
  if (!name) return null;
  if (!Array.isArray(raw.toolIds)) return null;
  const toolIds = [];
  const seen = new Set();
  for (const value of raw.toolIds) {
    if (toolIds.length >= MAX_SHARED_IDS) break;
    if (!isValidEntityRef(value) || seen.has(value)) continue;
    seen.add(value);
    toolIds.push(value);
  }
  return { v: SHARED_VERSION, name, toolIds };
}

// Safe decoder. Never throws: returns { ok: true, payload } or
// { ok: false, reason } where reason is a stable string the UI can localize.
export function decodeSharedCollection(token) {
  if (typeof token !== "string" || token.length === 0) return { ok: false, reason: "missing" };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "oversized" };
  if (!TOKEN_PATTERN.test(token)) return { ok: false, reason: "malformed" };
  let text;
  try {
    text = utf8Decode(base64UrlToBytes(token));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && typeof raw.v === "number" && raw.v !== SHARED_VERSION) {
    return { ok: false, reason: "unsupported-version" };
  }
  const payload = normalizeSharedCollection(raw);
  if (!payload) return { ok: false, reason: "invalid-payload" };
  return { ok: true, payload };
}

// Resolve a shared payload against the known catalog, preserving the shared
// order. Returns the known IDs and how many referenced tools are unavailable.
export function resolveSharedToolIds(shared, knownIds) {
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds || []);
  const list = Array.isArray(shared?.toolIds) ? shared.toolIds : [];
  const knownList = list.filter((id) => known.has(id));
  return { knownIds: knownList, missingCount: Math.max(0, list.length - knownList.length) };
}

// Resolve both catalog kinds without changing the v1 payload shape. Bare ids
// continue to mean AI tools; `dev:` ids are explicit Dev Resources.
export function resolveSharedEntityRefs(shared, knownToolIds, knownDevIds) {
  const tools = knownToolIds instanceof Set ? knownToolIds : new Set(knownToolIds || []);
  const dev = knownDevIds instanceof Set ? knownDevIds : new Set(knownDevIds || []);
  const list = Array.isArray(shared?.toolIds) ? shared.toolIds : [];
  const knownRefs = [];
  const knownToolRefs = [];
  const knownDevRefs = [];
  for (const ref of list) {
    const { kind, id } = entityRefParts(ref);
    if (kind === KIND_DEV ? dev.has(id) : tools.has(id)) {
      knownRefs.push(ref);
      if (kind === KIND_DEV) knownDevRefs.push(ref);
      else knownToolRefs.push(ref);
    }
  }
  return {
    knownRefs,
    knownToolRefs,
    knownDevRefs,
    missingCount: Math.max(0, list.length - knownRefs.length)
  };
}

// Canonical, host-agnostic share URL built from any location-like object.
export function sharedCollectionUrl(collection, locationLike) {
  const token = encodeSharedCollection(collection);
  const origin = locationLike?.origin || "";
  const path = locationLike?.pathname || "/";
  return `${origin}${path}#/shared/${token}`;
}

function makeDuplicateName(base, suffix) {
  const bare = MAX_COLLECTION_NAME - suffix.length;
  if (bare <= 0) return "";
  return (base.slice(0, bare) + suffix).trim();
}

// Deterministic duplicate-safe naming:
//   "Coding" -> "Coding (shared)" -> "Coding (shared 2)" -> ...
// Never overwrites an existing collection and never collides with the reserved
// My Stack name. Falls back through the sequence and gives up safely.
export function availableSharedName(localNames, sharedName) {
  const base = normalizeCollectionName(sharedName);
  if (!base) return "";
  const existing = new Set((Array.isArray(localNames) ? localNames : []).map((name) => normalizeCollectionName(name).toLocaleLowerCase("en")));
  if (!isReservedName(base) && !existing.has(base.toLocaleLowerCase("en"))) return base;
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? " (shared)" : ` (shared ${index + 1})`;
    const candidate = makeDuplicateName(base, suffix);
    if (!candidate) return "";
    const key = candidate.toLocaleLowerCase("en");
    if (!isReservedName(candidate) && !existing.has(key)) return candidate;
  }
  return "";
}

// Build a brand-new local Collection snapshot from a shared payload. Only
// currently known tool IDs are imported, in shared order, deduplicated at decode
// time. The local id and timestamps are freshly generated here (never reused
// from storage). Returns null when there is nothing meaningful to save
// (empty resolved set or an unresolvable duplicate-safe name).
export function importSharedCollection(collections, shared, knownIds, knownDevIds = new Set()) {
  if (!shared || typeof shared !== "object") return null;
  const resolved = resolveSharedEntityRefs(shared, knownIds, knownDevIds);
  if (resolved.knownRefs.length === 0) return null;
  const names = (Array.isArray(collections) ? collections : []).map((collection) => collection?.name || "");
  const name = availableSharedName(names, shared.name);
  if (!name) return null;
  const now = new Date().toISOString();
  const collection = { id: generateCollectionId(), name, toolIds: resolved.knownRefs, createdAt: now, updatedAt: now };
  return { collection, collections: [...(Array.isArray(collections) ? collections : []), collection] };
}

// Human-readable label for a decode failure reason (kept DOM-free).
export function sharedFailureMessage(reason) {
  const messages = {
    missing: "This shared collection link is incomplete.",
    malformed: "This shared collection link is not valid.",
    "invalid-json": "This shared collection link is corrupt.",
    "unsupported-version": "This shared collection uses a newer format that this version of AI-Dekrov does not support.",
    "invalid-payload": "This shared collection link does not contain a valid collection.",
    oversized: "This shared collection link is too large to open."
  };
  return messages[reason] || "This shared collection link could not be opened.";
}

// Exported for the reserved-name check parity used by tests/docs.
export { STACK_NAME as RESERVED_SHARED_NAME };
