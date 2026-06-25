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
  if (actual.length !== expected.length) {
    return false;
  }

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
