import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { verifyGitHubSignature, normalizeGitHubEvent } from '../providers/github.js';
import { verifyGitCodeSignature, normalizeGitCodeEvent } from '../providers/gitcode.js';
import { resolveProjectRoute } from '../routing/repositories.js';
import { handlePullRequestEvent } from '../workflow/pr-automation.js';

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function defaultWriteDescriptionFile(content) {
  const dir = path.join(os.tmpdir(), 'multica-pr-webhook');
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${randomUUID()}.md`);
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

function jsonResponse(statusCode, body) {
  return { statusCode, body };
}

function readHeader(req, ...names) {
  for (const name of names) {
    const value = req.headers[name];
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  return null;
}

export function createWebhookRequestHandler({
  config,
  multica,
  writeDescriptionFile = defaultWriteDescriptionFile,
}) {
  const projectIdCache = new Map();
  let agentPromise;

  async function ensureAgentExists() {
    if (!agentPromise) {
      agentPromise = multica.findAgentByName(config.agentName).then((agent) => {
        if (!agent) {
          throw new Error(`Multica agent not found: ${config.agentName}`);
        }
        return agent;
      });
    }

    return agentPromise;
  }

  async function getProjectId(projectName) {
    if (projectIdCache.has(projectName)) {
      return projectIdCache.get(projectName);
    }

    const project = await multica.findProjectByTitle(projectName);
    if (!project) {
      throw new Error(`Multica project not found: ${projectName}`);
    }

    projectIdCache.set(projectName, project.id);
    return project.id;
  }

  async function processEvent(event) {
    const route = resolveProjectRoute(config, event);
    if (!route) {
      return jsonResponse(200, {
        ok: true,
        action: 'skipped',
        reason: 'repository not configured',
      });
    }

    await ensureAgentExists();
    const projectId = await getProjectId(route.projectName);
    const result = await handlePullRequestEvent({
      event,
      route: { ...route, projectId },
      config,
      multica,
      writeDescriptionFile,
    });

    return jsonResponse(200, { ok: true, ...result });
  }

  return async function handleProviderRequest({ req, rawBody }) {
    try {
      if (req.url === '/webhooks/github') {
        const signatureHeader = readHeader(req, 'x-hub-signature-256');
        if (
          !verifyGitHubSignature({
            secret: config.githubSecret,
            rawBody,
            signatureHeader,
          })
        ) {
          return jsonResponse(401, { error: 'invalid signature' });
        }

        const eventType = readHeader(req, 'x-github-event');
        if (eventType && eventType !== 'pull_request') {
          return jsonResponse(200, { ok: true, action: 'skipped', reason: 'unsupported event' });
        }

        const payload = JSON.parse(rawBody.toString('utf8'));
        if (!payload.pull_request || !payload.repository) {
          return jsonResponse(200, { ok: true, action: 'skipped', reason: 'unsupported payload' });
        }

        return processEvent(normalizeGitHubEvent(payload));
      }

      if (req.url === '/webhooks/gitcode') {
        const tokenHeader = readHeader(req, 'x-gitcode-token', 'x-gitlab-token', 'x-webhook-token');
        if (
          !verifyGitCodeSignature({
            secret: config.gitcodeSecret,
            tokenHeader,
          })
        ) {
          return jsonResponse(401, { error: 'invalid signature' });
        }

        const payload = JSON.parse(rawBody.toString('utf8'));
        const isMergeRequestEvent =
          payload.object_kind === 'merge_request' || payload.event_type === 'merge_request';
        if (!isMergeRequestEvent) {
          return jsonResponse(200, { ok: true, action: 'skipped', reason: 'unsupported event' });
        }

        return processEvent(normalizeGitCodeEvent(payload));
      }

      return jsonResponse(404, { error: 'not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'internal error';
      return jsonResponse(500, { error: message });
    }
  };
}

export function createApp({ handleProviderRequest }) {
  return async function app(req, res) {
    if (req.method === 'GET' && req.url === '/healthz') {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && (req.url === '/webhooks/github' || req.url === '/webhooks/gitcode')) {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }

      const rawBody = Buffer.concat(chunks);
      const result = await handleProviderRequest({ req, rawBody });
      return sendJson(res, result.statusCode, result.body);
    }

    return sendJson(res, 404, { error: 'not found' });
  };
}
