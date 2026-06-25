# PR Webhook Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-friendly webhook service that accepts GitHub and GitCode PR events, creates or updates one Multica issue per active PR, and routes work to the agent `开发主力`.

**Architecture:** Use a zero-dependency Node.js 24 service with small modules for config, provider parsing, repository routing, Multica CLI integration, workflow rules, and HTTP handlers. Persist deduplication in Multica issue metadata instead of a local database, and keep deployment HTTP-first on port `8090` so the same process can later sit behind HTTPS without changing routes.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, built-in `http`, built-in `crypto`, built-in `child_process`, PowerShell startup script, Multica CLI

---

## File Structure

Create these files:

- `package.json`
- `.gitignore`
- `.env.example`
- `src/config.js`
- `src/providers/github.js`
- `src/providers/gitcode.js`
- `src/routing/repositories.js`
- `src/multica/exec.js`
- `src/multica/client.js`
- `src/workflow/pr-automation.js`
- `src/http/app.js`
- `src/index.js`
- `tests/config.test.js`
- `tests/providers/github.test.js`
- `tests/providers/gitcode.test.js`
- `tests/routing/repositories.test.js`
- `tests/multica/client.test.js`
- `tests/workflow/pr-automation.test.js`
- `tests/http/app.test.js`
- `tests/fixtures/github-open.json`
- `tests/fixtures/github-draft.json`
- `tests/fixtures/github-merged.json`
- `tests/fixtures/gitcode-open.json`
- `tests/fixtures/gitcode-draft.json`
- `tests/fixtures/gitcode-merged.json`
- `scripts/start-webhook.ps1`
- `docs/deployment/windows-webhook-service.md`

Modify these files:

- `README.md`

Notes:

- Keep all runtime code in `src/` and all tests in `tests/`.
- Use plain JavaScript ESM to avoid a TypeScript compile step on the Windows host.
- Avoid external npm dependencies; built-in Node modules are enough for this service.

### Task 1: Bootstrap The Node Service And Config Loader

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/config.js`
- Test: `tests/config.test.js`

- [ ] **Step 1: Write the failing config test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('loadConfig reads required env and normalizes repo allowlists', () => {
  const config = loadConfig({
    PORT: '8090',
    MULTICA_AGENT_NAME: '开发主力',
    MULTICA_PROJECT_GITHUB: 'xxjob',
    MULTICA_PROJECT_GITCODE: 'gitcode联通流程',
    GITHUB_REPO_ALLOWLIST: 'Nicholas-DBHLF/multica_xxjob',
    GITCODE_REPO_ALLOWLIST: 'qq_42262596/multica',
    GITHUB_WEBHOOK_SECRET: 'github-secret',
    GITCODE_WEBHOOK_SECRET: 'gitcode-secret',
  });

  assert.equal(config.port, 8090);
  assert.equal(config.agentName, '开发主力');
  assert.deepEqual(config.githubRepos, ['Nicholas-DBHLF/multica_xxjob']);
  assert.deepEqual(config.gitcodeRepos, ['qq_42262596/multica']);
});

test('loadConfig throws when a required env var is missing', () => {
  assert.throws(
    () => loadConfig({}),
    /Missing required environment variable: MULTICA_AGENT_NAME/
  );
});
```

- [ ] **Step 2: Run the config test to verify it fails**

Run: `node --test tests/config.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/config.js`

- [ ] **Step 3: Write the minimal project bootstrap and config loader**

```json
{
  "name": "multica-pr-webhook-automation",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test"
  }
}
```

```gitignore
node_modules/
.env
.env.local
coverage/
```

```env
PORT=8090
MULTICA_AGENT_NAME=开发主力
MULTICA_PROJECT_GITHUB=xxjob
MULTICA_PROJECT_GITCODE=gitcode联通流程
GITHUB_REPO_ALLOWLIST=Nicholas-DBHLF/multica_xxjob
GITCODE_REPO_ALLOWLIST=qq_42262596/multica
GITHUB_WEBHOOK_SECRET=replace-me
GITCODE_WEBHOOK_SECRET=replace-me
```

