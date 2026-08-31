export const MAX_MISSING_TOOL_QUERY_LENGTH = 120;
export const SHARED_IDENTITY_HOSTS = new Set(["github.com", "gitlab.com", "huggingface.co", "vercel.app", "github.io"]);
const FILTER_ONLY_QUERIES = new Set(["free", "local", "cloud", "hybrid", "no signup", "no api key"]);

function normalizedHost(value) {
  return String(value || "").trim().toLocaleLowerCase("en").replace(/^www\./, "").replace(/\.+$/, "");
}

function httpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function identityUrls(tool) {
  return [tool?.url, tool?.docs, tool?.github, ...(Array.isArray(tool?.sources) ? tool.sources : [])]
    .map(httpUrl)
    .filter(Boolean);
}

function sharedIdentityHost(host) {
  return [...SHARED_IDENTITY_HOSTS].find((sharedHost) => host === sharedHost || host.endsWith(`.${sharedHost}`)) || "";
}

function sharedPathNamespace(url, host) {
  const segments = url.pathname.split("/").filter(Boolean);
  const minimumSegments = host === "github.com" || host === "gitlab.com" || host === "huggingface.co" ? 2 : 1;
  return segments.length >= minimumSegments ? `/${segments.slice(0, minimumSegments).join("/")}` : "";
}

function identityUrlMatches(query, candidate) {
  const queryHost = normalizedHost(query.hostname);
  const candidateHost = normalizedHost(candidate.hostname);
  if (queryHost !== candidateHost) return false;
  const sharedHost = sharedIdentityHost(queryHost);
  if (!sharedHost) return true;
  const namespace = sharedPathNamespace(candidate, sharedHost);
  const queryPath = query.pathname.replace(/\/+$/, "") || "/";
  return Boolean(namespace && (queryPath === namespace || queryPath.startsWith(`${namespace}/`)));
}

export function normalizeMissingToolQuery(value = "") {
  const query = String(value).normalize("NFKC").replace(/\s+/g, " ").trim();
  return query.length <= MAX_MISSING_TOOL_QUERY_LENGTH ? query : "";
}

export function looksLikeOfficialUrlQuery(value = "") {
  return Boolean(httpUrl(normalizeMissingToolQuery(value)));
}

export function isSuggestibleMissingToolQuery(value = "", parsed = null) {
  const query = normalizeMissingToolQuery(value);
  if (!query) return false;
  if (looksLikeOfficialUrlQuery(query)) return true;
  if (FILTER_ONLY_QUERIES.has(query.toLocaleLowerCase("en"))) return false;
  if (/^(?:category|pricing|platform|execution|signup|api(?:[-\s]?key)?)\s*:\s*[\p{L}\p{N}-]*$/iu.test(query)) return false;
  const text = String(parsed?.text || "").trim();
  const meaningfulCharacters = [...text.matchAll(/[\p{L}\p{N}]/gu)].length;
  return meaningfulCharacters >= 2;
}

export function matchingToolsForUrl(value = "", tools = []) {
  const query = httpUrl(normalizeMissingToolQuery(value));
  if (!query) return [];
  const queryHost = normalizedHost(query.hostname);
  return tools.filter((tool) => {
    const domain = normalizedHost(tool?.domain);
    if (!sharedIdentityHost(queryHost) && domain && (queryHost === domain || queryHost.endsWith(`.${domain}`))) return true;
    return identityUrls(tool).some((url) => identityUrlMatches(query, url));
  });
}

export function existingToolMatchesUrl(value = "", tools = []) {
  return matchingToolsForUrl(value, tools).length > 0;
}

export function shouldOfferMissingToolSuggestion({ query = "", parsed = null, globalMatchCount = 0, isNormalCatalog = false, tools = [] } = {}) {
  const normalized = normalizeMissingToolQuery(query);
  if (!isNormalCatalog || !isSuggestibleMissingToolQuery(normalized, parsed)) return false;
  if (looksLikeOfficialUrlQuery(normalized)) return !existingToolMatchesUrl(normalized, tools);
  if (Number(globalMatchCount) > 0) return false;
  return true;
}

export function missingToolPrefill(value = "") {
  const query = normalizeMissingToolQuery(value);
  if (!query) return null;
  return looksLikeOfficialUrlQuery(query) ? { mode: "smart", url: query } : { mode: "manual", name: query };
}
