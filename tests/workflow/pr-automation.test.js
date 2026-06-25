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
    config: { agentName: '\u5f00\u53d1\u4e3b\u529b' },
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
  assert.equal(calls[0][1].assigneeName, '\u5f00\u53d1\u4e3b\u529b');
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
    route: { projectName: 'gitcode\u8054\u901a\u6d41\u7a0b', projectId: 'project-2' },
    config: { agentName: '\u5f00\u53d1\u4e3b\u529b' },
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

test('moves an existing issue to done when a PR is merged', async () => {
  const calls = [];

  const result = await handlePullRequestEvent({
    event: {
      provider: 'github',
      repoFullName: 'Nicholas-DBHLF/multica_xxjob',
      prNumber: 1,
      prTitle: 'Fix login',
      prUrl: 'https://github.com/Nicholas-DBHLF/multica_xxjob/pull/1',
      prAuthor: 'Nicholas-DBHLF',
      headBranch: 'dev',
      state: 'merged',
      isDraft: false,
    },
    route: { projectName: 'xxjob', projectId: 'project-1' },
    config: { agentName: '\u5f00\u53d1\u4e3b\u529b' },
    multica: {
      findIssueByExternalKey: async () => ({ id: 'issue-3' }),
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

  assert.equal(result.action, 'done');
  assert.deepEqual(calls[0], ['issue-3', 'done']);
});

test('moves an existing issue to cancelled when a PR is closed without merge', async () => {
  const calls = [];

  const result = await handlePullRequestEvent({
    event: {
      provider: 'github',
      repoFullName: 'Nicholas-DBHLF/multica_xxjob',
      prNumber: 1,
      prTitle: 'Fix login',
      prUrl: 'https://github.com/Nicholas-DBHLF/multica_xxjob/pull/1',
      prAuthor: 'Nicholas-DBHLF',
      headBranch: 'dev',
      state: 'closed',
      isDraft: false,
    },
    route: { projectName: 'xxjob', projectId: 'project-1' },
    config: { agentName: '\u5f00\u53d1\u4e3b\u529b' },
    multica: {
      findIssueByExternalKey: async () => ({ id: 'issue-4' }),
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

  assert.equal(result.action, 'cancelled');
  assert.deepEqual(calls[0], ['issue-4', 'cancelled']);
});

test('skips when a non-open PR has no existing issue', async () => {
  const result = await handlePullRequestEvent({
    event: {
      provider: 'gitcode',
      repoFullName: 'qq_42262596/multica',
      prNumber: 8,
      prTitle: 'Refactor webhook',
      prUrl: 'https://gitcode.com/qq_42262596/multica/merge_requests/8',
      prAuthor: 'wellx_term',
      headBranch: 'feature/webhook',
      state: 'closed',
      isDraft: false,
    },
    route: { projectName: 'gitcode\u8054\u901a\u6d41\u7a0b', projectId: 'project-2' },
    config: { agentName: '\u5f00\u53d1\u4e3b\u529b' },
    multica: {
      findIssueByExternalKey: async () => null,
      createIssue: async () => {
        throw new Error('should not create');
      },
      setIssueMetadata: async () => {},
      setIssueStatus: async () => {
        throw new Error('should not update');
      },
    },
    writeDescriptionFile: async () => 'tmp/issue.md',
  });

  assert.equal(result.action, 'skipped');
});
