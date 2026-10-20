# Unattended official-source resolver

The implementation uses the official Codex GitHub Action for research, followed
by independent validation and a publisher. **It uses OpenAI API billing, not
ChatGPT Plus allowance. Paid execution is disabled in committed policy
(`.github/source-resolver/policy.json`, `productionEnabled: false`), regardless
of repository variables.** Nothing merges
a PR, enables auto-merge, or closes a maintenance Issue.

## Official capability evidence (checked 2026-10-01)

These are distinct products. A managed Codex harness is not itself the user's
consumer Codex Cloud environment. Official documentation was retrieved live;
no private endpoints, cookies, browser automation or consumer token replay were
used. The absence of a documented binding is reported as unknown, not proof
that a product can never support it.

| ID | Official evidence | Supported mechanism; authentication; billing; Cloud relationship |
| --- | --- | --- |
| A | [Cloud](https://learn.chatgpt.com/docs/cloud), [CLI commands](https://learn.chatgpt.com/docs/developer-commands#cli-codex-cloud), [CI account auth](https://learn.chatgpt.com/docs/auth/ci-cd-auth) | `codex cloud exec` **is** an official direct task submission command; `cloud list` supports scripting. Cloud requires ChatGPT login and uses the plan. This can target Cloud work, but the CI account-auth guide explicitly says **“Do not use this workflow for public or open-source repositories.”** No documented API-key substitute launches that consumer environment. No native documented Issue/Actions webhook binding was established. |
| B | [Codex Action](https://learn.chatgpt.com/docs/github-action), [official workflow_run example](https://learn.chatgpt.com/docs/non-interactive-mode#use-codex-exec-in-ci), [pinned Action security](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/docs/security.md) | Official `openai/codex-action@v1`; GitHub events drive a workflow, including `workflow_run`. Runs `codex exec` locally on the runner. API credential, separate API usage. Not consumer Cloud. Official pattern separates read-only generation and a write-capable PR job. |
| C | [Non-interactive CLI](https://learn.chatgpt.com/docs/non-interactive-mode), [auth](https://learn.chatgpt.com/docs/auth), [advanced private CI auth](https://learn.chatgpt.com/docs/auth/ci-cd-auth) | `codex exec`, JSON output and output schema are supported. API key is recommended for CI; account login works for local subscription use, but reusable account auth is explicitly unsuitable for public-repository CI. Enterprise Codex access tokens are for trusted/private automation, not a Plus workaround. Local runner, not Cloud. |
| D | [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [auth](https://learn.chatgpt.com/docs/auth) | TypeScript and Python programmatic local agents. Same credential/security distinction as CLI; API usage for public CI. No SDK proof of starting an existing consumer Cloud environment. More orchestration code than Action. |
| E | [Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview), [hosted sandbox](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted), [sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions), [observability](https://developers.openai.com/api/docs/guides/agents-api/observability) | Official OpenAI-managed Codex harness, durable sessions, events, streaming and webhooks. A backend/Actions client can create a session with an OpenAI-hosted sandbox; public internet access is configurable. API credentials stay outside the sandbox. Model/tool/container API charges. This is a different runtime, not the published consumer environment. |
| F | [Agents environment security](https://developers.openai.com/api/docs/guides/agents-api/environments/security), [Agents overview](https://developers.openai.com/api/docs/guides/agents-api/overview) | Self-hosted environments are supported for custom image/compute/private networking. Same managed harness and API billing, plus operator compute. Requires operating a sandbox connector; not needed here. |
| G | [Scheduled tasks](https://learn.chatgpt.com/docs/automations) | Subscription scheduled polling is official. Web/cloud tasks can run while the PC is off; desktop tasks needing local project files require the machine on and app running. Connected apps depend on plan/workspace policy. Binding a web scheduled task to this published Cloud execution environment and guaranteeing deterministic transactional publication was not established. |
| H | [Supported app events](https://learn.chatgpt.com/docs/automations#trigger-tasks-from-app-events) | Work event tasks on eligible plans: GitHub **PR activity**, filtered by PR/author/title/label, with reviews, comments, commit updates or merges. These docs do not establish Issue or Actions-run triggers. ChatGPT connected app auth and plan limits; no evidence of automatic reuse of this consumer Cloud environment. |
| I | [GitHub integration](https://learn.chatgpt.com/docs/third-party/github) | `@codex review`, automatic PR reviews and Security Review are documented. Other `@codex` **PR comments** start a legacy cloud chat with PR context. This is not documentation for arbitrary Issue comments or Actions events. A synthetic PR bridge creates a needless transaction and gives the reasoning runtime branch-write authority. |
| J | [MCP Events](https://developers.openai.com/plugins/build/mcp-events) | Official MCP 2.0 (`2026-07-28`) event subscriptions/webhook callbacks in Work web/cloud chats and dots. Not proof of starting consumer Codex Cloud. Requires an authenticated server, durable subscription storage, callback verification and delivery. Polling/streaming delivery is not supported in this integration. Account eligibility and environment binding remain separate. |
| K | [Workspace Agent triggers](https://developers.openai.com/workspace-agents/trigger-runs), [auth](https://developers.openai.com/workspace-agents/authentication) | Official `POST api.chatgpt.com/v1/workspace_agents/{id}/trigger`, idempotency keys and run-status polling. Admin must enable Workspace agents and personal access tokens; token needs Workspace Agents scope. A published workspace agent is not the existing consumer Codex environment. API currently exposes status/conversation URL, not response retrieval. These docs do not establish Plus eligibility or its billing equivalence. |
| L | [GitHub WIF](https://developers.openai.com/api/docs/guides/workload-identity-federation/github-actions), [pinned action inputs](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/action.yml) | Official OpenAI API WIF exchanges GitHub OIDC for short-lived OpenAI credentials; requires a Platform provider, service-account mapping and exact repository/ref/workflow/environment assertions. Action v1 has an API-key input, not a documented native WIF option. SDK examples establish API WIF, but do not establish refresh integration with this Action/proxy path. WIF is not implemented or claimed as a tested drop-in here. It would still use API billing. |

## Comparison matrix

“Runner” means an isolated GitHub-hosted runner. “Publisher” means the separate
guarded GitHub writer designed here; branch/PR capability in the table is not
permission granted to the AI. Every alternative would still need our report,
Issue, freshness, duplicate and scope gates; no platform supplies those for us.

| ID | Trigger / event vs polling | Existing environment / PC needed | GitHub auth / OpenAI auth / extra secret | Research / repository tools / branch / PR |
| --- | --- | --- | --- | --- |
| A | CLI submission from a scheduler/event adapter | Cloud work yes; trigger host needed, not necessarily user's PC | User connection / ChatGPT login / reusable account auth on trigger host | Yes / yes / yes / yes, as proven manually; public CI credential design blocked |
| B | Actions `workflow_run` or dispatch; event | No / no | Read-only job token + publisher token / Platform key / one key | Public HTTPS / Node CLI and tests in separate runner / publisher / publisher |
| C | Actions or other scheduler; event or polling | No / no on hosted runner | Job token / API key / one key | Configurable public HTTPS / yes / publisher / publisher |
| D | Backend or runner; event or polling | No / no on hosted runner | Scoped GitHub token / API key / one key | Runtime tools / yes / publisher / publisher |
| E | API session create; stream or webhook completion | No / no | Snapshot/read-only token outside reasoning; writer outside / API key or supported SDK WIF / credential or account setup | Configurable hosted network / upload/clone Node repo / publisher / publisher |
| F | Same session API; self-hosted environment | No / sandbox host online | Read-only repo auth + external writer / API auth / API credential + sandbox setup | Yes with host policy / yes / publisher / publisher |
| G | Schedule polling | Cloud binding unknown / no for web; yes for local project | Connected GitHub app / ChatGPT account / no API key | App tools; arbitrary repo shell/tests in selected published environment unproven / conditional / conditional |
| H | Supported PR events | No established binding / no for cloud Work | Connected app / ChatGPT account / no API key | Work tools, environment-dependent shell / conditional / conditional |
| I | PR mention/review activity; event | Legacy PR environment, not proven same new environment / no | Connected user integration / ChatGPT account / no API key | PR runtime / yes within that environment / agent can write branch / PR already exists |
| J | Custom MCP webhook; event | Work cloud chat, binding unknown / no for cloud Work | MCP server auth and app / ChatGPT account / server and callback secrets | Server tools and Work facilities / custom implementation / custom implementation / custom implementation |
| K | Workspace Agent API trigger; status polling | Different published agent / no | Configured workspace agent tools / scoped ChatGPT admin-issued token / token + eligible workspace | Agent tool-dependent / tool-dependent / tool-dependent / tool-dependent |

| ID | Isolation / injection surface | Complexity / idempotency / logs | Reliability / reason not selected |
| --- | --- | --- | --- |
| A | Native Cloud guardrails; webpage/Issue/repo injection; broad connected writer in same task | Medium adapter; must add finding transactions; Cloud list/chat history | Supported CLI, but account-auth public CI expressly forbidden; Plus has no documented alternative credential |
| B | Official proxy + drop-sudo + filesystem/network policy; untrusted proposal crossed into a fresh runner | Low-medium, GitHub native; reserved finding IDs + create-only refs; Actions logs and audit artifacts | **Primary**: explicit events, code/version pins, bounded API calls, existing guarded CLI; live paid canary still needed |
| C | Must build the proxy/credential/sandbox hygiene supplied by Action; same injection | Medium; custom coordinator/ledger; CLI JSON logs | Supported, duplicates primary's work and increases secret-handling responsibility |
| D | Local harness; SDK host must isolate credentials/tools from untrusted research | Medium; custom SDK coordinator; thread events | Supported, more application logic and dependencies than Action |
| E | API credential outside sandbox; upload trusted snapshot; no writer in sandbox; webpage/repo injection | Medium-high; session/artifact transport, cancellation, webhook verification; durable traces | **Fallback** if Action runner is unsuitable; more plumbing and container charges, no existing Cloud reuse |
| F | Operator must secure image, sandbox, private network and connector | High; durable session tracking plus host operations | Supported but unnecessary infrastructure for public official-source research |
| G | Plan/workspace approvals; connected writer may share reasoning context; polling prompt and pages | Low initial setup, higher transactional custom logic; chat/task runs | Subscription-friendly but no proven published-environment binding, strong unattended publisher or finding reservation mechanism |
| H | PR text/comments injected; connected app permissions | Low task setup, custom transaction guards still required; task logs | Supported PR events do not match the source-recheck trigger |
| I | PR/comment injection, writer in legacy cloud reasoning runtime | Artificial bridge PRs, race/dedup handling; PR/chat logs | Unsupported for arbitrary Issue/Actions triggering; violates desired direct finding-to-PR flow |
| J | Event payload and callback SSRF/replay/injection; server credentials | High: server + durable subscriptions/signatures/expiry/dedup; server and Work logs | Genuine official Events support, but wrong environment and unnecessary service |
| K | Agent tool permissions; request/agent content; external writer separation unproven | Medium; built-in trigger idempotency + custom finding ledger; run-status API | Admin/workspace prerequisite, Plus and environment compatibility unproven; cannot retrieve proposal response via current API |

## Chosen flow and trust boundaries

```text
successful scheduled source-recheck on main
  → workflow_run dispatcher (or maintainer workflow_dispatch)
  → authenticated repo/workflow/run/artifact/digest + current Issue/catalog
  → duplicate checks + persistent reservation BEFORE AI
  → up to 3 sequential reusable lanes
      → read-only research runner, isolated bounded API gate, Codex Action
      → JSON proposal/skip, never a patch or commands
      → new read-only validator runner
          → reauthenticate report/Issue/base/task
          → existing prepareRepair + source-repair dry-run/apply
          → npm test, diff check, exact scoped-byte comparison
      → new writer runner, no API key and no npm/setup/test execution
          → reauthenticate and repeat guarded live checks
          → recreate exact tested scoped bytes
          → create Git tree/commit + atomic NEW repair ref + PR to main
          → dispatch Test on that branch (no API credential)
  → human review/merge
  → existing checker alone owns Issue update/closure
```

Dispatcher establishes repository ID/name/default branch, workflow ID/path,
latest completed successful source run/event/conclusion/head repository/head
SHA, exact artifact ID/name/run/head/digest and report schema/run identity.
Archive redirects receive **no GitHub credential**, must use approved HTTPS
artifact-storage hosts and contain exactly `source-recheck.json`. Archive bytes
must match authenticated SHA-256 metadata. The Issue must be current, open,
bot-authored, repository-bound and have a unique marked payload with the exact
finding. Existing `prepareRepair` supplies confirmation/freshness/reference and
task fingerprint validation. The trusted adapter never accepts an uploaded
report from the AI.

`main` changes invalidate this automation's base entirely, even for an unrelated
edit: a new checker report must be generated before another attempt. New report
run/artifact or changed selected finding/Issue/catalog fingerprint also aborts.
The existing CLI's scope, safety checks and 48-hour limit are unchanged.

| Job | Permissions and credentials |
| --- | --- |
| Dispatcher | `contents/actions/issues/pull-requests: read`; no OpenAI key |
| Research | `contents: read`; checkout credentials not persisted. Actual API key delivered over stdin to root-owned ephemeral localhost gate. Action receives only disposable gate auth; `drop-sudo`, named read-only filesystem profile, public command network through active proxy, local/private guards, direct `api.openai.com` denied. Action is the last step. |
| Validator | GitHub read scopes; token removed from process environment before `npm ci --ignore-scripts` and `npm test`; no API secret; no AI runner files or patches reused |
| Publisher | `contents/pull-requests: write`, `issues: read`, `actions: write`; no API key; only trusted main scripts. Actions write is needed to dispatch Test because normal `GITHUB_TOKEN` pushes/PRs do not retrigger workflows. No update-ref, merge, auto-merge or Issue mutation API. |

Contents-write is repository-scoped, not technically branch-scoped. Branch
protection is therefore mandatory before paid work/publication; the code checks
`main.protected`. Keep human PR approval and normal required checks. The API key
is a restricted **Platform project service-account key**, only model requests,
only this project. A malicious main maintainer can change trusted code/workflow:
review and branch rules remain necessary, not something prompt filtering solves.

Prompt injection remains possible in official webpages, README, HTML comments,
documentation and redirects. They are evidence, never policy. Issue prose,
PR comments/bodies, commit messages and untrusted branch names are not fed to the
model. Structured finding URLs are data, not interpolated shell instructions.
The model cannot choose checkout code, credentials, trigger, publisher commands,
changed paths or task fingerprints. It can propose a false semantic assertion;
existing independent live checks establish reachability/scope, **not factual
equivalence**. Human PR review remains the factual acceptance boundary. A
homepage, login page, redirect or 200 alone does not authorize a replacement.

## Idempotency, budget and observability

One workflow-wide concurrency group serializes dispatcher through publisher;
lanes run sequentially, at most one AI job at a time. Later lanes use `always()`
so an earlier failed finding does not block unrelated findings. There are at
most **3 attempts/run and 3 attempts/rolling 24 hours**; Stage 1 selects one.
Every finding is permanently reserved on its first paid attempt, including a
failed, skipped or cancelled attempt. No automatic retry on the next 6-hour
checker tick. Open/merged/closed PRs and any existing deterministic branch also
suppress work. A rejected/closed PR requires explicit human policy to retry.

The ledger is a GitHub artifact, carried forward in every accepted dispatcher
run with a 90-day retention. Only earlier authenticated runs of this workflow
on main are considered. Jobs skipped for an ineligible trigger and never-started
cancelled pending runs are nonparticipants. Missing/expired/corrupt ledger on
the latest participating run halts; it never silently forgets or falls back.
Normal scheduled execution renews retention; after an outage over 90 days,
an operator must reconcile prior branches/PRs/attempts and restore the exact
audited ledger. Do not delete it to obtain an automatic retry. This deliberate
fail-closed behavior also applies to a failed dispatcher before ledger upload.

The ephemeral root-owned budget gate is needed because timeout/fan-out alone
does not cap model calls. It is not a deployed service, database or server.
Per finding it admits at most **8 API requests**, **80,000 UTF-8 request bytes**
each, **4,096 output tokens** per request and **250,000 reserved token units**
cumulatively. Each reservation uses input bytes + 10,000 framing units + the full
output allowance before sending; failed requests remain charged to the budget.
It fixes `gpt-6.1-sol`, `high`, standard service tier and stateless text requests.
Paid built-in tools, stored/previous-response context, multimodal input, unknown
fields and parallel requests fail closed. Research uses ordinary HTTPS commands.
The gate never follows API redirects or forwards OpenAI auth to research hosts.
Wire compatibility with the pinned CLI requires the Stage 1 paid canary; an
unsupported field fails closed rather than expanding permissions automatically.

[Current model pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol):
$2/M input, $0.10/M cached input, $2.50/M cache writes, $10/M output (checked
2026-10-01). Plus does not fund these calls. API tokenization/framing and final
billing remain provider accounting; reserved units are conservative local
request controls, not a provider-guaranteed dollar invoice cap. At these rates,
250k units valued entirely at $10/M give a conservative planning estimate of
$2.50/attempt, $7.50/day at the 3-attempt limit; recheck/network/test jobs do not
call OpenAI. Do not equate project budget alerts with a hard financial cap.
Recheck rates/prices before enabling or raising this reviewed policy.

Actions summaries and `source-resolver-dispatch-v1` record selection/skips and
provenance; `source-resolver-result-<findingId>` records the proposal/skip and
independent validation. Ledger reserves attempts before any lane. PR body
contains official evidence, source run/artifact/digest and actual validation.
API key and gate auth are never saved in these artifacts. A publish failure
after branch creation is a recorded, manually recoverable transaction, not a
reason to create a second branch.

## Rollout and exact account boundary

The PR implements code, not an enabled paid deployment. Repository variables
alone cannot turn on paid execution while committed `productionEnabled` is false. It never creates a
credential or changes account/repository security settings.

1. **Stage 0:** Merge this implementation after review. Leave
   `SOURCE_RESOLVER_API_ENABLED` unset/false. Dispatch **Resolve official sources**
   on main after a fresh successful source check on that SHA. Inspect report
   provenance, Issue equality, duplicate skips and empty AI lanes. No API secret
   is needed; no attempt is reserved and no catalog/branch/PR changes occur.
2. **Account setup:** In OpenAI Platform create/fund a dedicated project and
   restricted service-account key (model requests only). Store it as repository
   secret `SOURCE_RESOLVER_OPENAI_API_KEY`. Do **not** use ChatGPT `auth.json`.
   Protect main with human review and normal Test checks; enable **Allow GitHub
   Actions to create and approve pull requests** if repository policy currently
   disables creation. This setting allows PR creation; our code never approves.
   Confirm API charges are accepted. A separate reviewed activation PR must
   enable `productionEnabled` in policy and update the deployment-off test
   assertion; this implementation PR deliberately keeps it false. No account/admin
   settings were changed here.
3. **Stage 1:** Set `SOURCE_RESOLVER_STAGE=1`,
   `SOURCE_RESOLVER_FINDING=<one exact current, duplicate-free findingId>`, then
   `SOURCE_RESOLVER_API_ENABLED=true`. Dispatch resolver on main. It may create
   **at most one** canary PR. Check masked credentials, official content,
   API-gate counters/limits, direct HTTPS live checks, exact diff, independent
   tests, PR metadata and dispatched Test checks. Do not merge automatically.
   If no semantic replacement is proven, expect a structured skip, no patch.
4. **Stage 2:** After that review, set stage `2` (same 3/day hard attempt cap),
   remove the single-finding selection and test at most three current findings.
   Verify an individual failure does not stop other lanes and that a second
   dispatch makes no duplicate/repeated AI attempt. Review partial Issue behavior.
5. **Stage 3:** Set stage `3` only after the canary and bounded batch succeed,
   with the same committed call/byte/output/reservation and concurrency caps.
   Normal successful scheduled checker completion now drives the resolver.
   It deliberately skips manual checker completions unless the resolver itself
   is explicitly dispatched. To stop paid work, unset/false API_ENABLED.

WIF can remove the long-lived key after an exact-runtime implementation and
refresh test. Its official API support does not justify silently using an
untested token exchange in this Action path. No WIF, Workspace Agent token,
browser login, additional paid API call or live canary was attempted here.

## Validation completed before implementation PR

Existing repository tests plus deterministic resolver security tests run with
no OpenAI calls. Cases cover empty/suspect/ineligible findings, one valid task,
open/merged/closed duplicates, mismatched Issue/auth/provenance, stale SHA and
fingerprint, bounded multiple findings, independent failure, partial Issue,
injected prose/malicious proposals, fork events, serialized reservations and
budget enforcement. A live localhost mock verifies gateway credential isolation,
request limits and HTTP transport without contacting OpenAI. Actionlint validates
the workflow expressions and permissions.

A real authenticated **Stage 0 selection** was exercised against run
`36893505351`, artifact `11178716197`, digest
`sha256:086b30982db9bce80475e4643a109e7c80e2528060a7d18afc79f4855517b949`,
base `4323f240c3041a5a349207c13b3bf711f5a730b3`: two current Roo findings in
Issue #144 selected, **launch=false**. GitHub metadata/current Issues/branches/PRs
were authenticated reads. The Cloud shell's artifact storage tunnel returned
403, so the exact ZIP was downloaded through the authenticated GitHub connector
and its digest validated by the adapter. This is not a live hosted-runner/paid
end-to-end canary and does not establish that integration's production success.

Remaining enablement boundaries: implementation PR must be reviewed/merged;
a reviewed activation PR setting `productionEnabled: true` (and updating the
production-off deployment assertion) plus API project/key/billing acceptance is required; authenticated branch metadata
currently says **main is unprotected**. Production refuses this state. The first
hosted-runner API canary is intentionally left to Stage 1 after those settings.
Normal `GITHUB_TOKEN` PR-event suppression is handled by explicit Test dispatch;
no extra GitHub PAT or App secret is introduced.
