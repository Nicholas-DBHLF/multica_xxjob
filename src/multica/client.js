import { runMulticaCommand } from './exec.js';

export function createMulticaClient({ config, runCommand }) {
  const execute =
    runCommand ??
    ((args) => runMulticaCommand(config.multicaCmd, args));

  return {
    async findAgentByName(name) {
      const agents = await execute(['agent', 'list', '--output', 'json']);
      return agents.find((agent) => agent.name === name) ?? null;
    },

    async findProjectByTitle(title) {
      const projects = await execute(['project', 'list', '--output', 'json']);
      return projects.find((project) => project.title === title) ?? null;
    },

    async findIssueByExternalKey(externalKey) {
      const response = await execute([
        'issue',
        'list',
        '--metadata',
        `external_pr_key=${JSON.stringify(externalKey)}`,
        '--output',
        'json',
      ]);
      return response.issues?.[0] ?? null;
    },

    async createIssue({ title, descriptionFile, projectId, assigneeName, status }) {
      return execute([
        'issue',
        'create',
        '--title',
        title,
        '--description-file',
        descriptionFile,
        '--project',
        projectId,
        '--assignee',
        assigneeName,
        '--status',
        status,
        '--output',
        'json',
      ]);
    },

    async setIssueMetadata(issueId, key, value) {
      return execute([
        'issue',
        'metadata',
        'set',
        issueId,
        '--key',
        key,
        '--value',
        value,
      ]);
    },

    async setIssueStatus(issueId, status) {
      return execute(['issue', 'status', issueId, status]);
    },
  };
}
