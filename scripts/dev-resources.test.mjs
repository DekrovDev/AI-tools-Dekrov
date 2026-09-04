import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEV_CATEGORIES, DEV_PRICING_VALUES, devCategoryMeta, filterDevResources, isValidDevResourceId, normalizeDevResource, parseDevResources, sortDevResources, validateDevResourcesData } from "../assets/js/dev-resources.js";
import { buildDevResourceCandidate, buildDevResourcePrompt, findDevResourceDuplicates, validateDevResourceSubmission } from "../assets/js/dev-resource-submission.js";

function validResource(overrides = {}) {
  return {
    id: "css-tricks",
    name: "CSS Tricks",
    category: "css",
    description: "Ready-made CSS effects and recipes",
    url: "https://css-tricks.com/",
    tags: ["css", "hover"],
    tech: ["css"],
    pricing: "free",
    ...overrides
  };
}

test("taxonomy has stable kebab ids and display labels", () => {
  assert.ok(DEV_CATEGORIES.length >= 10);
  for (const category of DEV_CATEGORIES) {
    assert.ok(isValidDevResourceId(category.id), `bad category id: ${category.id}`);
    assert.ok(category.label.length > 0);
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(category.color), `bad color for ${category.id}`);
  }
  assert.ok(devCategoryMeta("css").label === "CSS & styling");
  assert.ok(devCategoryMeta("not-real").label === "Other");
});

test("pricing enum is a closed set", () => {
  assert.deepEqual(DEV_PRICING_VALUES, ["free", "freemium", "paid"]);
});

test("normalizeDevResource fills derived fields and trims input", () => {
  const resource = normalizeDevResource(validResource({ favicon: "https://example.com/icon.png", openSource: true, noSignup: true }));
  assert.equal(resource.id, "css-tricks");
  assert.equal(resource.domain, "css-tricks.com");
  assert.equal(resource.favicon, "https://example.com/icon.png");
  assert.equal(resource.openSource, true);
  assert.equal(resource.noSignup, true);
  assert.equal(resource.copyable, false);
  assert.equal(resource.pricing, "free");
});

test("normalizeDevResource rejects invalid records conservatively", () => {
  assert.equal(normalizeDevResource(null), null);
  assert.equal(normalizeDevResource("nope"), null);
  assert.equal(normalizeDevResource(validResource({ id: "Bad ID" })), null);
  assert.equal(normalizeDevResource(validResource({ id: "" })), null);
  assert.equal(normalizeDevResource(validResource({ category: "not-a-category" })), null);
  assert.equal(normalizeDevResource(validResource({ url: "ftp://example.com" })), null);
  assert.equal(normalizeDevResource(validResource({ pricing: "expensive" })), null);
  assert.equal(normalizeDevResource(validResource({ tags: ["a", 1, null] })).tags.join(","), "a");
});

test("parseDevResources never throws and dedupes ids preserving order", () => {
  const raw = [validResource({ id: "a" }), validResource({ id: "a" }), validResource({ id: "b" }), { broken: true }];
  const parsed = parseDevResources(raw);
  assert.deepEqual(parsed.map((item) => item.id), ["a", "b"]);
  assert.deepEqual(parseDevResources('{"not":"an array"}'), []);
  assert.deepEqual(parseDevResources("{bad json"), []);
  assert.deepEqual(parseDevResources(null), []);
});

test("parseDevResources accepts a wrapper object with a resources array", () => {
  const parsed = parseDevResources({ version: 1, resources: [validResource({ id: "x" })] });
  assert.deepEqual(parsed.map((item) => item.id), ["x"]);
});

test("filterDevResources applies each structured facet", () => {
  const list = [
    validResource({ id: "one", category: "css", pricing: "free", openSource: true, noSignup: true, copyable: true }),
    validResource({ id: "two", category: "css", pricing: "free", openSource: false, noSignup: false, copyable: false }),
    validResource({ id: "three", category: "icons-svg", pricing: "paid", openSource: true, noSignup: true })
  ];
  assert.deepEqual(filterDevResources(list, { category: "css" }).map((item) => item.id), ["one", "two"]);
  assert.deepEqual(filterDevResources(list, { pricing: "free" }).map((item) => item.id), ["one", "two"]);
  assert.deepEqual(filterDevResources(list, { openSource: true }).map((item) => item.id), ["one", "three"]);
  assert.deepEqual(filterDevResources(list, { noSignup: true }).map((item) => item.id), ["one", "three"]);
  assert.deepEqual(filterDevResources(list, { copyable: true }).map((item) => item.id), ["one"]);
  assert.deepEqual(filterDevResources(list, { openSource: true, noSignup: true }).map((item) => item.id), ["one", "three"]);
  assert.deepEqual(filterDevResources(list, { allowedIds: new Set(["two", "three"]) }).map((item) => item.id), ["two", "three"]);
  assert.deepEqual(filterDevResources(list, { favoritesOnly: true, favoriteIds: new Set(["three"]) }).map((item) => item.id), ["three"]);
});

