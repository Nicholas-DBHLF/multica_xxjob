import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProjectRoute } from '../../src/routing/repositories.js';

test('resolveProjectRoute maps github repositories to the GitHub project', () => {
  const config = {
    githubRepos: ['Nicholas-DBHLF/multica_xxjob'],
    gitcodeRepos: ['qq_42262596/multica'],
    githubProjectName: 'xxjob',
    gitcodeProjectName: 'gitcode\u8054\u901a\u6d41\u7a0b',
  };

  assert.deepEqual(
    resolveProjectRoute(config, {
      provider: 'github',
      repoFullName: 'Nicholas-DBHLF/multica_xxjob',
    }),
    { projectName: 'xxjob' }
  );
});

test('resolveProjectRoute maps gitcode repositories to the GitCode project', () => {
  const config = {
    githubRepos: ['Nicholas-DBHLF/multica_xxjob'],
    gitcodeRepos: ['qq_42262596/multica'],
    githubProjectName: 'xxjob',
    gitcodeProjectName: 'gitcode\u8054\u901a\u6d41\u7a0b',
  };

  assert.deepEqual(
    resolveProjectRoute(config, {
      provider: 'gitcode',
      repoFullName: 'qq_42262596/multica',
    }),
    { projectName: 'gitcode\u8054\u901a\u6d41\u7a0b' }
  );
});
