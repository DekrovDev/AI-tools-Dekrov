import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicHttpUrl,
  assertSafeRequestUrl,
  isIpBlocked,
  safeFetch,
  decodeHtml,
  stripHtml,
  firstMeta,
  firstTitle,
  firstFavicon,
  findLinks,
  extractCodeBlocks,
  detectPlatforms,
  detectCategory,
  detectPricing,
  detectTags,
  detectModels,
  discoverUsefulLinks,
  analyzeTool,
  loadSchema
} from "./analyzer.mjs";
import {
  parseSmartAddSubmission,
  looksLikeSmartAdd,
  looksLikeSubmission,
  parseVerifiedMetadata,
  parseVerifiedComment,
  canonicalUrl,
  parseIssueSubmission,
  validateTool,
  findDuplicates
} from "../.github/scripts/submission-lib.mjs";
import { buildCanonicalBody, buildVerifiedComment, applyEnrichment, enrichWithLLM, runSmartAdd, parseArgs } from "./smart-add.mjs";

// ---------------------------------------------------------------------------
// URL validation / private IP blocking
// ---------------------------------------------------------------------------

test("assertPublicHttpUrl accepts public http(s) and rejects other schemes", () => {
  assert.equal(assertPublicHttpUrl("https://example.com").href, "https://example.com/");
  assert.equal(assertPublicHttpUrl("http://example.com").href, "http://example.com/");
  assert.throws(() => assertPublicHttpUrl("ftp://example.com"), /Only http\(s\)/);
  assert.throws(() => assertPublicHttpUrl("javascript:alert(1)"), /Only http\(s\)/);
  assert.throws(() => assertPublicHttpUrl("https://user:pass@example.com"), /credentials/);
  assert.throws(() => assertPublicHttpUrl("not a url"), /not a valid URL/);
});

test("isIpBlocked rejects private, loopback, link-local, metadata and reserved ranges", () => {
  const blocked = [
    ["127.0.0.1", 4], ["127.8.8.8", 4], ["0.0.0.0", 4],
    ["10.0.0.1", 4], ["10.255.255.255", 4],
    ["172.16.0.1", 4], ["172.31.255.255", 4],
    ["192.168.0.1", 4], ["192.168.255.255", 4],
    ["169.254.169.254", 4], ["169.254.0.1", 4],
    ["100.64.0.1", 4], ["192.0.2.1", 4], ["198.51.100.1", 4], ["203.0.113.1", 4],
    ["224.0.0.1", 4], ["240.0.0.1", 4],
    ["::1", 6], ["::", 6], ["fe80::1", 6], ["fc00::1", 6], ["fd00::1", 6], ["ff02::1", 6], ["2001:db8::1", 6]
  ];
  for (const [address, family] of blocked) {
    assert.equal(isIpBlocked(address, family), true, `expected ${address} to be blocked`);
  }
  const allowed = [
    ["8.8.8.8", 4], ["1.1.1.1", 4], ["93.184.216.34", 4], ["2606:4700:4700::1111", 6], ["2001:4860:4860::8888", 6]
  ];
  for (const [address, family] of allowed) {
    assert.equal(isIpBlocked(address, family), false, `expected ${address} to be allowed`);
  }
  // IPv4-mapped forms of a blocked address must also be blocked.
  assert.equal(isIpBlocked("::ffff:127.0.0.1", 6), true);
  assert.equal(isIpBlocked("::ffff:8.8.8.8", 6), false);
});

test("assertSafeRequestUrl blocks localhost and literal private IPs", () => {
  assert.throws(() => assertSafeRequestUrl("http://localhost/"), /Blocked host/);
  assert.throws(() => assertSafeRequestUrl("http://127.0.0.1/"), /Blocked address/);
  assert.throws(() => assertSafeRequestUrl("http://169.254.169.254/latest/meta-data/"), /Blocked address/);
  assert.equal(assertSafeRequestUrl("https://example.com/").hostname, "example.com");
  assert.equal(assertSafeRequestUrl("http://93.184.216.34/").hostname, "93.184.216.34");
});

// ---------------------------------------------------------------------------
// Redirect handling
// ---------------------------------------------------------------------------

function fakeFetchOnce(fn) {
  return async (url, options) => fn(new URL(url), options);
}