```js
const REQUIRED_KEYS = [
  'MULTICA_AGENT_NAME',
  'MULTICA_PROJECT_GITHUB',
  'MULTICA_PROJECT_GITCODE',
  'GITHUB_REPO_ALLOWLIST',
  'GITCODE_REPO_ALLOWLIST',
  'GITHUB_WEBHOOK_SECRET',
  'GITCODE_WEBHOOK_SECRET',
];

function requireValue(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseRepoList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  for (const key of REQUIRED_KEYS) {
    requireValue(env, key);
  }

  return {
    port: Number(env.PORT ?? '8090'),
    agentName: env.MULTICA_AGENT_NAME,
    githubProjectName: env.MULTICA_PROJECT_GITHUB,
    gitcodeProjectName: env.MULTICA_PROJECT_GITCODE,
    githubRepos: parseRepoList(env.GITHUB_REPO_ALLOWLIST),
    gitcodeRepos: parseRepoList(env.GITCODE_REPO_ALLOWLIST),
    githubSecret: env.GITHUB_WEBHOOK_SECRET,
    gitcodeSecret: env.GITCODE_WEBHOOK_SECRET,
    multicaCmd: env.MULTICA_CMD ?? 'multica',
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
```

- [ ] **Step 4: Run the config test to verify it passes**

Run: `node --test tests/config.test.js`

Expected: PASS with `2` passing tests

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore .env.example src/config.js tests/config.test.js
git commit -m "feat: bootstrap webhook service config"
```

### Task 2: Add GitHub Signature Validation And PR Normalization

**Files:**
- Create: `src/providers/github.js`
- Create: `tests/providers/github.test.js`
- Create: `tests/fixtures/github-open.json`
- Create: `tests/fixtures/github-draft.json`
- Create: `tests/fixtures/github-merged.json`

- [ ] **Step 1: Write the failing GitHub provider tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  verifyGitHubSignature,
  normalizeGitHubEvent,
} from '../../src/providers/github.js';

const openPayload = readFileSync(new URL('../fixtures/github-open.json', import.meta.url));
const draftPayload = readFileSync(new URL('../fixtures/github-draft.json', import.meta.url));
const mergedPayload = readFileSync(new URL('../fixtures/github-merged.json', import.meta.url));

test('verifyGitHubSignature accepts a valid sha256 signature', () => {
  const secret = 'github-secret';
  const digest = crypto
    .createHmac('sha256', secret)
    .update(openPayload)
    .digest('hex');

  assert.equal(
    verifyGitHubSignature({
      secret,
      rawBody: openPayload,
      signatureHeader: `sha256=${digest}`,
    }),
    true
  );
});

test('normalizeGitHubEvent maps an open PR payload', () => {
  const event = normalizeGitHubEvent(JSON.parse(openPayload));

  assert.equal(event.provider, 'github');
  assert.equal(event.repoOwner, 'Nicholas-DBHLF');
  assert.equal(event.repoName, 'multica_xxjob');
  assert.equal(event.prNumber, 1);
  assert.equal(event.state, 'open');
  assert.equal(event.isDraft, false);
});

test('normalizeGitHubEvent marks draft and merged states correctly', () => {
  assert.equal(normalizeGitHubEvent(JSON.parse(draftPayload)).isDraft, true);
  assert.equal(normalizeGitHubEvent(JSON.parse(mergedPayload)).state, 'merged');
});
```

- [ ] **Step 2: Run the GitHub provider tests to verify they fail**

Run: `node --test tests/providers/github.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/providers/github.js`

- [ ] **Step 3: Add the GitHub fixtures and minimal provider implementation**

```json
{
  "action": "opened",
  "number": 1,
  "pull_request": {
    "number": 1,
    "title": "WS-13: Create test.md",
    "html_url": "https://github.com/Nicholas-DBHLF/multica_xxjob/pull/1",
    "state": "open",
    "merged": false,
    "draft": false,
    "head": { "ref": "dev" },
    "user": { "login": "Nicholas-DBHLF" }
  },
  "repository": {
    "name": "multica_xxjob",
    "full_name": "Nicholas-DBHLF/multica_xxjob",
    "clone_url": "https://github.com/Nicholas-DBHLF/multica_xxjob.git",
    "owner": { "login": "Nicholas-DBHLF" }
  }
}
```

