import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSchema } from "./analyzer.mjs";
import { parseIssueSubmission } from "../.github/scripts/submission-lib.mjs";
import {
  mergeEnrichedFields,
  ENRICHMENT_FOCUS_FIELDS,
  replaceToolJsonSection,
  runModeratorEnrichment,
  isTrustedActor,
  buildNoEnrichmentComment,
  buildSuccessComment,
  enrichWithLLM,
  applyEnrichment
} from "./ai-enrichment.mjs";

// A valid-but-incomplete contributor submission: several optional fields empty.
const ORIGINAL = {
  id: "agent-qa",
  name: "Agent QA",
  category: "dev-tools",
  description: "Agentic QA harness for running natural-language web and mobile tests.",
  bestFor: [],
  strengths: [],
  gettingStarted: [],
  usageNotes: [],
  url: "https://vostride.com/agent-qa",
  domain: "vostride.com",
  favicon: "",
  platforms: ["web", "cli"],
  pricing: "",
  priceDetails: "",
  tags: ["testing", "qa"],
  install: "npm install -D agent-qa",
  start: "npx agent-qa dashboard --open",
  commands: [],
  models: [],
  github: "https://github.com/vostride/agent-qa",
  docs: "https://vostride.com/docs/agent-qa"
};

function buildBody(tool) {
  return [
    "### Submission type",
    "",
    "new",
    "",
    "### Existing tool ID",
    "",
    "",
    "",
    "### Tool JSON",
    "",
    JSON.stringify(tool, null, 2),
    "",
    "### Context",
    "",
    "Official project submission.",
    "",
    "### Confirmation",
    "",
    "- [x] I confirm that the information is factual and the tool can be publicly listed."
  ].join("\n");
}

const ENV = { AI_PROVIDER_BASE_URL: "https://provider.example", AI_API_KEY: "key", AI_MODEL: "m" };

// Fake official-source fetcher (safeFetch-compatible).
function fakeEvidence() {
  return async (url) => ({ status: 200, contentType: "text/html", url, text: "<html><body><p>Agentic QA harness documentation with running tests, pricing and commands.</p><pre>npx agent-qa test</pre></body></html>" });
}

