const REQUIRED_KEYS = [
  'MULTICA_AGENT_NAME',
  'MULTICA_PROJECT_GITHUB',
  'MULTICA_PROJECT_GITCODE',
  'GITHUB_REPO_ALLOWLIST',
  'GITCODE_REPO_ALLOWLIST',
  'GITHUB_WEBHOOK_SECRET',
  'GITCODE_WEBHOOK_SECRET',
];

function requireValue(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseRepoList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  for (const key of REQUIRED_KEYS) {
    requireValue(env, key);
  }

  return {
    port: Number(env.PORT ?? '8090'),
    agentName: env.MULTICA_AGENT_NAME,
    githubProjectName: env.MULTICA_PROJECT_GITHUB,
    gitcodeProjectName: env.MULTICA_PROJECT_GITCODE,
    githubRepos: parseRepoList(env.GITHUB_REPO_ALLOWLIST),
    gitcodeRepos: parseRepoList(env.GITCODE_REPO_ALLOWLIST),
    githubSecret: env.GITHUB_WEBHOOK_SECRET,
    gitcodeSecret: env.GITCODE_WEBHOOK_SECRET,
    multicaCmd: env.MULTICA_CMD ?? 'multica',
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
