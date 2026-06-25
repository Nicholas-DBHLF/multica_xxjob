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

test('findAgentByName returns the exact matching agent', async () => {
  const client = createMulticaClient({
    config: { multicaCmd: 'multica' },
    runCommand: async () => [
      { id: 'agent-1', name: '开发主力' },
      { id: 'agent-2', name: '其他智能体' },
    ],
  });

  const agent = await client.findAgentByName('\u5f00\u53d1\u4e3b\u529b');

  assert.deepEqual(agent, { id: 'agent-1', name: '\u5f00\u53d1\u4e3b\u529b' });
});

test('findProjectByTitle returns the exact matching project', async () => {
  const client = createMulticaClient({
    config: { multicaCmd: 'multica' },
    runCommand: async () => [
      { id: 'project-1', title: 'xxjob' },
      { id: 'project-2', title: 'gitcode联通流程' },
    ],
  });

  const project = await client.findProjectByTitle('gitcode联通流程');

  assert.deepEqual(project, { id: 'project-2', title: 'gitcode联通流程' });
});
