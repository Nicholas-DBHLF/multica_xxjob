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
