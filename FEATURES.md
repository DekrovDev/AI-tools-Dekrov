# AI-Dekrov feature guide

AI-Dekrov is a static, public AI tools catalog. Its purpose is to make useful tools easy to discover, compare, and return to.

## Catalog and navigation

The main screen lists every published tool. Each card includes a name, category, description, tags, price, a detail link, and a favorite button.

Tools are grouped into these categories:

- Coding agents
- Orchestration
- Chat / LLM
- Research
- Audio
- Dev tools
- Hosting / Infrastructure
- Other

Categories appear in the navigation only when they contain at least one published tool.

## Search, filters, and sorting

Search looks through names, descriptions, categories, tags, platforms, models, and personal notes stored in the current browser. Use `Ctrl + K` on Windows/Linux or `Cmd + K` on macOS to focus search.

The catalog can be filtered by price, platform, and tool execution (Local, Cloud, or Hybrid), then sorted by recently added, name, or category. **No signup** matches only tools marked `not-required` or `optional`; **No API key** uses the same exact rule. `unknown`, `required`, and `depends` never match those convenience filters. All filters combine with AND semantics and remain active inside Use Cases, My Stack, and Collections. Price uses the factual options Free, Freemium, Paid, and Usage-based, with optional details such as `$20/month` or `Pay per token`. Clear appears next to the filters whenever a search or filter is active.

When a normal global catalog search has no match, AI-Dekrov offers a shortcut to the existing **Suggest a tool** dialog. Name queries prefill Manual mode; official URL queries prefill Smart Add. Nothing is submitted automatically.

## Favorites and theme

Visitors can favorite tools, keep personal notes, and switch between light and dark themes. These preferences are stored only in that visitor's browser and do not change the public catalog.

## Tool pages

Each tool has a readable hash URL such as `#/tools/tool-id`. Its detail page can show an official website, price and price details, platforms, execution mode, signup/API-key requirements, install and start commands, additional commands, supported models, documentation, GitHub, tags, a domain, public dates, and source links. Unknown environment values are omitted from the detail summary. The browser title and description update for the active category, Favorites, and each tool page.

## Suggesting a tool

The **Suggest a tool** dialog has three modes. It prepares a submission instead of changing the catalog directly. Closing the dialog clears unfinished data.

### Smart Add

The default mode. Paste an official tool URL and optionally add context, then click **Analyze on GitHub**. The site opens the Smart Add Issue Form with the URL (and context) prefilled; it never fetches the target page in the browser and needs no CORS proxy or GitHub token.

Once the Issue is submitted, the Smart Add Action runs on GitHub:

1. safely downloads the homepage (and up to three obviously useful official pages such as pricing, docs, or getting started);
2. extracts name, description, canonical URL, domain, favicon, platforms, category, pricing, tags, commands, models, GitHub, and docs, while conservatively defaulting execution/signup/API-key metadata to `unknown` — using the schema as the single source of truth for allowed values;
3. optionally enriches the candidate with an external LLM for trusted contributors only (disabled by default, never required);
4. validates the result with the same validation logic as any submission and checks duplicates;
5. leaves a **Smart Add analysis** comment, then converts the Issue into the canonical `tool-submission` format with `tool-submission` + `pending` (or `needs-changes`) labels.

The converted Issue behaves exactly like a manual submission: moderators review it, and the `approved` label creates the usual pull request. Nothing is published automatically.

### Manual

Use the full editor for the name, category, price, specific price details, description, URLs, platforms, execution mode, signup/API-key requirements, tags, commands, models, GitHub, and documentation. Website is required because every public tool needs an official public URL.

### JSON Import and AI Prompt Builder

Enter a URL and optional context. The site builds a prompt from [`data/tool-schema.json`](data/tool-schema.json), so the schema does not need to be copied or maintained in multiple places.

Copy the prompt into an external AI model, paste the returned JSON back into the site, validate it, review the readable preview, and edit it if necessary. The prompt requires one valid JSON object with no Markdown or explanations, only allowed enum values, and a kebab-case ID. It explicitly requires `executionMode`, `signupRequirement`, and `apiKeyRequirement`; uncertain values for those fields must be `unknown`.

