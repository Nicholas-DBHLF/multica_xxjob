# Windows Webhook Service

## Prerequisites

- Windows server with Node.js 24 installed
- `multica` CLI installed and already authenticated
- Port `8090` reachable from the public network
- Webhook secrets prepared for GitHub and GitCode

## Setup

1. Clone or pull this repository on the Windows server.
2. Copy `.env.example` to `.env.local`.
3. Fill in the runtime values:
   - `MULTICA_AGENT_NAME=开发主力`
   - `MULTICA_PROJECT_GITHUB=xxjob`
   - `MULTICA_PROJECT_GITCODE=gitcode联通流程`
   - `GITHUB_REPO_ALLOWLIST=Nicholas-DBHLF/multica_xxjob`
   - `GITCODE_REPO_ALLOWLIST=qq_42262596/multica`
   - `GITHUB_WEBHOOK_SECRET=<your secret>`
   - `GITCODE_WEBHOOK_SECRET=<your secret>`
4. Start the process:

```powershell
./scripts/start-webhook.ps1
```

## Health Check

```powershell
Invoke-WebRequest http://139.9.210.155:8090/healthz
```

Expected response body:

```json
{"ok":true}
```

## Webhook Endpoints

- GitHub: `http://139.9.210.155:8090/webhooks/github`
- GitCode: `http://139.9.210.155:8090/webhooks/gitcode`

## GitHub Configuration

- Payload URL: `http://139.9.210.155:8090/webhooks/github`
- Content type: `application/json`
- Secret: same value as `GITHUB_WEBHOOK_SECRET`
- Events: Pull requests

## GitCode Configuration

- Payload URL: `http://139.9.210.155:8090/webhooks/gitcode`
- Secret/token: same value as `GITCODE_WEBHOOK_SECRET`
- Events: Merge request or pull request related events, depending on GitCode UI wording

## Notes

- This version is HTTP-first. If you later add HTTPS termination, keep the same
  paths and forward the requests to port `8090`.
- The service only reacts to configured repositories. Unknown repositories are
  acknowledged and skipped.
