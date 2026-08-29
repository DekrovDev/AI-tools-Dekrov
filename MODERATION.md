# Moderation guide

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