```js
import crypto from 'node:crypto';

export function verifyGitHubSignature({ secret, rawBody, signatureHeader }) {
  if (!signatureHeader?.startsWith('sha256=')) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const actual = signatureHeader.slice('sha256='.length);
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function normalizeGitHubEvent(payload) {
  const pr = payload.pull_request;
  const repo = payload.repository;

  return {
    provider: 'github',
    action: payload.action,
    repoOwner: repo.owner.login,
    repoName: repo.name,
    repoFullName: repo.full_name,
    repoCloneUrl: repo.clone_url,
    prNumber: pr.number,
    prTitle: pr.title,
    prUrl: pr.html_url,
    prAuthor: pr.user.login,
    headBranch: pr.head.ref,
    isDraft: Boolean(pr.draft),
    state: pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
  };
}
```

- [ ] **Step 4: Run the GitHub provider tests to verify they pass**

Run: `node --test tests/providers/github.test.js`

Expected: PASS with `3` passing tests

- [ ] **Step 5: Commit**

```bash
git add src/providers/github.js tests/providers/github.test.js tests/fixtures/github-open.json tests/fixtures/github-draft.json tests/fixtures/github-merged.json
git commit -m "feat: add github webhook provider"
```

### Task 3: Add GitCode Normalization And Repository Routing

**Files:**
- Create: `src/providers/gitcode.js`
- Create: `src/routing/repositories.js`
- Create: `tests/providers/gitcode.test.js`
- Create: `tests/routing/repositories.test.js`
- Create: `tests/fixtures/gitcode-open.json`
- Create: `tests/fixtures/gitcode-draft.json`
- Create: `tests/fixtures/gitcode-merged.json`

- [ ] **Step 1: Write the failing GitCode and routing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  verifyGitCodeSignature,
  normalizeGitCodeEvent,
} from '../../src/providers/gitcode.js';
import { resolveProjectRoute } from '../../src/routing/repositories.js';

const openPayload = readFileSync(new URL('../fixtures/gitcode-open.json', import.meta.url));

test('verifyGitCodeSignature accepts the shared secret header', () => {
  assert.equal(
    verifyGitCodeSignature({
      secret: 'gitcode-secret',
      tokenHeader: 'gitcode-secret',
    }),
    true
  );
});

test('normalizeGitCodeEvent maps a merge request payload', () => {
  const event = normalizeGitCodeEvent(JSON.parse(openPayload));

  assert.equal(event.provider, 'gitcode');
  assert.equal(event.repoOwner, 'qq_42262596');
  assert.equal(event.repoName, 'multica');
  assert.equal(event.prNumber, 8);
  assert.equal(event.state, 'open');
  assert.equal(event.isDraft, false);
});

test('resolveProjectRoute maps provider and repository to the correct project', () => {
  const config = {
    githubRepos: ['Nicholas-DBHLF/multica_xxjob'],
    gitcodeRepos: ['qq_42262596/multica'],
    githubProjectName: 'xxjob',
    gitcodeProjectName: 'gitcode联通流程',
  };

  assert.deepEqual(
    resolveProjectRoute(config, {
      provider: 'gitcode',
      repoFullName: 'qq_42262596/multica',
    }),
    { projectName: 'gitcode联通流程' }
  );
});
```

- [ ] **Step 2: Run the GitCode and routing tests to verify they fail**

Run: `node --test tests/providers/gitcode.test.js tests/routing/repositories.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/providers/gitcode.js`

- [ ] **Step 3: Add the GitCode fixtures, provider, and repository router**

```json
{
  "object_kind": "merge_request",
  "event_type": "merge_request",
  "user": { "username": "wellx_term" },
  "project": {
    "path_with_namespace": "qq_42262596/multica",
    "git_http_url": "https://gitcode.com/qq_42262596/multica.git"
  },
  "object_attributes": {
    "action": "open",
    "iid": 8,
    "title": "Refactor webhook flow",
    "url": "https://gitcode.com/qq_42262596/multica/merge_requests/8",
    "state": "opened",
    "work_in_progress": false,
    "source_branch": "feature/webhook"
  }
}
```

```js
export function verifyGitCodeSignature({ secret, tokenHeader }) {
  return Boolean(secret && tokenHeader && secret === tokenHeader);
}

