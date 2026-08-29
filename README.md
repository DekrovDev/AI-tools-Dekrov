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

## Project

AI-Dekrov is a static GitHub Pages project. Its public data and source code live in this repository.

Made by Dekrov — [dekrov.com](https://dekrov.com) · [GitHub](https://github.com/DekrovDev)
