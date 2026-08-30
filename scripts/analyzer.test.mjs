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
  verifiedMetadataFromComments,
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
  // "research assistant" must prefer research over the generic chat-llm rule.
  assert.equal(detectCategory("research assistant for literature search and papers", categoriesAllowed), "research");
  assert.equal(detectCategory("a chat assistant for everyday questions", categoriesAllowed), "chat-llm");

  const pricing = detectPricing("Free plan available", "Pro plan is $20/month");
  assert.equal(pricing.pricing, "freemium");
  assert.equal(detectPricing("100% free forever").pricing, "free");
  assert.equal(detectPricing("Pay per token, usage-based pricing").pricing, "usage-based");
  assert.deepEqual(detectPricing("We do not publish pricing publicly"), {});
  // "free trial" is not a free tier: trial + paid must stay paid, not freemium.
  const trial = detectPricing("Start with a free trial", "Then paid plans from $10/month");
  assert.equal(trial.pricing, "paid");
  assert.notEqual(trial.pricing, "freemium");
  assert.deepEqual(detectPricing("Free trial for 14 days"), {});
  // Real free tiers still work next to paid plans.
  assert.equal(detectPricing("Free plan for everyone", "Pro at $20/month").pricing, "freemium");

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
  assert.ok(duplicates.some((item) => item.id === "cursor" && item.reasons.includes("same canonical URL")));
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

// Aider-like fixture: no meta description, terminal pair-programming copy, a
// multi-line install block, voice/browser mentions and model fragments.
const AIDER_HOME = `<!doctype html><html><head>
  <title>Aider | AI pair programming in your terminal</title>
  <meta property="og:site_name" content="Aider" />
  <link rel="icon" href="/favicon.png">
</head><body>
  <a href="https://aider.chat/docs/">Documentation</a>
  <a href="https://github.com/Aider-AI/aider">GitHub</a>
  <a href="https://aider.chat/docs/install.html">Installation</a>
  <h1>Aider is AI pair programming in your terminal</h1>
  <p>Aider lets you pair program with LLMs to edit code in your local git repo. It is open source and works with gpt-4o, claude-3.7 sonnet and deepseek-r1.</p>
  <p>Talk to it with your voice for voice-to-code, or copy results into a browser web chat. Configure deepseek-aider, deepseek-ollama or deepseek---api-key in the command line.</p>
  <pre>
python -m pip install aider-install
aider-install
  </pre>
  <pre>
pip install aider
  </pre>
</body></html>`;

