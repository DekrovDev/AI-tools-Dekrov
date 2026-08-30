function decodeRouteSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export function parseRouteHash(hash = "") {
  if (hash === "#/start") return { type: "start" };
  if (hash === "#/use-cases") return { type: "use-cases" };
  if (hash.startsWith("#/use-cases/")) return { type: "use-case", id: decodeRouteSegment(hash.slice("#/use-cases/".length)) };
  if (hash === "#/stack") return { type: "stack" };
  if (hash.startsWith("#/collections/")) return { type: "collection", id: decodeRouteSegment(hash.slice("#/collections/".length)) };
  if (hash === "#/collections") return { type: "collections" };
  if (hash === "#/favorites") return { type: "favorites" };
  const toolMatch = hash.match(/^#\/tools\/([^/?#]+)$/);
  if (toolMatch) return { type: "tool", id: decodeRouteSegment(toolMatch[1]) };
  if (hash.startsWith("#/category/")) return { type: "category", id: decodeRouteSegment(hash.slice("#/category/".length)) };
  return null;
}

export async function readOptionalJson(response) {
  if (!response?.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function requiredResponsesAreOk(responses = []) {
  return responses.every((response) => response?.ok);
}
