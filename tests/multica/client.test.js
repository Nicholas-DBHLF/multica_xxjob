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
    'external_pr_key="github:Nicholas-DBHLF/multica_xxjob:1"',
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
    assigneeName: '\u5f00\u53d1\u4e3b\u529b',
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
    '\u5f00\u53d1\u4e3b\u529b',
    '--status',
    'todo',
    '--output',
    'json',
  ]);
});