// Fake LLM provider that returns a fixed content string, or throws.
function fakeLlm(content = null, opts = {}) {
  return async (url) => {
    assert.ok(String(url).endsWith("/chat/completions"), `expected LLM call, got ${url}`);
    if (opts.throw_) throw new Error(opts.message || "provider error");
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
}

// ---------------------------------------------------------------------------
// Merge semantics: fill only empty fields, preserve contributor data.
// ---------------------------------------------------------------------------

test("empty arrays can be enriched", () => {
  const ai = {
    bestFor: ["QA teams"],
    strengths: ["Self-healing test actions"],
    gettingStarted: ["Install via npm"],
    usageNotes: ["Run in CI and locally"]
  };
  const merged = mergeEnrichedFields(ORIGINAL, ai, ENRICHMENT_FOCUS_FIELDS);
  assert.deepEqual(merged.bestFor, ["QA teams"]);
  assert.deepEqual(merged.strengths, ["Self-healing test actions"]);
  assert.deepEqual(merged.gettingStarted, ["Install via npm"]);
  assert.deepEqual(merged.usageNotes, ["Run in CI and locally"]);
});

test("empty scalar fields can be enriched", () => {
  const merged = mergeEnrichedFields(
    ORIGINAL,
    { pricing: "free", priceDetails: "Free for individuals", favicon: "https://vostride.com/favicon.ico" },
    ENRICHMENT_FOCUS_FIELDS
  );
  assert.equal(merged.pricing, "free");
  assert.equal(merged.priceDetails, "Free for individuals");
  assert.equal(merged.favicon, "https://vostride.com/favicon.ico");
});

test("existing non-empty scalar fields are preserved exactly", () => {
  const merged = mergeEnrichedFields(
    ORIGINAL,
    { description: "Completely rewritten", name: "Hacked name", pricing: "free" },
    ENRICHMENT_FOCUS_FIELDS
  );
  assert.equal(merged.description, ORIGINAL.description);
  assert.equal(merged.name, ORIGINAL.name);
  // pricing was empty, so it may be filled.
  assert.equal(merged.pricing, "free");
});

test("existing non-empty arrays are preserved exactly", () => {
  const merged = mergeEnrichedFields(
    ORIGINAL,
    { tags: ["coding", "extra"], bestFor: ["QA teams"] },
    ENRICHMENT_FOCUS_FIELDS
  );
  // tags is not an enrichment target and was non-empty: untouched.
  assert.deepEqual(merged.tags, ["testing", "qa"]);
  // bestFor was empty: filled.
  assert.deepEqual(merged.bestFor, ["QA teams"]);
});

test("generated fields returned by AI are ignored", () => {
  const merged = mergeEnrichedFields(
    ORIGINAL,
    { addedAt: "2020-01-01", updatedAt: "2020-01-02", lastVerifiedAt: "2020-01-03", sources: ["https://evil.example"], bestFor: ["QA teams"] },
    ENRICHMENT_FOCUS_FIELDS
  );
  assert.ok(!("addedAt" in merged));
  assert.ok(!("updatedAt" in merged));
  assert.ok(!("lastVerifiedAt" in merged));
  assert.ok(!("sources" in merged));
});

test("valid commands objects can be added", () => {
  const merged = mergeEnrichedFields(
    ORIGINAL,
    { commands: [{ label: "Run tests", command: "npx agent-qa test" }] },
    ENRICHMENT_FOCUS_FIELDS
  );
  assert.deepEqual(merged.commands, [{ label: "Run tests", command: "npx agent-qa test" }]);
});

// ---------------------------------------------------------------------------
// End-to-end runModeratorEnrichment (offline via injected fetchers).
// ---------------------------------------------------------------------------

async function runFlow({ aiContent = null, throwLlm = false, permission = "write", tools = [] } = {}) {
  const schema = await loadSchema();
  return runModeratorEnrichment({
    body: buildBody(ORIGINAL),
    tools,
    schema,
    env: ENV,
    actorPermission: permission,
    fetchImpl: fakeEvidence(),
    llmFetchImpl: aiContent === null && !throwLlm ? undefined : fakeLlm(aiContent, { throw_: throwLlm })
  });
}

test("runModeratorEnrichment fills empty fields and returns a valid updated body", async () => {
  const result = await runFlow({
    aiContent: JSON.stringify({ bestFor: ["QA teams"], strengths: ["Self-healing actions"] })
  });
  assert.equal(result.changed, true);
  assert.equal(result.removeEnrichLabel, true);
  assert.ok(result.filledFields.includes("bestFor"));
  assert.ok(result.filledFields.includes("strengths"));
  assert.ok(result.newBody.includes("QA teams"));
  assert.ok(result.newBody.includes("Self-healing actions"));
  // Contributor content preserved in the new body.
  assert.ok(result.newBody.includes(ORIGINAL.description));
  assert.ok(result.verifiedComment.includes("ai-dekrov-verified-metadata"));
});

test("invalid AI JSON leaves the original submission unchanged", async () => {
  const result = await runFlow({ aiContent: "this is not json" });
  assert.equal(result.changed, false);
  assert.equal(result.noEnrichment, true);
  assert.equal(result.comment, buildNoEnrichmentComment());
  assert.equal(result.newBody, undefined);
});

test("invalid schema output leaves the original submission unchanged", async () => {
  // pricing "made-up-value" is not a valid enum; bestFor would be filled but
  // the invalid pricing must veto the whole merge.
  const result = await runFlow({ aiContent: JSON.stringify({ pricing: "made-up-value", bestFor: ["QA teams"] }) });
  assert.equal(result.changed, false);
  assert.equal(result.newBody, undefined);
  assert.ok(result.comment.includes("schema-invalid"));
});

test("failed AI request leaves the original submission unchanged", async () => {
  const result = await runFlow({ throwLlm: true });
  assert.equal(result.changed, false);
  assert.equal(result.noEnrichment, true);
  assert.equal(result.comment, buildNoEnrichmentComment());
  assert.equal(result.newBody, undefined);
});

test("invalid command format is rejected and the original stays unchanged", async () => {
  const result = await runFlow({ aiContent: JSON.stringify({ commands: ["test", "dashboard"] }) });
  assert.equal(result.changed, false);
  assert.equal(result.newBody, undefined);
  assert.ok(result.errors.some((error) => /command/i.test(error)));
});

test("duplicate created by enrichment keeps the original unchanged", async () => {
  const existing = [{ id: "agent-qa", name: "Agent QA", url: "https://vostride.com/agent-qa", domain: "vostride.com" }];
  const result = await runFlow({ aiContent: JSON.stringify({ bestFor: ["QA teams"] }), tools: existing });
  assert.equal(result.changed, false);
  assert.ok(result.duplicates.length >= 1);
});

// ---------------------------------------------------------------------------
// Authorization gate.
// ---------------------------------------------------------------------------

test("isTrustedActor only accepts admin/maintain/write", () => {
  assert.equal(isTrustedActor("admin"), true);
  assert.equal(isTrustedActor("maintain"), true);
  assert.equal(isTrustedActor("write"), true);
  assert.equal(isTrustedActor("triage"), false);
  assert.equal(isTrustedActor("read"), false);
  assert.equal(isTrustedActor("none"), false);
  assert.equal(isTrustedActor(""), false);
});

test("untrusted users cannot trigger AI enrichment (no provider call), read permission", async () => {
  let llmCalls = 0;
  const schema = await loadSchema();
  const result = await runModeratorEnrichment({
    body: buildBody(ORIGINAL),
    tools: [],
    schema,
    env: ENV,
    actorPermission: "read",
    fetchImpl: async () => { throw new Error("must not fetch evidence"); },
    llmFetchImpl: async () => { llmCalls += 1; return { ok: true, json: async () => ({}) }; }
  });
  assert.equal(result.unauthorized, true);
  assert.equal(result.changed, false);
  assert.equal(result.removeEnrichLabel, true);
  assert.equal(llmCalls, 0);
});

test("trusted moderators can trigger enrichment (admin/maintain/write)", async () => {
  for (const permission of ["admin", "maintain", "write"]) {
    const result = await runFlow({ permission, aiContent: JSON.stringify({ bestFor: ["QA teams"] }) });
    assert.equal(result.changed, true, `permission ${permission} should enrich`);
  }
});

test("ai-enrich action label removal is requested in every outcome", async () => {
  const ok = await runFlow({ aiContent: JSON.stringify({ bestFor: ["QA teams"] }) });
  assert.equal(ok.removeEnrichLabel, true);
  const odd = await runFlow({ permission: "read" });
  assert.equal(odd.removeEnrichLabel, true);
});

// ---------------------------------------------------------------------------
// Body section replacement.
// ---------------------------------------------------------------------------

test("Tool JSON replacement preserves Context and Confirmation (LF)", () => {
  const body = buildBody(ORIGINAL);
  const updated = replaceToolJsonSection(body, JSON.stringify({ ...ORIGINAL, bestFor: ["QA teams"] }, null, 2));
  assert.ok(updated.includes("### Submission type"));
  assert.ok(updated.includes("### Existing tool ID"));
  assert.ok(updated.includes("### Context"));
  assert.ok(updated.includes("Official project submission."));
  assert.ok(updated.includes("### Confirmation"));
  assert.ok(updated.includes("- [x] I confirm that the information is factual and the tool can be publicly listed."));
  assert.ok(updated.includes('"bestFor": ['));
  assert.ok(updated.includes("QA teams"));
});

test("Tool JSON replacement works with CRLF", () => {
  const body = buildBody(ORIGINAL).replace(/\n/g, "\r\n");
  const updated = replaceToolJsonSection(body, JSON.stringify({ ...ORIGINAL, bestFor: ["QA teams"] }, null, 2));
  assert.ok(updated.includes("\r\n"));
  assert.ok(updated.includes("### Context"));
  assert.ok(updated.includes("### Confirmation"));
  assert.ok(updated.includes("QA teams"));
});

test("Tool JSON replacement handles a section at the end of the body", () => {
  const body = "### Tool JSON\n\njohn";
  const updated = replaceToolJsonSection(body, JSON.stringify({ id: "x" }, null, 2));
  assert.ok(updated.includes('"id": "x"'));
  assert.ok(!updated.includes("john"));
});

test("Tool JSON replacement returns a body that re-parses to the new tool", () => {
  const body = buildBody(ORIGINAL);
  const next = { ...ORIGINAL, bestFor: ["QA teams"] };
  const updated = replaceToolJsonSection(body, JSON.stringify(next, null, 2));
  // The replacement body must still be a valid canonical submission: type and
  // existingToolId survive, and the JSON section holds exactly the new tool.
  const parsed = parseIssueSubmission(updated);
  assert.equal(parsed.type, "new");
  assert.equal(parsed.existingToolId, "");
  assert.deepEqual(JSON.parse(parsed.json), next);
});

// ---------------------------------------------------------------------------
// Shared core is still available to Smart Add (post-refactor).
// ---------------------------------------------------------------------------

test("enrichWithLLM still fills gaps and preserves existing fields for Smart Add", async () => {
  const candidate = { id: "cursor", name: "Cursor", category: "other", url: "https://cursor.com/", description: "contributor", bestFor: [], pricing: "" };
  const result = await enrichWithLLM({
    candidate,
    schema: {},
    evidence: "official docs",
    context: "",
    baseUrl: "https://provider.example",
    apiKey: "key",
    model: "m",
    fetchImpl: fakeLlm(JSON.stringify({ category: "coding-agents", description: "rewritten", pricing: "free", bestFor: ["Devs"] }))
  });
  assert.equal(result.description, "contributor"); // preserved
  assert.equal(result.category, "coding-agents"); // refined from "other"
  assert.deepEqual(result.bestFor, ["Devs"]); // gap filled
});

test("smart-add applyEnrichment is the shared implementation (invalid JSON keeps candidate)", () => {
  const candidate = { category: "other", description: "x" };
  assert.equal(applyEnrichment(candidate, "not json"), candidate);
});

test("success comment lists only actually-changed fields", () => {
  const comment = buildSuccessComment(["bestFor", "commands"]);
  assert.ok(comment.includes("- bestFor"));
  assert.ok(comment.includes("- commands"));
  assert.ok(!comment.includes("strengths"));
});