test("safeFetch follows a bounded number of redirects and re-validates each hop", async () => {
  const calls = [];
  const fetchOnce = fakeFetchOnce(async (url) => {
    calls.push(url.href);
    if (calls.length === 1) {
      return { status: 302, contentType: "", location: "https://example.com/final", text: "" };
    }
    return { status: 200, contentType: "text/html", location: "", text: "<title>Final</title>" };
  });
  const result = await safeFetch("https://example.com/start", { fetchOnce });
  assert.equal(result.url, "https://example.com/final");
  assert.equal(result.text, "<title>Final</title>");
  assert.equal(calls.length, 2);
});

test("safeFetch rejects redirects to a blocked destination before fetching it", async () => {
  const calls = [];
  const fetchOnce = fakeFetchOnce(async (url) => {
    calls.push(url.href);
    return { status: 302, contentType: "", location: "http://127.0.0.1/admin", text: "" };
  });
  await assert.rejects(() => safeFetch("https://example.com/start", { fetchOnce }), /Blocked address/);
  assert.equal(calls.length, 1); // the blocked destination was never fetched
});

test("safeFetch stops after too many redirects", async () => {
  const fetchOnce = fakeFetchOnce(async () => ({ status: 302, contentType: "", location: "https://example.com/again", text: "" }));
  await assert.rejects(() => safeFetch("https://example.com/start", { fetchOnce, maxRedirects: 3 }), /Too many redirects/);
});

test("safeFetch rejects redirects without a Location header", async () => {
  const fetchOnce = fakeFetchOnce(async () => ({ status: 301, contentType: "", location: "", text: "" }));
  await assert.rejects(() => safeFetch("https://example.com/start", { fetchOnce }), /without a Location/);
});

// ---------------------------------------------------------------------------
// Metadata extraction and malformed HTML
// ---------------------------------------------------------------------------

const SAMPLE_HTML = `<!doctype html><html><head>
  <title>Cursor | The AI Code Editor</title>
  <meta name="description" content="Write, edit &amp; chat with your code">
  <meta property="og:site_name" content="Cursor" />
  <meta property="og:url" content="https://cursor.com/">
  <meta name="twitter:title" content="Cursor">
  <link rel="icon" type="image/png" href="/assets/favicon.png">
</head><body>
  <a href="/pricing">Pricing</a>
  <a href="https://github.com/getcursor/cursor">GitHub</a>
  <a href="https://docs.cursor.com">Documentation</a>
  <pre>npm install -g cursor</pre>
  <p>The coding agent for writing code in your terminal and VS Code.</p>
  <script>alert("ignored")</script>
  <style>body { display: none; }</style>
</body></html>`;

test("extracts metadata from a real-looking page", () => {
  assert.equal(firstMeta(SAMPLE_HTML, ["og:site_name"]), "Cursor");
  assert.equal(firstMeta(SAMPLE_HTML, ["description"]), "Write, edit & chat with your code");
  assert.equal(firstTitle(SAMPLE_HTML), "Cursor | The AI Code Editor");
  assert.equal(firstFavicon(SAMPLE_HTML, "https://cursor.com/"), "https://cursor.com/assets/favicon.png");
  const links = findLinks(SAMPLE_HTML, "https://cursor.com/");
  assert.ok(links.some((link) => link.href === "https://github.com/getcursor/cursor"));
  assert.ok(links.some((link) => link.href === "https://docs.cursor.com/"));
  assert.deepEqual(extractCodeBlocks(SAMPLE_HTML), ["npm install -g cursor"]);
  const text = stripHtml(SAMPLE_HTML);
  assert.ok(text.includes("The coding agent for writing code"));
  assert.ok(!text.includes("alert("));
  assert.equal(decodeHtml("a &amp; b &lt;c&gt;"), "a & b <c>");
});

test("malformed HTML never throws", () => {
  const garbage = [
    "<html><body><div unclosed",
    "<meta content='",
    "<a href=\"https://x.test\">no close",
    ">>> <script> <style> </a>",
    "<pre>unfinished",
    "plain text with < weird <things> and \u0000 null bytes"
  ];
  for (const html of garbage) {
    assert.doesNotThrow(() => stripHtml(html));
    assert.doesNotThrow(() => firstMeta(html, ["description"]));
    assert.doesNotThrow(() => firstTitle(html));
    assert.doesNotThrow(() => findLinks(html, "https://example.com/"));
    assert.doesNotThrow(() => extractCodeBlocks(html));
  }
});

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

