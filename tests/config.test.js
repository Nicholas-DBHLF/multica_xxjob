import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('loadConfig reads required env and normalizes repo allowlists', () => {
  const config = loadConfig({
    PORT: '8090',
    MULTICA_AGENT_NAME: '\u5f00\u53d1\u4e3b\u529b',
    MULTICA_PROJECT_GITHUB: 'xxjob',
    MULTICA_PROJECT_GITCODE: 'gitcode\u8054\u901a\u6d41\u7a0b',
    GITHUB_REPO_ALLOWLIST: 'Nicholas-DBHLF/multica_xxjob',
    GITCODE_REPO_ALLOWLIST: 'qq_42262596/multica',
    GITHUB_WEBHOOK_SECRET: 'github-secret',
    GITCODE_WEBHOOK_SECRET: 'gitcode-secret',
  });

  assert.equal(config.port, 8090);
  assert.equal(config.agentName, '\u5f00\u53d1\u4e3b\u529b');
  assert.deepEqual(config.githubRepos, ['Nicholas-DBHLF/multica_xxjob']);
  assert.deepEqual(config.gitcodeRepos, ['qq_42262596/multica']);
});

test('loadConfig throws when a required env var is missing', () => {
  assert.throws(
    () => loadConfig({}),
    /Missing required environment variable: MULTICA_AGENT_NAME/
  );
});