test("sortDevResources supports recent, name, and category order", () => {
  const list = [
    validResource({ id: "bb", name: "Beta", addedAt: "2026-01-01", category: "icons-svg" }),
    validResource({ id: "aa", name: "Alpha", addedAt: "2026-03-01", category: "css" })
  ];
  assert.deepEqual(sortDevResources(list, "recent").map((item) => item.id), ["aa", "bb"]);
  assert.deepEqual(sortDevResources(list, "name").map((item) => item.id), ["aa", "bb"]);
  assert.deepEqual(sortDevResources(list, "category").map((item) => item.id), ["aa", "bb"]);
});

test("the real data file is valid and keeps the intentional empty scaffold", async () => {
  const raw = await readFile(new URL("../data/dev-resources.json", import.meta.url), "utf8");
  const source = JSON.parse(raw);
  assert.deepEqual(validateDevResourcesData(source), []);
  const parsed = parseDevResources(raw);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 0, "starter catalog is intentionally empty; entries are added manually");
});

test("maintainer validation reports actionable malformed-resource fields", () => {
  const errors = validateDevResourcesData({ resources: [
    validResource({ id: "Bad ID", category: "unknown", url: "ftp://bad", description: 7, favicon: "ftp://bad", pricing: "nope", openSource: "yes", tags: ["ok", 1], tech: "css", addedAt: "2026-02-30" }),
    validResource({ id: "Bad ID", name: "", url: "" })
  ] });
  assert.ok(errors.some((error) => error.includes("resource 0 (Bad ID): id")));
  assert.ok(errors.some((error) => error.includes("resource 0 (Bad ID): category")));
  assert.ok(errors.some((error) => error.includes("resource 0 (Bad ID): url")));
  assert.ok(errors.some((error) => error.includes("resource 0 (Bad ID): description")));
  assert.ok(errors.some((error) => error.includes("resource 0 (Bad ID): favicon")));
  assert.ok(errors.some((error) => error.includes("resource 0 (Bad ID): openSource")));
  assert.ok(errors.some((error) => error.includes("resource 1 (Bad ID): name is required")));
  assert.ok(errors.some((error) => error.includes("resource 1 (Bad ID): id duplicates")));
});

test("Dev Resource submission normalizes a manual candidate and rejects unsupported fields", () => {
  const candidate = buildDevResourceCandidate({ name: "CSS Tricks", category: "css", url: "https://css-tricks.com/?ref=home#intro", tags: ["css"], tech: ["CSS"], pricing: "free" });
  const checked = validateDevResourceSubmission(candidate);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.resource.url, "https://css-tricks.com/");
  assert.equal(Object.hasOwn(checked.resource, "addedAt"), false);
  assert.ok(validateDevResourceSubmission({ ...candidate, domain: "should-not-be-submitted" }).errors.some((error) => error.includes("Unsupported field")));
});

test("Dev Resource duplicates warn on id, canonical URL, and matching domain", () => {
  const candidate = buildDevResourceCandidate({ name: "CSS Tricks", category: "css", url: "https://css-tricks.com/guides" });
  const duplicates = findDevResourceDuplicates(candidate, [validResource({ url: "https://css-tricks.com/", domain: "css-tricks.com" })]);
  assert.ok(duplicates[0].reasons.includes("same domain"));
  assert.ok(findDevResourceDuplicates(candidate, [validResource({ id: "other", name: "Other", url: "https://other.example/" })]).length === 0);
});

test("Dev Resource AI prompt is resource-specific and keeps unknown facts empty", () => {
  const prompt = buildDevResourcePrompt("https://example.com", "A component library");
  assert.ok(prompt.includes("OFFICIAL WEBSITE:\nhttps://example.com"));
  assert.ok(prompt.includes("OPTIONAL CONTEXT:\nA component library"));
  assert.ok(prompt.includes("AI CLASSIFICATION RULE"));
  assert.ok(prompt.includes("Use:\n- \"\" for unknown strings"));
  assert.ok(prompt.includes("ui-components"));
  assert.ok(prompt.includes("Do NOT include:\n- domain\n- addedAt"));
  assert.ok(!prompt.includes("\"platforms\""));
});