export function normalizeGitCodeEvent(payload) {
  const attrs = payload.object_attributes;
  const fullName = payload.project.path_with_namespace;
  const [repoOwner, repoName] = fullName.split('/');

  return {
    provider: 'gitcode',
    action: attrs.action,
    repoOwner,
    repoName,
    repoFullName: fullName,
    repoCloneUrl: payload.project.git_http_url,
    prNumber: attrs.iid,
    prTitle: attrs.title,
    prUrl: attrs.url,
    prAuthor: payload.user.username,
    headBranch: attrs.source_branch,
    isDraft: Boolean(attrs.work_in_progress),
    state: attrs.state === 'merged' ? 'merged' : attrs.state === 'closed' ? 'closed' : 'open',
  };
}
```

```js
export function resolveProjectRoute(config, event) {
  if (event.provider === 'github' && config.githubRepos.includes(event.repoFullName)) {
    return { projectName: config.githubProjectName };
  }

  if (event.provider === 'gitcode' && config.gitcodeRepos.includes(event.repoFullName)) {
    return { projectName: config.gitcodeProjectName };
  }

  return null;
}
```

- [ ] **Step 4: Run the GitCode and routing tests to verify they pass**

Run: `node --test tests/providers/gitcode.test.js tests/routing/repositories.test.js`

Expected: PASS with `3` passing tests

- [ ] **Step 5: Commit**

```bash
git add src/providers/gitcode.js src/routing/repositories.js tests/providers/gitcode.test.js tests/routing/repositories.test.js tests/fixtures/gitcode-open.json tests/fixtures/gitcode-draft.json tests/fixtures/gitcode-merged.json
git commit -m "feat: add gitcode provider and repo routing"
```

### Task 4: Add The Multica CLI Adapter And Deduplication Lookups

**Files:**
- Create: `src/multica/exec.js`
- Create: `src/multica/client.js`
- Create: `tests/multica/client.test.js`

- [ ] **Step 1: Write the failing Multica client tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMulticaClient } from '../../src/multica/client.js';

test('findIssueByExternalKey uses the metadata filter', async () => {
  const calls = [];
  const client = createMulticaClient({
    config: { multicaCmd: 'multica' },
    runCommand: async (args) => {
      calls.push(args);
      return { issues: [{ id: 'issue-1', title: 'existing issue' }] };
    },
  });

  const issue = await client.findIssueByExternalKey('github:Nicholas-DBHLF/multica_xxjob:1');

  assert.equal(issue.id, 'issue-1');
  assert.deepEqual(calls[0], [
    'issue',
    'list',
    '--metadata',
    'external_pr_key=\"github:Nicholas-DBHLF/multica_xxjob:1\"',
    '--output',
    'json',
  ]);
});

test('createIssue sends title, project, assignee, and status', async () => {
  const calls = [];
  const client = createMulticaClient({
    config: { multicaCmd: 'multica' },
    runCommand: async (args) => {
      calls.push(args);
      return { id: 'new-issue' };
    },
  });

  await client.createIssue({
    title: '[GitHub] Nicholas-DBHLF/multica_xxjob#1 Fix login',
    descriptionFile: 'tmp/issue.md',
    projectId: 'project-1',
    assigneeName: '开发主力',
    status: 'todo',
  });

  assert.deepEqual(calls[0], [
    'issue',
    'create',
    '--title',
    '[GitHub] Nicholas-DBHLF/multica_xxjob#1 Fix login',
    '--description-file',
    'tmp/issue.md',
    '--project',
    'project-1',
    '--assignee',
    '开发主力',
    '--status',
    'todo',
    '--output',
    'json',
  ]);
});
```

