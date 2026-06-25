# PR Webhook Issue Automation Design

## Overview

This project will add a standalone webhook service to `multica_xxjob` that listens
for GitHub and GitCode pull request events, normalizes them into a shared
workflow, and uses the `multica` CLI to create or update Multica issues assigned
to the agent `开发主力`.

The service will run as a long-lived Windows process on `139.9.210.155`,
listening on port `8090`. It will be delivered as an HTTP-first service so the
business logic can be completed now, while keeping the external HTTPS
termination flexible for a later reverse proxy or certificate step.

## Goals

- Accept webhook events from both GitHub and GitCode.
- Create exactly one Multica issue per open, non-draft PR.
- Reuse the same Multica issue for repeated webhook deliveries from the same PR.
- Route issues into the correct Multica project based on repository.
- Assign created issues to the agent `开发主力`.
- Update issue status as the PR changes state.
- Expose a simple health endpoint for deployment verification.

## Non-Goals

- Native HTTPS termination inside the process for the first version.
- A local database for event state.
- Generic repository discovery beyond the two configured repositories.
- Rich bidirectional sync back to GitHub or GitCode comments/status checks.

## Confirmed Business Rules

### Providers and repositories

- GitHub repository:
  - `https://github.com/Nicholas-DBHLF/multica_xxjob.git`
  - Multica project: `xxjob`
- GitCode repository:
  - `https://gitcode.com/qq_42262596/multica.git`
  - Multica project: `gitcode联通流程`

### Trigger rules

- Only PRs that are `open` and `draft=false` should create or keep an active
  issue.
- Draft PRs should not create a new issue.
- If a previously active PR becomes draft, its existing Multica issue should be
  moved to `blocked`.

### Status mapping

- `open` and non-draft PR -> Multica issue should exist and stay active.
- `draft` PR -> existing issue moves to `blocked`.
- `merged` PR -> issue moves to `done`.
- `closed` but not merged PR -> issue moves to `cancelled`.

### Assignment and routing

- Every created issue is assigned to the agent `开发主力`.
- GitHub repository issues go to project `xxjob`.
- GitCode repository issues go to project `gitcode联通流程`.

### Deduplication

- The service must reuse the same issue for the same PR across repeated webhook
  deliveries.
- Deduplication should be based on a durable key stored in Multica issue
  metadata, not a local database.

### Issue template

Each created issue should include:

- Provider
- Repository
- PR title
- PR URL
- Source branch
- Author
- A task instruction telling the agent to review the unfinished PR and continue
  implementation or fixes until it is mergeable

## Architecture

The service will be a small HTTP application with five focused parts:

1. `server`
   - Starts the HTTP listener.
   - Exposes `POST /webhooks/github`, `POST /webhooks/gitcode`, and
     `GET /healthz`.
2. `providers`
   - Validates provider-specific webhook signatures.
   - Parses raw webhook payloads into a shared internal event model.
3. `router`
   - Maps provider/repository combinations to Multica project names.
   - Rejects unknown repositories with a safe no-op response.
4. `multica client`
   - Wraps `multica` CLI calls for agent lookup, project lookup, issue search,
     issue creation, metadata updates, status updates, and comments.
5. `workflow`
   - Implements the PR-to-issue lifecycle rules.
   - Decides whether to create, reuse, block, cancel, or complete an issue.

This decomposition keeps provider parsing separate from business rules and keeps
CLI integration separate from webhook handling.

## Internal Event Model

Both GitHub and GitCode payloads should normalize into one in-memory structure:

- `provider`: `github` or `gitcode`
- `repo_owner`
- `repo_name`
- `repo_clone_url`
- `pr_number`
- `pr_title`
- `pr_url`
- `pr_author`
- `head_branch`
- `action`
- `state`: `open`, `closed`, or `merged`
- `is_draft`: boolean

This model lets the workflow layer avoid branching on provider-specific JSON
shapes.

## Request Handling Flow

1. Receive webhook request.
2. Validate provider-specific signature using a configured secret.
3. Parse payload and normalize it into the shared PR event model.
4. Resolve the repository route:
   - GitHub `Nicholas-DBHLF/multica_xxjob` -> project `xxjob`
   - GitCode `qq_42262596/multica` -> project `gitcode联通流程`
5. Build a durable external key:
   - `github:Nicholas-DBHLF/multica_xxjob:PR_NUMBER`
   - `gitcode:qq_42262596/multica:PR_NUMBER`
6. Query Multica for an existing issue carrying that metadata key.
7. Apply lifecycle rules:
   - open non-draft with no issue -> create issue
   - open non-draft with issue -> keep active, optionally refresh metadata and
     add a state comment when meaningful
   - draft with issue -> move to `blocked`
   - merged with issue -> move to `done`
   - closed unmerged with issue -> move to `cancelled`
