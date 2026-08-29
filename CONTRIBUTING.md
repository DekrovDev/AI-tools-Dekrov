# Contribution workflow

AI-Dekrov is a public catalog. The canonical database is [`data/tools.json`](data/tools.json) in this repository. A public submission never writes to the catalog directly.

## Suggest a new tool

1. On the website, click «Предложить инструмент».
2. Prepare the data with Quick Add, Manual, or JSON Import / AI Prompt Builder.
3. Check the preview. If the website reports a possible duplicate, prefer «Предложить изменение» on the existing entry.
4. Click «Скопировать JSON и открыть GitHub Issue».
5. Sign in to GitHub, choose `new` in the Issue Form, paste the copied JSON into `Tool JSON`, and submit.

The validation Action comments on the Issue and marks it `pending` or `needs-changes`.

## Suggest a change

1. Open the tool page in the catalog.
2. Click «Предложить изменение».
3. Edit the proposed fields and open the Issue Form from the review screen.
4. Choose `update`, copy the displayed existing tool ID, paste the JSON, and submit.

## What is checked automatically

- valid JSON and the public tool schema;
- required fields and enum values;
- HTTP(S) URLs;
- kebab-case id;
- duplicate id, canonical URL, domain, and very similar name;
- an empty `notes` field;
- absence of trusted system fields.

## Moderation labels

Create these labels in the GitHub repository before enabling public submissions:

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

For a rejection, add `rejected` plus one reason label and leave a short comment. Rejected Issues never change the database.

To approve a valid Issue, add the `approved` label. The approval Action creates a Pull Request with the normalized change and a field-level diff in its description. It never merges the PR automatically.

## Owner workflow

The repository owner can use the local importer:

```bash
npm run add-tool -- https://example.com
```

It writes directly to the canonical `data/tools.json` after terminal confirmation and sets public system fields. Review and commit that change normally.
