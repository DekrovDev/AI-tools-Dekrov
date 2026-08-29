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

Search looks through names, descriptions, categories, tags, platforms, models, and notes. Use `Ctrl + K` on Windows/Linux or `Cmd + K` on macOS to focus search.

The catalog can be filtered by price and platform, then sorted by recently added, name, or category. Clear appears next to the filters whenever a search or filter is active.

## Favorites and theme

Visitors can favorite tools and switch between light and dark themes. These preferences are stored only in that visitor's browser and do not change the public catalog.

## Tool pages

Each tool has a readable hash URL such as `#/tools/tool-id`. Its detail page can show an official website, price, platforms, install and start commands, additional commands, supported models, documentation, GitHub, tags, and a domain.

## Suggesting a tool

The **Suggest a tool** dialog has three modes. It prepares a submission instead of changing the catalog directly. Closing the dialog clears unfinished data.

### Quick Add

Paste a tool URL and choose **Prepare details**. The browser safely derives what it can without reading the external page: URL, domain, a suggested favicon URL, a suggested name, and the Web platform. Review and complete the result in Manual mode.

Quick Add does not fetch third-party pages in the browser, so it remains reliable on GitHub Pages without CORS workarounds.

### Manual

Use the full editor for the name, category, price, description, URLs, platforms, tags, commands, models, GitHub, documentation, and an optional personal note.

The personal note is never included in a public submission.

### JSON Import and AI Prompt Builder

Enter a URL and optional context. The site builds a prompt from [`data/tool-schema.json`](data/tool-schema.json), so the schema does not need to be copied or maintained in multiple places.

Copy the prompt into an external AI model, paste the returned JSON back into the site, validate it, review the readable preview, and edit it if necessary. The prompt requires one valid JSON object with no Markdown or explanations, only allowed enum values, empty values for unknown facts, a kebab-case ID, and an empty `notes` value.

## Public submission and moderation

After review, the site copies the JSON and opens the official GitHub Issue Form. A GitHub account is required to submit it.

The validation Action checks JSON, schema, URLs, enum values, IDs, and possible duplicates by ID, URL, domain, and similar name. It leaves a result comment on the Issue.

Moderators use `pending`, `needs-changes`, `approved`, `rejected`, and `duplicate` states. Adding the `approved` label creates a reviewable pull request with the proposed change, but never merges it automatically.

Each tool detail page also includes **Suggest an update**, which opens an update submission bound to the existing tool ID. See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`MODERATION.md`](MODERATION.md) for the complete workflow.

## Local owner importer

For a fuller metadata analysis, the owner can run:

```bash
npm run add-tool -- https://example.com
```

The local Node.js script downloads a public page and attempts to find metadata, favicon, GitHub/docs links, platforms, commands, and relevant tags. It shows a preview, asks for category and pricing, and writes to canonical `data/tools.json` only after confirmation.

## Data storage

[`data/tools.json`](data/tools.json) is the one public catalog database. GitHub Pages publishes the same merged data to every visitor.

`localStorage` is used only for theme, favorites, UI preferences, and unfinished drafts. It never stores published tools.