8. Return a 2xx response once the workflow finishes successfully.

Unknown repositories should not create issues. They should return success with a
logged skip so providers do not keep retrying on an intentional ignore.

## Multica Integration Design

The service will operate through the installed `multica` CLI on the Windows
server. The process assumes `multica` is already authenticated.

### Lookups

- Resolve the target agent ID from the name `开发主力` at startup or first use.
- Resolve the project IDs for `xxjob` and `gitcode联通流程`.

### Issue creation

When a new active PR is detected, the service creates a Multica issue with:

- A title such as:
  - `[GitHub] Nicholas-DBHLF/multica_xxjob#12 Fix login`
  - `[GitCode] qq_42262596/multica!34 Refactor job runner`
- Description body containing the provider, repository, PR URL, branch, author,
  and execution instruction
- Project assignment
- Assignee `开发主力`
- Status `todo`

### Metadata

Each created issue should store at least:

- `external_pr_key`
- `pr_url`
- `pr_number`
- `provider`
- `repo_name`
- `repo_owner`

The `external_pr_key` will be the authoritative deduplication key.

### Comments

Issue comments are optional for the first version. They should be used only for
meaningful lifecycle changes, such as:

- PR moved back to draft
- PR merged
- PR closed without merge

## Configuration

The service should be configurable only through environment variables for the
first version.

Required variables:

- `PORT=8090`
- `MULTICA_AGENT_NAME=开发主力`
- `MULTICA_PROJECT_GITHUB=xxjob`
- `MULTICA_PROJECT_GITCODE=gitcode联通流程`
- `GITHUB_REPO_ALLOWLIST=Nicholas-DBHLF/multica_xxjob`
- `GITCODE_REPO_ALLOWLIST=qq_42262596/multica`
- `GITHUB_WEBHOOK_SECRET=<secret>`
- `GITCODE_WEBHOOK_SECRET=<secret>`

Optional variables:

- `LOG_LEVEL=info`
- `MULTICA_CMD=multica`

## Error Handling

The service should fail closed on invalid signatures and malformed payloads.

Rules:

- Invalid signature -> `401`
- Unsupported repository -> `200` with skip result in logs
- Unsupported event type -> `200` with skip result in logs
- Missing Multica agent/project mapping -> `500`
- Multica CLI failure -> `500`

To avoid accidental duplicate issue creation during provider retries, the create
path should always query for an existing `external_pr_key` before issuing
`multica issue create`.

## Observability

The first version should keep observability simple:

- Structured logs to stdout/stderr
- One request-scoped correlation ID per webhook request
- `GET /healthz` returning a simple OK payload

Logs should include:

- provider
- repository
- PR number
- normalized state
- action result: created, reused, blocked, done, cancelled, skipped, failed

Webhook secrets must never be logged.

## Testing Strategy

The implementation should follow TDD.

Tests should cover:

- GitHub signature validation
- GitCode signature validation
- GitHub payload normalization
- GitCode payload normalization
- Repository routing
- Deduplication key generation
- Workflow transitions:
  - create on open non-draft
  - skip creation on draft without existing issue
  - block on draft with existing issue
  - done on merged
  - cancelled on closed unmerged
- Multica CLI wrapper behavior with mocked command execution
- HTTP handlers returning expected status codes

Provider fixtures should be stored as local JSON test data so the parser logic
is stable and reviewable.

## Deployment Shape

The repository should include:

- the service source code
- a sample environment file
- a Windows startup script
- a short deployment guide for running the process on port `8090`

The first delivered endpoint set will be:

- `http://139.9.210.155:8090/webhooks/github`
- `http://139.9.210.155:8090/webhooks/gitcode`
- `http://139.9.210.155:8090/healthz`

If an HTTPS reverse proxy or certificate is added later, the route paths and
handler behavior should stay unchanged.

## Open Risks and Assumptions

- The Windows server will have `multica` installed and authenticated before the
  service starts.
- GitCode webhook headers and payload fields may differ from GitHub and must be
  validated against real test deliveries or official examples during
  implementation.
- Without a certificate or reverse proxy, the first delivery is HTTP-first.
  Whether GitHub or GitCode accept the final configured webhook URL depends on
  their current webhook URL policies.

## Acceptance Criteria

- A GitHub non-draft open PR in `Nicholas-DBHLF/multica_xxjob` creates exactly
  one issue in `xxjob` assigned to `开发主力`.
- A GitCode non-draft open PR in `qq_42262596/multica` creates exactly one issue
  in `gitcode联通流程` assigned to `开发主力`.
- Re-sending the same webhook does not create a second issue.
- Drafting an already-linked PR moves its issue to `blocked`.
- Merging an already-linked PR moves its issue to `done`.
- Closing an already-linked unmerged PR moves its issue to `cancelled`.
- Unknown repositories do not create issues.
- `GET /healthz` returns success.