## Public submission and moderation

After review, the site copies the JSON and opens the official GitHub Issue Form. A GitHub account is required to submit it.

The validation Action checks JSON, schema, URLs, enum values, IDs, and possible duplicates by ID, URL, domain, and similar name. It leaves a result comment on the Issue.

Moderators use `pending`, `needs-changes`, `approved`, `rejected`, and `duplicate` states. Adding the `approved` label creates a reviewable pull request with the proposed change, but never merges it automatically.

Each tool detail page also includes **Suggest an update**, which opens an update submission bound to the existing tool ID. See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`MODERATION.md`](MODERATION.md) for the complete workflow.

## Automatic official-source re-check

A maintainer-only GitHub Action runs weekly and may be dispatched manually for an exact tool ID. It checks only repository-declared official URLs: tool sources, website, docs, GitHub, and setup metadata sources. Requests are GETs with a small range header, bounded timeout/concurrency, public-host DNS checks, and manually validated redirects. No browser state, user-entered `.env` values, command-builder values, or credentials are involved.

The Action creates or updates one open maintenance Issue per affected tool only for stale/missing/invalid verification dates, confirmed 404/410 links, or unsafe declared destinations. Restricted and transient responses remain summary-only. A successful request is not factual verification and never updates `lastVerifiedAt`, catalog records, setup metadata, or public UI.

## Local owner importer

For a fuller metadata analysis, the owner can run:

```bash
npm run add-tool -- https://example.com
```

The local Node.js script downloads a public page and attempts to find metadata, favicon, GitHub/docs links, platforms, commands, and relevant tags. It shows a preview, asks for category and pricing, and writes to canonical `data/tools.json` only after confirmation. It shares the same analysis core (`scripts/analyzer.mjs`) as the Smart Add Action.

## Data storage

[`data/tools.json`](data/tools.json) is the one public catalog database. GitHub Pages publishes the same merged data to every visitor.

`localStorage` is used only for theme, favorites, personal notes, UI preferences, and unfinished drafts. It never stores published tools.

## Dev Resources catalog

AI-Dekrov ships a second catalog alongside AI Tools. The **Dev Resources** switcher at the top of the catalog opens developer resources: websites that provide a concrete resource, generator, reusable component, or tool for programming and web development (UI components, templates, CSS effects, animations and loaders, icons and SVG libraries, color/font tools, generators, code snippets, mock API and testing tools, JSON utilities, and small developer utilities).

The catalog experience mirrors AI Tools:

- Categories in the sidebar and as filter chips; search covers names, descriptions, tags, technologies, and categories.
- Filters for price, **Open source**, **No signup**, and **Copy code**, plus sorting and dedicated resource pages with a Back action.
- Every resource can be favorited and saved to My Stack or a Collection; saved items live in the same browser storage as AI Tools but are typed with a `dev:` prefix so AI tool IDs and dev resource IDs can never collide.
- **Saved** scope chips (All resources / Favorites / My Stack) show dev-scoped views of your saved items.

Resources live in [`data/dev-resources.json`](data/dev-resources.json) and are validated by the shared pure parser (`assets/js/dev-resources.js`) — add one structured entry and it appears without touching UI code. Dev Resources is intentionally separate from AI Tools: use the AI Tools catalog for AI products, and Dev Resources for developer sites, even when a site has optional AI-assisted features.

The starter catalog is intentionally empty; entries are added with the same quality bar as AI tools (a real, useful resource with a verifiable official URL). In Dev Resources, the context-aware **Add a resource** dialog offers Smart Add, Manual, and JSON Import. Each produces the same strict `dev-resource` payload in a distinct `dev-resource-submission` Issue for validation and moderator review; only an approved Dev Resource submission can create a PR that changes `data/dev-resources.json`. Public payloads never set `addedAt`; approval assigns it when preparing the catalog change.
