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
- URLs, commands, price and platforms are supported by the provided sources.
- The submission is not a duplicate.
- No untrusted verification claims or system metadata are included.

When the `approved` label is applied, GitHub Actions creates a branch and Pull Request. Review the diff, request changes if needed, and merge manually. GitHub Pages receives the updated `data/tools.json` after the merged commit is deployed.

Required labels are defined in [`data/labels.json`](data/labels.json) and are created automatically by the workflows; no manual label setup is needed.