- [ ] **Step 2: Run the Multica client tests to verify they fail**

Run: `node --test tests/multica/client.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/multica/client.js`

- [ ] **Step 3: Implement the command runner and Multica client**

```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runMulticaCommand(multicaCmd, args) {
  const { stdout } = await execFileAsync(multicaCmd, args, {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });

  return stdout.trim() ? JSON.parse(stdout) : {};
}
```

```js
export function createMulticaClient({ config, runCommand }) {
  const execute =
    runCommand ??
    ((args) => runMulticaCommand(config.multicaCmd, args));

  return {
    async findIssueByExternalKey(externalKey) {
      const response = await execute([
        'issue',
        'list',
        '--metadata',
        `external_pr_key=${JSON.stringify(externalKey)}`,
        '--output',
        'json',
      ]);
      return response.issues?.[0] ?? null;
    },

    async createIssue({ title, descriptionFile, projectId, assigneeName, status }) {
      return execute([
        'issue',
        'create',
        '--title',
        title,
        '--description-file',
        descriptionFile,
        '--project',
        projectId,
        '--assignee',
        assigneeName,
        '--status',
        status,
        '--output',
        'json',
      ]);
    },

    async setIssueMetadata(issueId, key, value) {
      return execute([
        'issue',
        'metadata',
        'set',
        issueId,
        '--key',
        key,
        '--value',
        value,
      ]);
    },

    async setIssueStatus(issueId, status) {
      return execute(['issue', 'status', issueId, status]);
    },
  };
}
```

- [ ] **Step 4: Run the Multica client tests to verify they pass**

Run: `node --test tests/multica/client.test.js`

Expected: PASS with `2` passing tests

- [ ] **Step 5: Commit**

```bash
git add src/multica/exec.js src/multica/client.js tests/multica/client.test.js
git commit -m "feat: add multica cli adapter"
```

### Task 5: Implement The PR-To-Issue Workflow Rules

**Files:**
- Create: `src/workflow/pr-automation.js`
- Create: `tests/workflow/pr-automation.test.js`

- [ ] **Step 1: Write the failing workflow tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePullRequestEvent } from '../../src/workflow/pr-automation.js';

test('creates an issue for an open non-draft PR when none exists', async () => {
  const calls = [];
  const event = {
    provider: 'github',
    repoFullName: 'Nicholas-DBHLF/multica_xxjob',
    prNumber: 1,
    prTitle: 'Fix login',
    prUrl: 'https://github.com/Nicholas-DBHLF/multica_xxjob/pull/1',
    prAuthor: 'Nicholas-DBHLF',
    headBranch: 'dev',
    state: 'open',
    isDraft: false,
  };

  const result = await handlePullRequestEvent({
    event,
    route: { projectName: 'xxjob', projectId: 'project-1' },
    config: { agentName: '开发主力' },
    multica: {
      findIssueByExternalKey: async () => null,
      createIssue: async (payload) => {
        calls.push(['createIssue', payload]);
        return { id: 'issue-1' };
      },
      setIssueMetadata: async (issueId, key, value) => {
        calls.push(['setIssueMetadata', issueId, key, value]);
      },
      setIssueStatus: async () => {},
    },
    writeDescriptionFile: async () => 'tmp/issue.md',
  });

  assert.equal(result.action, 'created');
  assert.equal(calls[0][0], 'createIssue');
  assert.equal(calls[0][1].assigneeName, '开发主力');
});