test("aider-like page: coding-agents, no web/audio noise, clean install/models/description", async () => {
  const { tool } = await analyzeTool({
    url: "https://aider.chat/",
    fetchImpl: fakePages({
      "https://aider.chat/": AIDER_HOME,
      "https://aider.chat/docs/": "<html><body><h1>Documentation</h1><p>Read the docs.</p></body></html>",
      "https://aider.chat/docs/install.html": "<html><body><h1>Install</h1><p>Install Aider.</p></body></html>"
    })
  });
  assert.equal(tool.category, "coding-agents");
  assert.ok(tool.platforms.includes("cli"));
  assert.ok(!tool.platforms.includes("web"));
  assert.ok(tool.tags.includes("coding"));
  assert.ok(!tool.tags.includes("audio"));
  assert.equal(tool.install, "python -m pip install aider-install");
  assert.ok(tool.description.length >= 20 && tool.description.includes("pair programming"));
  assert.ok(tool.models.includes("gpt-4o"));
  assert.ok(tool.models.includes("claude-3.7"));
  assert.ok(tool.models.includes("deepseek-r1"));
  assert.ok(!tool.models.includes("deepseek-aider"));
  assert.ok(!tool.models.includes("deepseek-ollama"));
  assert.ok(!tool.models.includes("deepseek---api-key"));
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

test("verified metadata is trusted only from github-actions[bot] comments", () => {
  const marker =
    "<!-- ai-dekrov-verified-metadata -->\n```json\n{\"lastVerifiedAt\":\"2026-08-29\",\"sources\":[\"https://cursor.com/\"]}\n```";
  const botComment = { user: { login: "github-actions[bot]", type: "Bot" }, body: marker };
  const spoofedUser = { user: { login: "evil-user", type: "User" }, body: marker };
  const noUser = { body: marker };
  // A user comment carrying the same marker must be ignored.
  assert.deepEqual(verifiedMetadataFromComments([spoofedUser]), null);
  assert.deepEqual(verifiedMetadataFromComments([noUser]), null);
  // A bot comment with the marker is trusted; order does not matter.
  assert.deepEqual(verifiedMetadataFromComments([spoofedUser, botComment]), {
    lastVerifiedAt: "2026-08-29",
    sources: ["https://cursor.com/"]
  });
  // A bot comment without the marker is not trusted.
  assert.deepEqual(verifiedMetadataFromComments([{ user: { login: "github-actions[bot]", type: "Bot" }, body: "nothing relevant" }]), null);
  assert.deepEqual(verifiedMetadataFromComments([]), null);
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

// ---------------------------------------------------------------------------
// Issue-body section parsing regression tests
// ---------------------------------------------------------------------------

test("empty Existing tool ID on a new submission parses as empty", () => {
  const body =
    "### Submission type\n\nnew\n\n### Existing tool ID\n\n\n\n" +
    "### Tool JSON\n{ \"id\": \"agent-qa\" }\n\n### Confirmation\n\n- [x] yes";
  const submission = parseIssueSubmission(body);
  assert.equal(submission.type, "new");
  assert.equal(submission.existingToolId, "");
  assert.deepEqual(JSON.parse(submission.json), { id: "agent-qa" });
});

test("_No response_ Existing tool ID counts as empty", () => {
  const body = "### Submission type\n\nnew\n\n### Existing tool ID\n\n_No response_\n\n### Tool JSON\n{\"id\":\"agent-qa\"}";
  const submission = parseIssueSubmission(body);
  assert.equal(submission.type, "new");
  assert.equal(submission.existingToolId, "");
});

test("update submission reads a non-empty Existing tool ID", () => {
  const body = "### Submission type\n\nupdate\n\n### Existing tool ID\ncursor\n\n### Tool JSON\n{\"id\":\"cursor\"}";
  const submission = parseIssueSubmission(body);
  assert.equal(submission.type, "update");
  assert.equal(submission.existingToolId, "cursor");
});

test("an empty section never swallows the next section header", () => {
  const body = "### Submission type\n\nnew\n\n### Existing tool ID\n\n\r\n### Tool JSON\n{\"id\":\"agent-qa\"}";
  const submission = parseIssueSubmission(body);
  assert.equal(submission.existingToolId, "");
  assert.deepEqual(JSON.parse(submission.json), { id: "agent-qa" });
});

test("section parsing supports both LF and CRLF bodies", () => {
  const lf = "### Submission type\nnew\n\n### Existing tool ID\n\n_No response_\n\n### Tool JSON\n{\"id\":\"agent-qa\"}\n";
  const crlf = lf.replace(/\n/g, "\r\n");
  for (const body of [lf, crlf]) {
    const submission = parseIssueSubmission(body);
    assert.equal(submission.type, "new");
    assert.equal(submission.existingToolId, "");
    assert.deepEqual(JSON.parse(submission.json), { id: "agent-qa" });
  }
});

// ---------------------------------------------------------------------------
// Duplicate detection regression tests
// ---------------------------------------------------------------------------

const COPILOT = { id: "github-copilot", name: "GitHub Copilot", url: "https://github.com/features/copilot", domain: "github.com" };

test("github-hosted tools are not duplicates by shared domain alone", () => {
  const agentQa = { id: "agent-qa", name: "Agent QA", url: "https://github.com/vostride/agent-qa", domain: "github.com" };
  assert.deepEqual(findDuplicates(agentQa, [COPILOT]), []);
});

test("identical canonical URL is a duplicate", () => {
  const a = { id: "a", name: "Alpha", url: "https://cursor.com/", domain: "cursor.com" };
  const b = { id: "b", name: "Beta", url: "https://cursor.com", domain: "cursor.com" };
  const duplicates = findDuplicates(a, [b]);
  assert.ok(duplicates.some((item) => item.reasons.includes("same canonical URL")));
});

test("two different tools on the same product domain are not duplicates", () => {
  const a = { id: "tool-a", name: "Tool A", url: "https://exampletool.com/a", domain: "exampletool.com" };
  const b = { id: "tool-b", name: "Tool B", url: "https://exampletool.com/b", domain: "exampletool.com" };
  assert.deepEqual(findDuplicates(a, [b]), []);
});

test("different LangChain products sharing langchain.com are not duplicates", () => {
  const deepAgents = { id: "deep-agents", name: "Deep Agents", url: "https://www.langchain.com/deepagents", domain: "langchain.com" };
  const langGraph = { id: "langgraph", name: "LangGraph", url: "https://www.langchain.com/langgraph", domain: "langchain.com" };
  assert.deepEqual(findDuplicates(deepAgents, [langGraph]), []);
  assert.deepEqual(findDuplicates(langGraph, [deepAgents]), []);
});

test("different tools on openai.com are not duplicates", () => {
  const chatgpt = { id: "chatgpt", name: "ChatGPT", url: "https://openai.com/chatgpt", domain: "openai.com" };
  const o1 = { id: "o1", name: "o1", url: "https://openai.com/o1", domain: "openai.com" };
  assert.deepEqual(findDuplicates(chatgpt, [o1]), []);
});

test("similar names are still flagged as duplicates", () => {
  const a = { id: "cursor", name: "Cursor", url: "https://cursor.com/", domain: "cursor.com" };
  const b = { id: "cursor-ai", name: "Cursor AI", url: "https://cursor-ai.example/", domain: "cursor-ai.example" };
  const duplicates = findDuplicates(a, [b]);
  assert.ok(duplicates.some((item) => item.id === "cursor-ai" && item.reasons.includes("very similar name")));
});

test("same id is a duplicate", () => {
  const a = { id: "cursor", name: "One", url: "https://cursor.com/", domain: "cursor.com" };
  const b = { id: "cursor", name: "Two", url: "https://other.com/", domain: "other.com" };
  const duplicates = findDuplicates(a, [b]);
  assert.ok(duplicates.some((item) => item.reasons.includes("same id")));
});

test("an update does not count itself as a duplicate", () => {
  const tool = { id: "cursor", name: "Cursor", url: "https://cursor.com/", domain: "cursor.com" };
  assert.deepEqual(findDuplicates(tool, [tool], "cursor"), []);
});

test("real new submission body parses cleanly and is not a github.com duplicate", async () => {
  const schema = await loadSchema();
  const body = `### Submission type

new

### Existing tool ID



### Tool JSON

{
  "id": "agent-qa",
  "name": "Agent QA",
  "category": "dev-tools",
  "description": "Agentic QA harness",
  "url": "https://github.com/vostride/agent-qa",
  "domain": "github.com",
  "platforms": ["web", "cli"],
  "tags": ["testing", "qa"],
  "install": "npm install -D agent-qa",
  "start": "npx agent-qa dashboard --open",
  "github": "https://github.com/vostride/agent-qa",
  "docs": "https://vostride.com/docs/agent-qa"
}

### Context

Official project submission.

### Confirmation

- [x] I confirm that the information is factual and the tool can be publicly listed.`;
  const submission = parseIssueSubmission(body);
  assert.equal(submission.type, "new");
  assert.equal(submission.existingToolId, "");
  const checked = validateTool(JSON.parse(submission.json), schema);
  assert.deepEqual(checked.errors, []);
  assert.deepEqual(findDuplicates(checked.tool, [COPILOT]), []);
});