test("detects platforms, category, pricing, tags and models conservatively", async () => {
  const schema = await loadSchema();
  const platformsAllowed = schema.properties.platforms.items.enum;
  const categoriesAllowed = schema.properties.category.enum;
  const text = "Cursor is a coding agent CLI and desktop app for VS Code. Free plan and Pro at $20/month. Built on GPT-4 and Claude 3.5 and a custom LLM.";

  const platforms = detectPlatforms(text, platformsAllowed);
  assert.ok(platforms.includes("vscode"));
  assert.ok(platforms.includes("desktop"));
  assert.ok(platforms.includes("cli"));
  assert.ok(platforms.every((item) => platformsAllowed.includes(item)));

  const category = detectCategory(text, categoriesAllowed);
  assert.equal(category, "coding-agents");
  assert.ok(categoriesAllowed.includes(category));

  const pricing = detectPricing("Free plan available", "Pro plan is $20/month");
  assert.equal(pricing.pricing, "freemium");
  assert.equal(detectPricing("100% free forever").pricing, "free");
  assert.equal(detectPricing("Pay per token, usage-based pricing").pricing, "usage-based");
  assert.deepEqual(detectPricing("We do not publish pricing publicly"), {});

  const tags = detectTags(text, platforms);
  assert.ok(tags.includes("coding"));
  assert.ok(tags.includes("agent"));
  assert.ok(tags.includes("llm"));

  const models = detectModels(text);
  assert.ok(models.includes("gpt-4"));
  assert.ok(models.includes("claude-3.5"));
  assert.equal(detectModels("no models mentioned here").length, 0);
});

test("discoverUsefulLinks is bounded, same-host only, pricing first", () => {
  const html = `
    <a href="/pricing">Pricing</a>
    <a href="https://other-site.com/pricing">Off-site pricing</a>
    <a href="/docs">Documentation</a>
    <a href="/pricing">Pricing again</a>
    <a href="/download">Download</a>
    <a href="/install">Install</a>
  `;
  const links = discoverUsefulLinks(html, "https://example.com/");
  assert.ok(links.length <= 3);
  assert.equal(links[0].kind, "pricing");
  assert.equal(links[0].href, "https://example.com/pricing");
  assert.ok(links.every((link) => new URL(link.href).hostname === "example.com"));
});

// ---------------------------------------------------------------------------
// analyzeTool end-to-end (offline via injected fetch)
// ---------------------------------------------------------------------------

function fakePages(pagesByUrl) {
  return async (url) => {
    const page = pagesByUrl[url];
    if (!page) throw new Error(`unexpected fetch: ${url}`);
    return { status: 200, contentType: "text/html", location: "", text: page };
  };
}

const HOME = `<!doctype html><head>
  <title>Cursor | The AI Code Editor</title>
  <meta name="description" content="The AI code editor">
  <meta property="og:site_name" content="Cursor" />
  <link rel="icon" href="/favicon.png">
</head><body>
  <a href="https://cursor.com/pricing">Pricing</a>
  <a href="https://docs.cursor.com">Documentation</a>
  <a href="https://github.com/getcursor/cursor">GitHub</a>
  <pre>npm install -g cursor</pre>
  <p>A coding agent desktop app for VS Code and your terminal. Free plan, Pro at $20/month.</p>
</body>`;
const PRICING = `<html><body><h1>Pricing</h1><p>Free plan for individuals. Pro costs $20/month.</p></body></html>`;

test("analyzeTool builds a schema-shaped candidate from homepage + useful pages", async () => {
  const result = await analyzeTool({
    url: "https://cursor.com/",
    context: "Official coding agent from OpenAI",
    fetchImpl: fakePages({
      "https://cursor.com/": HOME,
      "https://cursor.com/pricing": PRICING
    })
  });
  const { tool, pages, warnings } = result;
  assert.equal(tool.name, "Cursor");
  assert.equal(tool.url, "https://cursor.com/");
  assert.equal(tool.domain, "cursor.com");
  assert.equal(tool.category, "coding-agents");
  assert.ok(tool.platforms.includes("desktop"));
  assert.ok(tool.platforms.includes("vscode"));
  assert.equal(tool.pricing, "freemium");
  assert.equal(tool.github, "https://github.com/getcursor/cursor");
  assert.equal(tool.docs, "https://docs.cursor.com/");
  assert.equal(tool.install, "npm install -g cursor");
  assert.equal(result.context, "Official coding agent from OpenAI");
  assert.ok(pages.some((page) => page.kind === "pricing"));
  assert.ok(Array.isArray(warnings));
});