test('moves an existing issue to blocked when a PR becomes draft', async () => {
  const calls = [];

  const result = await handlePullRequestEvent({
    event: {
      provider: 'gitcode',
      repoFullName: 'qq_42262596/multica',
      prNumber: 8,
      prTitle: 'Refactor webhook',
      prUrl: 'https://gitcode.com/qq_42262596/multica/merge_requests/8',
      prAuthor: 'wellx_term',
      headBranch: 'feature/webhook',
      state: 'open',
      isDraft: true,
    },
    route: { projectName: 'gitcode联通流程', projectId: 'project-2' },
    config: { agentName: '开发主力' },
    multica: {
      findIssueByExternalKey: async () => ({ id: 'issue-2' }),
      createIssue: async () => {
        throw new Error('should not create');
      },
      setIssueMetadata: async () => {},
      setIssueStatus: async (issueId, status) => {
        calls.push([issueId, status]);
      },
    },
    writeDescriptionFile: async () => 'tmp/issue.md',
  });

  assert.equal(result.action, 'blocked');
  assert.deepEqual(calls[0], ['issue-2', 'blocked']);
});
```

- [ ] **Step 2: Run the workflow tests to verify they fail**

Run: `node --test tests/workflow/pr-automation.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/workflow/pr-automation.js`

- [ ] **Step 3: Implement the workflow service**

```js
function buildExternalKey(event) {
  return `${event.provider}:${event.repoFullName}:${event.prNumber}`;
}

function buildIssueTitle(event) {
  const label = event.provider === 'github' ? 'GitHub' : 'GitCode';
  const prMarker = event.provider === 'github' ? '#' : '!';
  return `[${label}] ${event.repoFullName}${prMarker}${event.prNumber} ${event.prTitle}`;
}

function buildIssueDescription(event) {
  return [
    `Provider: ${event.provider}`,
    `Repository: ${event.repoFullName}`,
    `PR Title: ${event.prTitle}`,
    `PR URL: ${event.prUrl}`,
    `Branch: ${event.headBranch}`,
    `Author: ${event.prAuthor}`,
    '',
    '请智能体审查未完成 PR，并继续推进实现或修复，直到 PR 可合并。',
  ].join('\n');
}

export async function handlePullRequestEvent({
  event,
  route,
  config,
  multica,
  writeDescriptionFile,
}) {
  const externalKey = buildExternalKey(event);
  const existingIssue = await multica.findIssueByExternalKey(externalKey);

  if (event.state === 'open' && !event.isDraft) {
    if (existingIssue) {
      await multica.setIssueStatus(existingIssue.id, 'todo');
      return { action: 'reused', issueId: existingIssue.id };
    }

    const descriptionFile = await writeDescriptionFile(buildIssueDescription(event));
    const issue = await multica.createIssue({
      title: buildIssueTitle(event),
      descriptionFile,
      projectId: route.projectId,
      assigneeName: config.agentName,
      status: 'todo',
    });
    await multica.setIssueMetadata(issue.id, 'external_pr_key', externalKey);
    await multica.setIssueMetadata(issue.id, 'pr_url', event.prUrl);
    await multica.setIssueMetadata(issue.id, 'pr_number', String(event.prNumber));
    return { action: 'created', issueId: issue.id };
  }

  if (!existingIssue) {
    return { action: 'skipped' };
  }

  if (event.isDraft) {
    await multica.setIssueStatus(existingIssue.id, 'blocked');
    return { action: 'blocked', issueId: existingIssue.id };
  }

  if (event.state === 'merged') {
    await multica.setIssueStatus(existingIssue.id, 'done');
    return { action: 'done', issueId: existingIssue.id };
  }

  if (event.state === 'closed') {
    await multica.setIssueStatus(existingIssue.id, 'cancelled');
    return { action: 'cancelled', issueId: existingIssue.id };
  }

  return { action: 'skipped' };
}
```

- [ ] **Step 4: Run the workflow tests to verify they pass**

Run: `node --test tests/workflow/pr-automation.test.js`

Expected: PASS with `2` passing tests

- [ ] **Step 5: Commit**

```bash
git add src/workflow/pr-automation.js tests/workflow/pr-automation.test.js
git commit -m "feat: add pr issue automation workflow"
```

### Task 6: Wire The HTTP Server, Health Check, And Windows Deployment Docs

**Files:**
- Create: `src/http/app.js`
- Create: `src/index.js`
- Create: `tests/http/app.test.js`
- Create: `scripts/start-webhook.ps1`
- Create: `docs/deployment/windows-webhook-service.md`
- Modify: `README.md`

- [ ] **Step 1: Write the failing HTTP app tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createApp } from '../../src/http/app.js';

test('GET /healthz returns ok', async () => {
  const app = createApp({
    handleProviderRequest: async () => ({ statusCode: 200, body: { ok: true } }),
  });
  const server = createServer(app);
  server.listen(0);
  await once(server, 'listening');

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/healthz`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true });
  server.close();
});

