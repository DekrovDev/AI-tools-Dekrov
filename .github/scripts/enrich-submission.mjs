#!/usr/bin/env node

// Moderator-triggered AI enrichment for a canonical tool-submission Issue.
// Invoked by .github/workflows/enrich-submission.yml when the `ai-enrich`
// label is applied to an issue that already has the `tool-submission` label.
//
// Only actors with write-equivalent repository permission (admin/maintain/
// write) may trigger the AI call. The permission of the labeler is resolved
// from the GitHub API before any fetch or provider call happens, so external
// contributors can never consume the repository AI API.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runModeratorEnrichment } from "../../scripts/ai-enrichment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      args[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      args[arg.slice(2)] = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return args;
}

// Resolves the repository permission level of the actor who applied the label.
// Any failure, missing token, or missing actor resolves to "none" (untrusted)
// so the AI provider is never contacted on ambiguous authorization.
export async function resolveActorPermission({ actor, repo, token, fetchImpl = fetch }) {
  if (!actor || !repo || !token) return "none";
  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repo}/collaborators/${encodeURIComponent(actor)}/permission`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "ai-dekrov-enrich-submission"
        }
      }
    );
    if (!response.ok) return "none";
    const data = await response.json();
    return typeof data.permission === "string" ? data.permission : "none";
  } catch {
    return "none";
  }
}

export async function runEnrichmentScript({ event, tools, schema, env, actorPermission }) {
  if (!event || !event.issue) return { skip: true };
  const result = await runModeratorEnrichment({
    body: event.issue.body || "",
    tools,
    schema,
    env,
    actorPermission
  });
  return {
    ...result,
    issueNumber: event.issue.number,
    sender: (event.sender && event.sender.login) || ""
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const event = JSON.parse(await readFile(args.event, "utf8"));
  const tools = JSON.parse(await readFile(path.join(root, "data/tools.json"), "utf8"));
  const schema = JSON.parse(await readFile(path.join(root, "data/tool-schema.json"), "utf8"));
  const permission = await resolveActorPermission({
    actor: event.sender && event.sender.login,
    repo: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN
  });
  const result = await runEnrichmentScript({
    event,
    tools,
    schema,
    env: process.env,
    actorPermission: permission
  });
  await writeFile(args.output, JSON.stringify(result, null, 2));
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}