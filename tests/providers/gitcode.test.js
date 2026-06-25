import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  verifyGitCodeSignature,
  normalizeGitCodeEvent,
} from '../../src/providers/gitcode.js';

const openPayload = readFileSync(new URL('../fixtures/gitcode-open.json', import.meta.url));
const draftPayload = readFileSync(new URL('../fixtures/gitcode-draft.json', import.meta.url));
const mergedPayload = readFileSync(new URL('../fixtures/gitcode-merged.json', import.meta.url));

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

test('normalizeGitCodeEvent marks draft and merged states correctly', () => {
  assert.equal(normalizeGitCodeEvent(JSON.parse(draftPayload)).isDraft, true);
  assert.equal(normalizeGitCodeEvent(JSON.parse(mergedPayload)).state, 'merged');
});
