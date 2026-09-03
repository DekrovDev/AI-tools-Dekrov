import assert from "node:assert/strict";
import test from "node:test";
import { parseDevQuery, createDevSearch } from "../assets/js/dev-search.js";

function resource(overrides = {}) {
  return {
    id: "sample",
    name: "Sample resource",
    category: "other",
    description: "",
    url: "https://sample.example",
    domain: "sample.example",
    tags: [],
    tech: [],
    pricing: "free",
    openSource: false,
    noSignup: false,
    copyable: false,
    ...overrides
  };
}

const resources = [
  resource({ id: "uiverse", name: "UIverse", category: "ui-components", description: "Open-source UI components and loaders", tags: ["components", "buttons", "loaders"], pricing: "free", openSource: true, noSignup: true, copyable: true, tech: ["css", "html"] }),
  resource({ id: "cssgradient", name: "CSS Gradient", category: "generators", description: "Generate beautiful CSS gradients", tags: ["gradients", "background"], pricing: "free", noSignup: true, tech: ["css"] }),
  resource({ id: "jsonformatter", name: "JSON Formatter", category: "data-json", description: "Validate, format, and inspect JSON", tags: ["json", "formatter"], pricing: "freemium", tech: ["javascript"] }),
  resource({ id: "mockapi", name: "MockAPI", category: "api-tools", description: "Create mock APIs for testing", tags: ["mock", "api"], pricing: "freemium", noSignup: false, tech: [] }),
  resource({ id: "proicons", name: "Pro Icons", category: "icons-svg", description: "Premium icon library for products", tags: ["icons", "svg"], pricing: "paid", copyable: true, tech: ["svg"] })
];

const engine = createDevSearch(resources);

test("name match ranks first and catalog is indexable", () => {
  const result = engine.search("uiverse");
  assert.ok(result.queryActive);
  assert.ok(result.items.length >= 1);
  assert.equal(result.items[0].id, "uiverse");
});

test("category word search finds icons", () => {
  const result = engine.search("icons");
  assert.ok(result.items.some((item) => item.id === "proicons"));
});

test("free facet word filters paid resources out", () => {
  const result = engine.search("free");
  assert.ok(result.queryActive);
  assert.ok(result.items.length > 0);
  assert.ok(result.items.every((item) => item.pricing === "free"));
});

test("pricing UI filter is exact", () => {
  const result = engine.search("", { pricing: "paid" });
  assert.deepEqual(result.items.map((item) => item.id), ["proicons"]);
});

test("category + copyable filters combine", () => {
  const result = engine.search("", { category: "ui-components", copyable: true });
  assert.deepEqual(result.items.map((item) => item.id), ["uiverse"]);
});

test("no-signup filter is exact", () => {
  const result = engine.search("", { noSignup: true });
  assert.ok(result.items.every((item) => item.noSignup));
  assert.ok(result.items.some((item) => item.id === "cssgradient"));
});

test("allowed ids scope results", () => {
  const result = engine.search("", { allowedIds: new Set(["mockapi", "proicons"]) });
  assert.deepEqual(result.items.map((item) => item.id), ["mockapi", "proicons"]);
});

test("favorites only scope", () => {
  const result = engine.search("", { favoritesOnly: true, favoriteIds: new Set(["uiverse"]) });
  assert.deepEqual(result.items.map((item) => item.id), ["uiverse"]);
});

test("unknown search terms return clean empty results", () => {
  const result = engine.search("zzzzz-not-a-real-term");
  assert.ok(Array.isArray(result.items));
  assert.equal(result.items.length, 0);
  assert.equal(result.phase, "strict");
});

test("tolerant fallback recovers small typos", () => {
  const result = engine.search("gradinet");
  assert.ok(result.items.some((item) => item.id === "cssgradient"));
});

test("empty catalog search returns safely", () => {
  const empty = createDevSearch([]);
  assert.deepEqual(empty.search("anything").items, []);
  assert.deepEqual(empty.search("").items, []);
});

test("parseDevQuery extracts pricing facet and cleans text", () => {
  assert.deepEqual(parseDevQuery("free icons"), { raw: "free icons", pricing: "free", text: "icons" });
  assert.deepEqual(parseDevQuery("freemium json"), { raw: "freemium json", pricing: "freemium", text: "json" });
  assert.deepEqual(parseDevQuery("loaders"), { raw: "loaders", pricing: "", text: "loaders" });
  assert.deepEqual(parseDevQuery(""), { raw: "", pricing: "", text: "" });
});
