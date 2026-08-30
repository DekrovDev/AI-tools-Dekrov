# AI-Dekrov

**[Open the catalog →](https://ai.dekrov.com)**

AI-Dekrov is a public catalog of useful AI tools: services, coding agents, models, CLIs, desktop applications, and platforms worth knowing about.

Browse trusted links, supported platforms, pricing, install commands, and short factual descriptions without unnecessary noise.

## Explore the catalog

- Search by name, description, tag, category, platform, or model.
- Filter by price and platform: Web, Desktop, CLI, VS Code, and API.
- Save favorites and your theme preference in your own browser.
- Open a dedicated page for every tool, with its official links and commands.

## Suggest a tool

Click **Suggest a tool** on the website and choose the fastest option:

- **Smart Add** starts with an official tool URL. GitHub Actions analyzes the page (and a few official pages like pricing or docs), builds a schema-valid tool record, checks it, and prepares a moderated submission automatically.
- **Manual** is a full editor for entering the tool details yourself.
- **JSON Import** includes an AI Prompt Builder: use an external model to prepare schema-valid JSON, validate it here, then submit it for review.

Smart Add, Manual, and JSON Import all produce the same kind of submission. Submissions are checked for valid JSON, URLs, enums, IDs, and potential duplicates. A moderator reviews the result before it can become a pull request. Nothing is published automatically.

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
| `AI_MODEL` | repository variable | `z-ai/glm-5.2:free` |
| `AI_API_KEY` | repository secret | your provider API key |

Configure them at **Settings → Secrets and variables → Actions** in the repository.

**Recommended: OpenRouter.** The `z-ai/glm-5.2:free` model is genuinely free (rate-limited, ~50 requests/day), which is fine for occasional enrichment. Create an API key at [openrouter.ai/keys](https://openrouter.ai/keys).

**Alternative: Z.ai directly.** Use `https://api.z.ai/api/paas/v4` as `AI_PROVIDER_BASE_URL` and `glm-5.2` as `AI_MODEL`, with an API key from [z.ai](https://z.ai). New accounts get free starter credits, after which it is pay-as-you-go.

If any of these settings are missing, enrichment is skipped silently — the deterministic analysis and the normal validation flow still work without an AI provider.

## Project

AI-Dekrov is a static GitHub Pages project. Its public data and source code live in this repository.

Made by Dekrov — [dekrov.com](https://dekrov.com) · [GitHub](https://github.com/DekrovDev)