test("analyzeTool candidate passes validation and duplicate detection", async () => {
  const schema = await loadSchema();
  const tools = [
    { id: "cursor", name: "Cursor", url: "https://cursor.com/", domain: "cursor.com", category: "coding-agents", pricing: "freemium", platforms: ["web"] }
  ];
  const { tool } = await analyzeTool({
    url: "https://cursor.com/",
    fetchImpl: fakePages({ "https://cursor.com/": HOME, "https://cursor.com/pricing": PRICING })
  });
  const checked = validateTool(tool, schema);
  assert.equal(checked.errors.length, 0);
  const duplicates = findDuplicates(checked.tool, tools);
  assert.ok(duplicates.some((item) => item.id === "cursor" && item.reasons.includes("same domain")));
});

const HOME_FINAL = `<!doctype html><head>
  <title>Final Org</title>
  <meta name="description" content="A redirected tool">
  <meta property="og:site_name" content="Final Org" />
</head><body>
  <a href="https://final.example.org/pricing">Pricing</a>
  <a href="https://old.example.com/pricing">Old pricing</a>
</body>`;
const PRICING_FINAL = "<html><body><h1>Pricing</h1><p>Free plan, Pro at $20/month.</p></body></html>";

test("analyzeTool uses the final redirected host for domain and extra pages", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url === "https://old.example.com/") {
      return { status: 200, contentType: "text/html", url: "https://final.example.org/", text: HOME_FINAL };
    }
    if (url === "https://final.example.org/pricing") {
      return { status: 200, contentType: "text/html", url, text: PRICING_FINAL };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  const { tool, pages } = await analyzeTool({ url: "https://old.example.com/", fetchImpl });
  assert.equal(tool.domain, "final.example.org");
  assert.equal(tool.url, "https://final.example.org/");
  assert.ok(pages.some((page) => page.kind === "pricing" && page.url === "https://final.example.org/pricing"));
  assert.ok(!calls.includes("https://old.example.com/pricing")); // old host never reused
});

// ---------------------------------------------------------------------------
// Smart Add issue parsing / canonical body round-trip
// ---------------------------------------------------------------------------

const SMART_BODY = `### Tool URL
https://cursor.com

### Context
Official coding agent from OpenAI

### Confirmation
- [x] I confirm this is a real tool with an official public website.`;

test("parseSmartAddSubmission and looksLikeSmartAdd work from the form rendering", () => {
  const parsed = parseSmartAddSubmission(SMART_BODY);
  assert.equal(parsed.toolUrl, "https://cursor.com");
  assert.equal(parsed.context, "Official coding agent from OpenAI");
  assert.equal(looksLikeSmartAdd("[Smart Add] Cursor", SMART_BODY), true);
  assert.equal(looksLikeSmartAdd("[Tool] Cursor", SMART_BODY), true); // body section counts
  assert.equal(looksLikeSmartAdd("Some other issue", "nothing here"), false);
  assert.equal(parseSmartAddSubmission("### Tool URL\n_No response_\n").toolUrl, "");
});

test("looksLikeSubmission detects canonical submissions without any labels", () => {
  assert.equal(looksLikeSubmission("### Tool JSON\n{ \"id\": \"x\" }"), true);
  assert.equal(looksLikeSubmission("just a random issue with no form"), false);
  assert.equal(looksLikeSubmission(""), false);
});

test("canonicalUrl only accepts http/https schemes", () => {
  assert.equal(canonicalUrl("https://example.com/"), "https://example.com/");
  assert.equal(canonicalUrl("http://example.com"), "http://example.com/");
  assert.equal(canonicalUrl("javascript:alert(1)"), "");
  assert.equal(canonicalUrl("data:text/html,<h1>x</h1>"), "");
  assert.equal(canonicalUrl("ftp://example.com/file"), "");
  assert.equal(canonicalUrl("file:///etc/passwd"), "");
  assert.equal(canonicalUrl("mailto:user@example.com"), "");
  assert.equal(canonicalUrl("not a url"), "");
});