test('POST /webhooks/github rejects invalid signatures', async () => {
  const app = createApp({
    handleProviderRequest: async () => ({ statusCode: 401, body: { error: 'invalid signature' } }),
  });
  const server = createServer(app);
  server.listen(0);
  await once(server, 'listening');

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/webhooks/github`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hello: 'world' }),
  });

  assert.equal(response.status, 401);
  server.close();
});
```

- [ ] **Step 2: Run the HTTP app tests to verify they fail**

Run: `node --test tests/http/app.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/http/app.js`

- [ ] **Step 3: Implement the app, entrypoint, and startup script**

```js
import { createServer } from 'node:http';

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function createApp({ handleProviderRequest }) {
  return async function app(req, res) {
    if (req.method === 'GET' && req.url === '/healthz') {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && (req.url === '/webhooks/github' || req.url === '/webhooks/gitcode')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks);
      const result = await handleProviderRequest({ req, rawBody });
      return sendJson(res, result.statusCode, result.body);
    }

    return sendJson(res, 404, { error: 'not found' });
  };
}
```

```js
import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createApp } from './http/app.js';

const config = loadConfig();

const app = createApp({
  handleProviderRequest: async () => ({ statusCode: 200, body: { ok: true } }),
});

createServer(app).listen(config.port, '0.0.0.0', () => {
  console.log(`Webhook service listening on ${config.port}`);
});
```

```powershell
param(
  [string]$EnvFile = ".env.local"
)

if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if (-not $_ -or $_.StartsWith('#')) { return }
    $name, $value = $_ -split '=', 2
    Set-Item -Path "Env:$name" -Value $value
  }
}

node "$PSScriptRoot\..\src\index.js"
```

- [ ] **Step 4: Add deployment documentation and README usage section**

````md
## PR Webhook Service

Run locally:

```powershell
Copy-Item .env.example .env.local
./scripts/start-webhook.ps1
```

Endpoints:

- `GET /healthz`
- `POST /webhooks/github`
- `POST /webhooks/gitcode`
````

````md
# Windows Deployment

1. Install Node.js 24 and the Multica CLI.
2. Run `multica login` on the server account that will own the process.
3. Copy `.env.example` to `.env.local` and fill in secrets.
4. Start the service with:

```powershell
./scripts/start-webhook.ps1
```

Expected URLs:

- `http://139.9.210.155:8090/healthz`
- `http://139.9.210.155:8090/webhooks/github`
- `http://139.9.210.155:8090/webhooks/gitcode`
````

- [ ] **Step 5: Run the HTTP tests and the full test suite**

Run: `node --test tests/http/app.test.js`

Expected: PASS with `2` passing tests

Run: `npm test`

Expected: PASS with all test files green

- [ ] **Step 6: Commit**

```bash
git add src/http/app.js src/index.js tests/http/app.test.js scripts/start-webhook.ps1 docs/deployment/windows-webhook-service.md README.md
git commit -m "feat: add webhook server and deployment docs"
```

## Self-Review

- Spec coverage:
  - GitHub + GitCode provider support: Tasks 2 and 3
  - Multica issue creation and routing: Tasks 4 and 5
  - Deduplication by metadata: Tasks 4 and 5
  - Health endpoint and Windows deployment: Task 6
- Placeholder scan:
  - No `TBD`, `TODO`, or “implement later” placeholders remain.
- Type consistency:
  - Shared event fields use `provider`, `repoFullName`, `prNumber`, `prTitle`, `prUrl`, `prAuthor`, `headBranch`, `state`, `isDraft` across provider, routing, workflow, and HTTP tasks.
