# Contributing to AI-Dekrov

AI-Dekrov is a public catalog. Its canonical database is [`data/tools.json`](data/tools.json) in this repository. A public suggestion never writes to the catalog directly.

## Suggest a new tool

1. Open [AI-Dekrov](https://ai.dekrov.com) and click **Suggest a tool**.
2. Choose **Smart Add** and paste an official tool URL (optional context is welcome). Click **Analyze on GitHub** — the site opens the Smart Add Issue Form with the URL prefilled.
3. Review and submit the Issue. The Smart Add Action downloads the page, extracts metadata, optionally enriches it, validates the result, checks duplicates, and converts the Issue into a normal `tool-submission` with the same validation and moderation flow.
   - No GitHub tokens, APIs, or browser scraping are involved in the site itself — it stays a fully static GitHub Pages project.
4. You can also prepare the data manually: Manual or JSON Import / AI Prompt Builder, then **Copy JSON and open GitHub Issue**.

The validation Action comments on the Issue and assigns either `pending` or `needs-changes`.

## Suggest an update

1. Open the tool page in the catalog.
2. Click **Suggest an update**.
3. Edit the proposed fields and open the Issue Form from the review screen.
4. Choose `update`, enter the displayed existing tool ID, paste the JSON, and submit.

## Automatic checks

- valid JSON and the public tool schema;
- required fields and enum values;
- HTTP(S) URLs;
- lowercase kebab-case ID;
- duplicate ID, canonical URL, domain, and very similar name;
- no personal or browser-only fields;
- no generated system fields.

## Moderation labels

The required labels are defined in [`data/labels.json`](data/labels.json). The validation and Smart Add workflows create any missing labels automatically, so a fresh repository works without manual setup:

- `tool-submission`
- `pending`
- `needs-changes`
- `approved`
- `rejected`
- `duplicate`
- `insufficient-information`
- `invalid-tool`
- `dead-project`
- `spam`
- `other`

For a rejection, add `rejected` and one reason label, then leave a short explanation. Rejected Issues never change the database.

To approve a valid Issue, add the `approved` label. The approval Action creates a Pull Request with a normalized change and a field-level diff. It never merges the pull request automatically.

## Owner workflow

The repository owner can use the local importer:

```bash
npm run add-tool -- https://example.com
```

It writes directly to the canonical `data/tools.json` after terminal confirmation and adds public system fields. Review and commit that change normally.
