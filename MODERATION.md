# Moderation guide

## Smart Add submissions

Smart Add Issues arrive through the `smart-add.yml` form. The Smart Add Action analyzes the tool, validates it, and rewrites the Issue into the canonical submission format below, so moderation is identical to manual submissions. Verified sources and the verification date are posted as a bot-created Issue comment (marked `ai-dekrov-verified-metadata`), not in the editable Issue body, so contributors cannot spoof them; the approval step reads that comment so verified public sources and `lastVerifiedAt` survive into the catalog record.

## States

| State | Meaning | Owner action |
| --- | --- | --- |
| `pending` | Schema validation passed and waits for review. | Verify facts and sources. |
| `needs-changes` | The validation Action found errors. | Ask the contributor to edit the Issue. |
| `approved` | Ready to create a reviewable catalog PR. | Add the label. |
| `rejected` | Will not be published. | Add one rejection-reason label and explain briefly. |
| `duplicate` | Existing record or duplicate submission. | Link the existing tool and suggest an update Issue. |

## Approval checklist

- The official URL loads and refers to a real tool.
- The description and tags are factual.
- URLs, commands, price, platforms, execution mode, signup requirement, and API-key requirement are supported by the provided official sources; uncertain environment fields stay `unknown`.
- The submission is not a duplicate.
- No untrusted verification claims or system metadata are included.

When the `approved` label is applied, GitHub Actions creates a branch and Pull Request. Review the diff, request changes if needed, and merge manually. GitHub Pages receives the updated `data/tools.json` after the merged commit is deployed.

## AI enrichment (`ai-enrich`)

For a **valid but incomplete** submission, a moderator can request AI-assisted filling of the missing optional fields:

```text
Valid but incomplete submission
→ apply ai-enrich
→ AI fills only empty verified fields
→ automatic validation runs again
→ moderator reviews
→ approved
→ PR
→ merge
```

Guidelines:

- **Optional.** Enrichment is a moderation convenience, not part of the normal flow. Skipping it never blocks a submission.
- **Moderators only.** Only repository members with `admin`, `maintain`, or `write` permission can trigger it. The action verifies the labeler's permission before any AI call; external contributors cannot consume the AI API.
- **Contributor content is preserved.** AI may fill only fields the contributor left empty (e.g. `bestFor`, `strengths`, `gettingStarted`, `usageNotes`, `favicon`, `pricing`, `priceDetails`, `commands`, `models`) and `unknown` gaps in `executionMode`, `signupRequirement`, or `apiKeyRequirement`. It never rewrites known values and never inserts generated metadata (`addedAt`, `updatedAt`, `lastVerifiedAt`, `sources`). Invalid enum strings and non-string metadata are ignored before merge.
- **Official sources only.** Only the issue's supplied `url`, `github`, and `docs` are fetched, through the existing SSRF-guarded fetcher. Fetching requires at least one reachable official source; otherwise nothing is changed.
- **AI cannot publish anything.** Enrichment only edits the Issue body. Nothing is ever published automatically. The normal validation workflow re-runs after the edit, and a moderator must still apply `approved` to create the reviewable PR.
- **Outcomes.** On success the bot posts the filled fields and keeps the contributor data; if nothing can be verified, or the AI output is invalid, the original submission is left unchanged. `ai-enrich` is an action label and is always removed after the attempt.
- Verified sources and the verification date are posted as a bot comment (marked `ai-dekrov-verified-metadata`), like Smart Add, so contributors cannot spoof them.

## Labels

Required labels are defined in [`data/labels.json`](data/labels.json) and are created automatically by the workflows; no manual label setup is needed.
