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
    isDraft: Boolean(attrs.work_in_progress ?? attrs.draft),
    state: attrs.state === 'merged' ? 'merged' : attrs.state === 'closed' ? 'closed' : 'open',
  };
}
