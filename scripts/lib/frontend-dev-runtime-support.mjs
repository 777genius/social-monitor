import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function readFrontendRuntimeConfig(env = process.env) {
  const port = env.SOCIAL_MONITOR_FRONTEND_PORT ?? '53217';
  const host = env.SOCIAL_MONITOR_FRONTEND_HOST ?? '127.0.0.1';
  const device = env.SOCIAL_MONITOR_FRONTEND_DEVICE ?? 'web-server';
  const launchPath = env.SOCIAL_MONITOR_FRONTEND_LAUNCH_PATH ?? '/summaries';
  const launchUrl = `http://${host}:${port}${launchPath}`;
  const pidFile =
    env.SOCIAL_MONITOR_FRONTEND_PID_FILE ??
    '/tmp/social-monitor-flutter-web.pid';
  const definesFile =
    env.SOCIAL_MONITOR_FRONTEND_DEFINES_FILE ??
    join(homedir(), '.cache/social-monitor/frontend/connected-web-defines.json');
  const skipApiPreflight =
    env.SOCIAL_MONITOR_FRONTEND_SKIP_API_PREFLIGHT?.toLowerCase() === 'true';

  return {
    port,
    host,
    device,
    launchPath,
    launchUrl,
    pidFile,
    definesFile,
    skipApiPreflight,
  };
}

export function readConnectedFrontendDefines(definesFile) {
  if (!existsSync(definesFile)) {
    throw new Error(
      `Missing connected frontend defines file: ${definesFile}\n` +
        'Create it or pass SOCIAL_MONITOR_FRONTEND_DEFINES_FILE.',
    );
  }

  const parsed = JSON.parse(readFileSync(definesFile, 'utf8'));

  return {
    apiBaseUrl: requiredString(parsed.SOCIAL_MONITOR_API_BASE_URL, {
      name: 'SOCIAL_MONITOR_API_BASE_URL',
    }),
    bearerToken: optionalString(parsed.SOCIAL_MONITOR_API_BEARER_TOKEN),
    tenantId: requiredString(parsed.SOCIAL_MONITOR_TENANT_ID, {
      name: 'SOCIAL_MONITOR_TENANT_ID',
    }),
    workspaceId: requiredString(parsed.SOCIAL_MONITOR_WORKSPACE_ID, {
      name: 'SOCIAL_MONITOR_WORKSPACE_ID',
    }),
    workspaceRole: optionalString(parsed.SOCIAL_MONITOR_WORKSPACE_ROLE) ?? 'owner',
  };
}

export async function runFrontendDevRuntimePreflight({
  definesFile,
  timeoutMs = 10000,
  requireSummary = true,
}) {
  const defines = readConnectedFrontendDefines(definesFile);
  const health = await fetchJson({
    url: joinApiPath(defines.apiBaseUrl, '/health'),
    timeoutMs,
    headers: authHeaders(defines),
  });

  let summary = null;
  if (requireSummary) {
    summary = await fetchJson({
      url: joinApiPath(
        defines.apiBaseUrl,
        '/reader-summaries?limit=1&scopeType=workspace&timezone=UTC&cadence=daily',
      ),
      timeoutMs,
      headers: workspaceHeaders(defines),
    });
  }

  return {
    apiBaseUrl: defines.apiBaseUrl,
    tenantFingerprint: fingerprint(defines.tenantId),
    workspaceFingerprint: fingerprint(defines.workspaceId),
    healthStatus: health.status,
    summaryStatus: summary?.status ?? null,
    summaryItemCount: Array.isArray(summary?.body?.items)
      ? summary.body.items.length
      : null,
    latestSummaryPeriod:
      Array.isArray(summary?.body?.items) && summary.body.items[0]?.period
        ? summary.body.items[0].period.startedAt
        : null,
  };
}

export function readFrontendPid(pidFile) {
  const pid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Invalid Flutter frontend pid in ${pidFile}`);
  }

  return pid;
}

export function assertProcessIsRunning(pid) {
  try {
    process.kill(pid, 0);
  } catch {
    throw new Error(`Flutter frontend process is not running: ${pid}`);
  }
}

export function readProcessCommand(pid) {
  return execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function assertMarionetteFrontendProcess(pid) {
  const command = readProcessCommand(pid);
  if (!command.includes('main_marionette.dart')) {
    throw new Error(
      'Refusing to control a frontend process that was not launched with ' +
        `lib/main_marionette.dart. pid=${pid}`,
    );
  }

  return command;
}

function workspaceHeaders(defines) {
  return {
    ...authHeaders(defines),
    'x-tenant-id': defines.tenantId,
    'x-workspace-id': defines.workspaceId,
    'x-workspace-role': defines.workspaceRole,
  };
}

function authHeaders(defines) {
  return defines.bearerToken === undefined || defines.bearerToken.length === 0
    ? {}
    : { authorization: `Bearer ${defines.bearerToken}` };
}

async function fetchJson({ url, timeoutMs, headers }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    const body = text.length === 0 ? null : JSON.parse(text);

    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}: ${text.slice(0, 240)}`);
    }

    return { status: response.status, body };
  } catch (error) {
    throw new Error(`Frontend dev runtime preflight failed for ${url}: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

function joinApiPath(baseUrl, path) {
  return new URL(path, `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

function requiredString(value, { name }) {
  const normalized = optionalString(value);
  if (normalized === undefined) {
    throw new Error(`Missing ${name} in connected frontend defines.`);
  }

  return normalized;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function fingerprint(value) {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
