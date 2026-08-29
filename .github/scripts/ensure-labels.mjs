#!/usr/bin/env node

// Ensures the project's required labels exist in the repository. Called by
// workflows before they set labels, so nothing breaks when a fresh repo does
// not have them yet. Uses the GITHUB_TOKEN from Actions (needs issues: write).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const labels = JSON.parse(await readFile(path.join(root, "data/labels.json"), "utf8"));

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!repo || !token) {
  console.error("GITHUB_REPOSITORY and GITHUB_TOKEN must be set.");
  process.exit(1);
}

const base = `https://api.github.com/repos/${repo}/labels`;
const headers = {
  Authorization: `token ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "ai-dekrov-ensure-labels"
};

async function listExisting() {
  const response = await fetch(base, { headers });
  if (!response.ok) {
    console.warn(`Could not list labels (${response.status}). Skipping label ensure.`);
    return new Set();
  }
  const data = await response.json();
  return new Set(data.map((label) => label.name));
}

async function createLabel(label) {
  const response = await fetch(base, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name: label.name, color: label.color, description: label.description || "" })
  });
  if (!response.ok && response.status !== 422) {
    console.warn(`Could not create label "${label.name}" (${response.status}).`);
  }
}

const existing = await listExisting();
let created = 0;
for (const label of labels) {
  if (existing.has(label.name)) continue;
  await createLabel(label);
  created += 1;
}
console.log(`ensure-labels: ${labels.length} total, ${created} created, ${labels.length - created} already present.`);