test("validateTool rejects non-http(s) url/favicon/github/docs", async () => {
  const schema = await loadSchema();
  const tool = {
    id: "bad",
    name: "Bad",
    category: "other",
    url: "javascript:alert(1)",
    favicon: "data:image/png;base64,AAAA",
    github: "ftp://example.com/repo",
    docs: "file:///etc/hosts"
  };
  const checked = validateTool(tool, schema);
  assert.ok(checked.errors.some((error) => error.includes("url must be a valid http(s)")));
  assert.ok(checked.errors.some((error) => error.includes("favicon must be a valid URL")));
  assert.ok(checked.errors.some((error) => error.includes("github must be a valid URL")));
  assert.ok(checked.errors.some((error) => error.includes("docs must be a valid URL")));
});

test("canonical body round-trips; verified metadata travels via bot comment only", () => {
  const tool = { id: "cursor", name: "Cursor", category: "coding-agents", url: "https://cursor.com/" };
  const context = "Official coding agent";
  const body = buildCanonicalBody(tool, context);
  const submission = parseIssueSubmission(body);
  assert.equal(submission.type, "new");
  assert.deepEqual(JSON.parse(submission.json), tool);
  // The user-editable body must never contain verification metadata.
  assert.equal(parseVerifiedMetadata(body), null);
  // It round-trips through the bot comment instead.
  const comment = buildVerifiedComment({ lastVerifiedAt: "2026-08-29", sources: ["https://cursor.com/"] });
  assert.deepEqual(parseVerifiedComment(comment), { lastVerifiedAt: "2026-08-29", sources: ["https://cursor.com/"] });
  assert.equal(parseVerifiedComment("a user comment without the marker"), null);
  assert.equal(parseVerifiedComment("<!-- ai-dekrov-verified-metadata -->\nnot json"), null);
  // Body must not accidentally re-trigger Smart Add detection.
  assert.equal(looksLikeSmartAdd("[Tool] Cursor", body), false);
});

test("parseVerifiedMetadata ignores malformed blocks", () => {
  assert.equal(parseVerifiedMetadata("### Verified metadata\nnot json"), null);
  assert.equal(parseVerifiedMetadata("### Verified metadata\n{\"sources\": \"nope\"}"), null);
  assert.equal(parseVerifiedMetadata("no metadata here"), null);
});

// ---------------------------------------------------------------------------
// AI enrichment fallback
// ---------------------------------------------------------------------------

const CANDIDATE = { id: "cursor", name: "Cursor", category: "other", url: "https://cursor.com/", description: "", platforms: [], pricing: "", priceDetails: "", tags: [], install: "", start: "", commands: [], models: [], github: "", docs: "" };

test("applyEnrichment keeps deterministic candidate on invalid AI JSON", () => {
  assert.equal(applyEnrichment(CANDIDATE, "this is not json"), CANDIDATE);
  assert.equal(applyEnrichment(CANDIDATE, '{"category": "coding-agents"'), CANDIDATE);
  assert.equal(applyEnrichment(CANDIDATE, "```json\n{nope}\n```"), CANDIDATE);
});

test("applyEnrichment fills gaps from valid AI JSON; enum safety is enforced downstream", () => {
  const enriched = applyEnrichment(CANDIDATE, '{"category": "coding-agents", "description": "AI code editor", "install": "npm i -g cursor", "pricing": "made-up-value"}');
  assert.equal(enriched.category, "coding-agents"); // refined from "other"
  assert.equal(enriched.description, "AI code editor");
  assert.equal(enriched.install, "npm i -g cursor");
  // applyEnrichment only merges gaps; runSmartAdd re-validates against the
  // schema afterwards, so an invented enum value can never reach the catalog.
  assert.equal(enriched.pricing, "made-up-value");
});

test("enrichWithLLM falls back to candidate when disabled or when the provider fails", async () => {
  // Disabled: no provider env at all.
  const fromDisabled = await enrichWithLLM({ candidate: CANDIDATE, schema: {}, evidence: "", context: "" });
  assert.equal(fromDisabled, CANDIDATE);
  // Provider returns a non-JSON response.
  const failing = await enrichWithLLM({
    candidate: CANDIDATE,
    schema: {},
    evidence: "",
    context: "",
    baseUrl: "https://provider.example",
    apiKey: "key",
    model: "m",
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "oops" } }] }) })
  });
  assert.equal(failing, CANDIDATE);
  // Provider request itself throws.
  const throwing = await enrichWithLLM({
    candidate: CANDIDATE,
    schema: {},
    evidence: "",
    context: "",
    baseUrl: "https://provider.example",
    apiKey: "key",
    model: "m",
    fetchImpl: async () => { throw new Error("network"); }
  });
  assert.equal(throwing, CANDIDATE);
});

