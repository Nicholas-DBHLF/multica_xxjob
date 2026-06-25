function buildExternalKey(event) {
  return `${event.provider}:${event.repoFullName}:${event.prNumber}`;
}

function buildIssueTitle(event) {
  const label = event.provider === 'github' ? 'GitHub' : 'GitCode';
  const prMarker = event.provider === 'github' ? '#' : '!';
  return `[${label}] ${event.repoFullName}${prMarker}${event.prNumber} ${event.prTitle}`;
}

function buildIssueDescription(event) {
  return [
    `Provider: ${event.provider}`,
    `Repository: ${event.repoFullName}`,
    `PR Title: ${event.prTitle}`,
    `PR URL: ${event.prUrl}`,
    `Branch: ${event.headBranch}`,
    `Author: ${event.prAuthor}`,
    '',
    '\u8bf7\u667a\u80fd\u4f53\u5ba1\u67e5\u672a\u5b8c\u6210 PR\uff0c\u5e76\u7ee7\u7eed\u63a8\u8fdb\u5b9e\u73b0\u6216\u4fee\u590d\uff0c\u76f4\u5230 PR \u53ef\u5408\u5e76\u3002',
  ].join('\n');
}

export async function handlePullRequestEvent({
  event,
  route,
  config,
  multica,
  writeDescriptionFile,
}) {
  const externalKey = buildExternalKey(event);
  const existingIssue = await multica.findIssueByExternalKey(externalKey);

  if (event.state === 'open' && !event.isDraft) {
    if (existingIssue) {
      await multica.setIssueStatus(existingIssue.id, 'todo');
      return { action: 'reused', issueId: existingIssue.id };
    }

    const descriptionFile = await writeDescriptionFile(buildIssueDescription(event));
    const issue = await multica.createIssue({
      title: buildIssueTitle(event),
      descriptionFile,
      projectId: route.projectId,
      assigneeName: config.agentName,
      status: 'todo',
    });

    await multica.setIssueMetadata(issue.id, 'external_pr_key', externalKey);
    await multica.setIssueMetadata(issue.id, 'pr_url', event.prUrl);
    await multica.setIssueMetadata(issue.id, 'pr_number', String(event.prNumber));

    return { action: 'created', issueId: issue.id };
  }

  if (!existingIssue) {
    return { action: 'skipped' };
  }

  if (event.isDraft) {
    await multica.setIssueStatus(existingIssue.id, 'blocked');
    return { action: 'blocked', issueId: existingIssue.id };
  }

  if (event.state === 'merged') {
    await multica.setIssueStatus(existingIssue.id, 'done');
    return { action: 'done', issueId: existingIssue.id };
  }

  if (event.state === 'closed') {
    await multica.setIssueStatus(existingIssue.id, 'cancelled');
    return { action: 'cancelled', issueId: existingIssue.id };
  }

  return { action: 'skipped' };
}
