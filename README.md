# AI-Dekrov

**[Open the catalog →](https://ai.dekrov.com)**

AI-Dekrov is a public catalog of useful AI tools: services, coding agents, models, CLIs, desktop applications, and platforms worth knowing about.

Browse trusted links, supported platforms, pricing, install commands, and short factual descriptions without unnecessary noise.

## Explore the catalog

- Search by name, description, tag, category, platform, or model.
- Filter by price, platform, and tool execution (Local, Cloud, or Hybrid), or show tools with a supported no-signup / no-API-key path.
- Save favorites and your theme preference in your own browser.
- Open a dedicated page for every tool, with its official links and commands.

## Suggest a tool

Click **Suggest a tool** on the website and choose the fastest option:

- **Smart Add** starts with an official tool URL. GitHub Actions analyzes the page (and a few official pages like pricing or docs), builds a schema-valid tool record, checks it, and prepares a moderated submission automatically.
- **Manual** is a full editor for entering the tool details yourself.
- **JSON Import** includes an AI Prompt Builder: use an external model to prepare schema-valid JSON, validate it here, then submit it for review.

Smart Add, Manual, and JSON Import all produce the same kind of submission. Submissions are checked for valid JSON, URLs, enums, IDs, and potential duplicates. A moderator reviews the result before it can become a pull request. Nothing is published automatically.

Tool records also carry three structured environment fields: `executionMode`, `signupRequirement`, and `apiKeyRequirement`. Execution describes where the tool product runs, not where model inference happens; a local tool may still call a remote model API. API-key requirement means a user-provided key—OAuth, account login, and subscriptions are not API keys. When official evidence is insufficient, the canonical value is `unknown`.

For a deeper local analysis, the repository owner can run `npm run add-tool -- <url>`, which downloads the page, shows a preview, and writes to `data/tools.json` only after confirmation.

You can also use the [GitHub submission form](https://github.com/DekrovDev/AI-tools-Dekrov/issues/new?template=tool-submission.yml).

## Principles

- Entries should describe real tools and use verifiable official sources.
- Unknown information stays empty rather than being invented.
- The public catalog lives in this repository and is the same for every visitor.
- Personal notes live only in the current browser and are never included in public data or submissions.

## AI provider configuration

Smart Add enrichment and the moderator `ai-enrich` flow call an OpenAI-compatible LLM provider. The provider is configured entirely through GitHub Actions variables and secrets — no code changes are needed:

| Setting | Where | Value |
| --- | --- | --- |
| `AI_PROVIDER_BASE_URL` | repository variable | `https://openrouter.ai/api/v1` |
| `AI_MODEL` | repository variable | `nvidia/nemotron-3-super-120b-a12b:free` |
| `AI_API_KEY` | repository secret | your provider API key |

Configure them at **Settings → Secrets and variables → Actions** in the repository.

**Recommended: OpenRouter.** Free models (currently `nvidia/nemotron-3-super-120b-a12b:free`) cost nothing, which is fine for occasional enrichment. Create an API key at [openrouter.ai/keys](https://openrouter.ai/keys). Other OpenRouter models (e.g. `z-ai/glm-5.2:free` or `z-ai/glm-4.7-flash`) can be used by changing `AI_MODEL`; free-tier shared pools can be rate-limited, in which case enrichment is skipped silently.

**Alternative: Z.ai directly.** Use `https://api.z.ai/api/paas/v4` as `AI_PROVIDER_BASE_URL` and `glm-5.2` as `AI_MODEL`, with an API key from [z.ai](https://z.ai). New accounts get free starter credits, after which it is pay-as-you-go.

If any of these settings are missing, enrichment is skipped silently — the deterministic analysis and the normal validation flow still work without an AI provider.

## Project

AI-Dekrov is a static GitHub Pages project. Its public data and source code live in this repository.

### Setup recipe metadata

`data/setup-recipes.json` is a versioned, optional metadata file for the future `.env Builder` and `Command Builder`. It is separate from the Tool schema: environment variables and parameterized setup recipes describe setup paths, not a tool's catalog identity.

- Store only verified variable names, descriptions, requirement semantics, generic hints, and official source URLs. Real credentials never belong in the repository.
- Existing `install`, `start`, and `commands` values in `data/tools.json` remain the primary command sources. Add a parameterized recipe only when an official command cannot be represented by those fields.
- `assets/js/setup-recipes.js` parses the metadata and builds `.env` or command text entirely client-side. It does not fetch, persist, transmit, log, or execute entered values.
- Generated commands are copyable text for the visitor to review. AI-Dekrov never runs them and does not claim universal shell safety.

Malformed or unavailable setup metadata disables only the future builders; catalog data, search, tool details, Start Here, and Use Cases remain available. Any later UI must keep entered values in ephemeral memory only—never URLs, storage, analytics, logs, or GitHub submissions.

### Client-side search

The catalog builds one in-memory [Orama](https://docs.orama.com/docs/orama-js) index from `data/tools.json` after the page loads. Search, typo tolerance, relevance ranking, and structured filters run entirely in the browser. The production page resolves the pinned `@orama/orama` 3.1.18 ESM package through the import map in `index.html`; no build step, backend, hosted search service, API key, or Node server is required.

Search-specific parsing and index behavior live in `assets/js/search-engine.js`. Node tests resolve the same exact package version from `package.json` and `package-lock.json`.

Made by Dekrov — [dekrov.com](https://dekrov.com) · [GitHub](https://github.com/DekrovDev)
