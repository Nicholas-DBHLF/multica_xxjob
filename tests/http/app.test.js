import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createApp, createWebhookRequestHandler } from '../../src/http/app.js';

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
  const config = {
    agentName: '开发主力',
    githubProjectName: 'xxjob',
    gitcodeProjectName: 'gitcode联通流程',
    githubRepos: ['Nicholas-DBHLF/multica_xxjob'],
    gitcodeRepos: ['qq_42262596/multica'],
    githubSecret: 'github-secret',
    gitcodeSecret: 'gitcode-secret',
  };
  const multica = {
    findAgentByName: async () => ({ id: 'agent-1', name: '开发主力' }),
    findProjectByTitle: async () => ({ id: 'project-1', title: 'xxjob' }),
    findIssueByExternalKey: async () => null,
    createIssue: async () => ({ id: 'issue-1' }),
    setIssueMetadata: async () => {},
    setIssueStatus: async () => {},
  };
  const handleProviderRequest = createWebhookRequestHandler({
    config,
    multica,
    writeDescriptionFile: async () => 'tmp/issue.md',
  });
  const app = createApp({ handleProviderRequest });
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
  assert.deepEqual(await response.json(), { error: 'invalid signature' });
  server.close();
});

test('POST /webhooks/github processes a valid configured repository', async () => {
  const config = {
    agentName: '开发主力',
    githubProjectName: 'xxjob',
    gitcodeProjectName: 'gitcode联通流程',
    githubRepos: ['Nicholas-DBHLF/multica_xxjob'],
    gitcodeRepos: ['qq_42262596/multica'],
    githubSecret: 'github-secret',
    gitcodeSecret: 'gitcode-secret',
  };
  const calls = [];
  const multica = {
    findAgentByName: async () => ({ id: 'agent-1', name: '开发主力' }),
    findProjectByTitle: async (title) => ({ id: 'project-1', title }),
    findIssueByExternalKey: async () => null,
    createIssue: async (payload) => {
      calls.push(['createIssue', payload]);
      return { id: 'issue-1' };
    },
    setIssueMetadata: async (issueId, key, value) => {
      calls.push(['setIssueMetadata', issueId, key, value]);
    },
    setIssueStatus: async (issueId, status) => {
      calls.push(['setIssueStatus', issueId, status]);
    },
  };
  const handleProviderRequest = createWebhookRequestHandler({
    config,
    multica,
    writeDescriptionFile: async () => 'tmp/issue.md',
  });
  const app = createApp({ handleProviderRequest });
  const server = createServer(app);
  server.listen(0);
  await once(server, 'listening');

  const payload = readFileSync(new URL('../fixtures/github-open.json', import.meta.url));
  const signature = crypto
    .createHmac('sha256', config.githubSecret)
    .update(payload)
    .digest('hex');

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/webhooks/github`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'pull_request',
      'x-hub-signature-256': `sha256=${signature}`,
    },
    body: payload,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, action: 'created', issueId: 'issue-1' });
  assert.equal(calls[0][0], 'createIssue');
  server.close();
});