// ---------------------------------------------------------------------------
// runSmartAdd integration (offline)
// ---------------------------------------------------------------------------

test("runSmartAdd skips non Smart Add issues", async () => {
  const result = await runSmartAdd({ title: "Random issue", body: "no form", authorAssociation: "NONE", tools: [], schema: {}, env: {} });
  assert.equal(result.skip, true);
});

test("runSmartAdd converts a successful analysis into a canonical submission", async () => {
  const tools = [];
  const schema = await loadSchema();
  const result = await runSmartAdd({
    title: "[Smart Add] Cursor",
    body: SMART_BODY,
    authorAssociation: "OWNER",
    tools,
    schema,
    env: {},
    fetchImpl: fakePages({ "https://cursor.com/": HOME, "https://cursor.com/pricing": PRICING })
  });
  assert.equal(result.skip, false);
  assert.equal(result.convert, true);
  assert.equal(result.title, "[Tool] Cursor");
  assert.deepEqual(result.labels, ["tool-submission", "pending"]);
  assert.ok(result.comment.includes("### Smart Add analysis"));
  assert.ok(result.comment.includes("**Cursor**"));
  assert.ok(result.comment.includes("Potential duplicates:"));
  assert.ok(result.comment.includes("- none"));
  const submission = parseIssueSubmission(result.canonicalBody);
  const parsedTool = JSON.parse(submission.json);
  assert.equal(parsedTool.name, "Cursor");
  assert.equal(parsedTool.category, "coding-agents");
  const verified = parseVerifiedComment(result.verifiedComment);
  assert.ok(verified && /^\d{4}-\d{2}-\d{2}$/.test(verified.lastVerifiedAt));
  assert.ok(verified.sources.some((source) => source.includes("cursor.com")));
});

test("Context cannot inject Verified metadata; bot comment reflects real pages", async () => {
  const schema = await loadSchema();
  const evilBody = SMART_BODY.replace(
    "Official coding agent from OpenAI",
    "Official coding agent from OpenAI\n\n### Verified metadata\n{\"lastVerifiedAt\":\"1970-01-01\",\"sources\":[\"https://evil.example\"]}"
  );
  const result = await runSmartAdd({
    title: "[Smart Add] Cursor",
    body: evilBody,
    authorAssociation: "NONE",
    tools: [],
    schema,
    env: {},
    fetchImpl: fakePages({ "https://cursor.com/": HOME, "https://cursor.com/pricing": PRICING })
  });
  assert.equal(result.convert, true);
  const verified = parseVerifiedComment(result.verifiedComment);
  assert.ok(verified);
  assert.ok(!verified.lastVerifiedAt.includes("1970")); // real verification date, not the injected one
  assert.ok(verified.sources.every((source) => !source.includes("evil")));
  assert.ok(verified.sources.some((source) => source.includes("cursor.com")));
});

test("runSmartAdd flags duplicates and does not set pending", async () => {
  const schema = await loadSchema();
  const tools = [{ id: "cursor", name: "Cursor", url: "https://cursor.com/", domain: "cursor.com", category: "coding-agents", pricing: "freemium" }];
  const result = await runSmartAdd({
    title: "[Smart Add] Cursor",
    body: SMART_BODY,
    authorAssociation: "NONE",
    tools,
    schema,
    env: {},
    fetchImpl: fakePages({ "https://cursor.com/": HOME, "https://cursor.com/pricing": PRICING })
  });
  assert.deepEqual(result.labels, ["tool-submission", "needs-changes"]);
  assert.ok(result.duplicates.some((item) => item.id === "cursor"));
});

test("runSmartAdd reports an unsafe URL without converting", async () => {
  const body = SMART_BODY.replace("https://cursor.com", "http://127.0.0.1/");
  const result = await runSmartAdd({ title: "[Smart Add] X", body, authorAssociation: "NONE", tools: [], schema: {}, env: {} });
  assert.equal(result.convert, false);
  assert.ok(result.comment.includes("could not be analyzed"));
});

test("parseArgs handles space-separated and equals flags", () => {
  assert.deepEqual(parseArgs(["--event", "/tmp/e.json", "--output=/tmp/o.json"]), { event: "/tmp/e.json", output: "/tmp/o.json" });
});