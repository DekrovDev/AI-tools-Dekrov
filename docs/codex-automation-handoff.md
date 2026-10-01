# Source repair automation handoff

This repository supplies the deterministic source checker and guarded repair
helper. A separate operator or automation system is responsible for deciding
when to start a Codex Cloud task and for transporting authenticated inputs.

## Responsibility boundary

| Repository logic | External automation/operator |
| --- | --- |
| Check declared official URLs and maintain persistent state between scheduled runs. | Detect a new actionable confirmed finding or poll for one. |
| Require independent scheduled 404/410 observations before confirmation. | Launch a manual or future Codex Cloud task for that finding. |
| Publish a structured `source-recheck-report-v2` artifact and maintain marked Issues. | Read the current Issue and obtain the report from an authenticated GitHub Actions run/artifact layer. |
| Provide `scripts/source-repair.mjs` to validate trusted-input consistency, freshness, proposal scope, live URL results, and safe writes. | Pass the Issue and trusted report/run information into the task. |
| Keep writes limited to the scoped source URL fields and derived website domain. | Codex researches official evidence, proposes the change, runs checks, creates a repair branch, and opens a PR. |

Repository flow:

```text
check → persistent state → confirmation → report → Issue
     → trusted repair validation → scoped patch
```

External flow:

```text
new confirmed finding
  → launch Codex Cloud task
  → provide current Issue + trusted report
  → Codex performs the guarded repair workflow
  → repair branch + PR
```

The manual Cloud handoff remains available. The separately authorized
[unattended resolver](source-resolver-automation.md) adds an authenticated
Actions `workflow_run` dispatcher, API-funded Codex Action research, and an
independent guarded publisher. It is disabled by default, does not invoke this
consumer Cloud environment, and does not assume
`GitHub Issue → MCP Event → Codex Cloud` works automatically. Read its capability
matrix, account boundary and staged rollout before enabling paid work.

## Trusted handoff contract

The resolver needs the current open Issue from `DekrovDev/AI-tools-Dekrov`,
including its authenticated author and repository identity, and the exact
finding from the trusted `source-recheck-report-v2` artifact. The artifact must
come from the latest completed successful `source-recheck.yml` run on the
repository's default branch and be obtained through an authenticated GitHub
Actions API or operator layer.

The operator passes the Issue JSON, the report artifact file, and the run/artifact
identity to Codex Cloud. Arbitrary JSON generated or edited by an AI is never a
trusted report. A marker, schema version, plausible run ID, report filename, or
matching finding does not prove artifact provenance. If the authenticated
origin cannot be established, the resolver must fail closed before preparation
or writes. `scripts/source-repair.mjs` validates report shape, bot-authored Issue
identity, repository identity, finding equality, confirmation evidence,
freshness, task fingerprint, proposal scope, and network results; it does not
authenticate to GitHub or attest that an input file was actually downloaded
from Actions. That provenance belongs to the authenticated handoff layer.

See [the Cloud Environment setup](codex-cloud.md) and the
[parameterized resolver task](codex-source-resolver-task.md) for the manual
workflow.

## Minimum GitHub permissions

Grant the resolver's connected account/integration access scoped to this
repository only:

- Repository contents read and contents write for the generated non-default
  repair branch only in resolver behavior. Keep the default branch protected;
  repository contents-write credentials can be broader than one branch unless
  the chosen integration or repository rules enforce the restriction.
- Issues read.
- Actions workflow run and artifact read.
- Pull requests read and write, to search for duplicates and create/update the
  repair PR.
- Optional Issues write only if it should post a blocker comment.

No admin permission is required. Do not grant permission to push to `main`,
merge, enable auto-merge, or close the maintenance Issue. Authentication and
the available scopes depend on the connected GitHub integration; the task must
verify access rather than assume a shell credential or `gh` login is present.

## Manual acceptance and unattended rollout

After merge and Cloud Environment publication, select one real finding that is
already `confirmed-broken` and `repairEligible: true`. Provide its Issue and
trusted report through the authenticated handoff, run
[the resolver task](codex-source-resolver-task.md), and manually review the
resulting PR. The manual flow has been validated with real repairs. Unattended
pickup still needs its own reviewed rollout and one paid canary; follow
[the automation rollout](source-resolver-automation.md#rollout-and-exact-account-boundary).
