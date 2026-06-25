export function resolveProjectRoute(config, event) {
  if (event.provider === 'github' && config.githubRepos.includes(event.repoFullName)) {
    return { projectName: config.githubProjectName };
  }

  if (event.provider === 'gitcode' && config.gitcodeRepos.includes(event.repoFullName)) {
    return { projectName: config.gitcodeProjectName };
  }

  return null;
}
