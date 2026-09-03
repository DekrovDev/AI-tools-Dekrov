// Pure entity-identity helpers for the two-catalog product.
//
// A saved entity (favorite, My Stack member, collection member) is stored as a
// single string so existing localStorage keys stay byte-compatible:
//   - AI tools are stored with their bare catalog id (backward compatible);
//   - Dev resources are stored with a reserved "dev:" prefix.
// Tool ids are kebab-case and can never contain ":", so there is no ambiguity
// and existing saved AI data requires no migration.
//
// No DOM, no framework.

export const DEV_REF_PREFIX = "dev:";
export const KIND_TOOLS = "tools";
export const KIND_DEV = "dev";

export function isDevRef(value) {
  return typeof value === "string" && value.startsWith(DEV_REF_PREFIX);
}

export function isToolRef(value) {
  return typeof value === "string" && !value.startsWith(DEV_REF_PREFIX);
}

// Stored form for an entity id of the given kind.
export function entityRef(kind, id) {
  return kind === KIND_DEV ? `${DEV_REF_PREFIX}${id}` : String(id);
}

// Parse a stored ref back into { kind, id }. Non-prefixed strings are tools.
export function entityRefParts(ref) {
  if (typeof ref === "string" && ref.startsWith(DEV_REF_PREFIX)) {
    return { kind: KIND_DEV, id: ref.slice(DEV_REF_PREFIX.length) };
  }
  return { kind: KIND_TOOLS, id: typeof ref === "string" ? ref : String(ref ?? "") };
}

// Keep only refs belonging to one kind.
export function refsOfKind(refs, kind) {
  return (Array.isArray(refs) ? refs : []).filter((ref) => entityRefParts(ref).kind === kind);
}

// Keep only refs whose entity is currently known in the given id sets
// (each set holds bare ids for one kind). Returns { known, missing } arrays.
export function splitKnownRefs(refs, knownToolIds, knownDevIds) {
  const toolSet = knownToolIds instanceof Set ? knownToolIds : new Set(knownToolIds || []);
  const devSet = knownDevIds instanceof Set ? knownDevIds : new Set(knownDevIds || []);
  const known = [];
  const missing = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const { kind, id } = entityRefParts(ref);
    const set = kind === KIND_DEV ? devSet : toolSet;
    if (set.has(id)) known.push(ref);
    else missing.push(ref);
  }
  return { known, missing };
}

// Count refs that resolve to a known entity of the given kind.
export function countKnownRefs(refs, kind, knownToolIds, knownDevIds) {
  const { known } = splitKnownRefs(refsOfKind(refs, kind), knownToolIds, knownDevIds);
  return known.length;
}
