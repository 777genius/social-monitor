import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dashboardsDir = join(root, 'ops/observability/dashboards');
const alertsDir = join(root, 'ops/observability/alerts');
const safeLabelPattern = /^[A-Za-z0-9._:-]+$/;
const allowedMetrics = new Set([
  'queue_commands_backlog',
  'queue_commands_enqueued_total',
  'scan_jobs_total',
]);
const forbiddenLabelKeys = new Set([
  'api_key',
  'authorization',
  'body',
  'email',
  'prompt',
  'raw_text',
  'source_url',
  'token',
  'url',
]);

const violations = [];

const readJsonFiles = (directory) =>
  readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const path = join(directory, file);
      return { file, path, document: JSON.parse(readFileSync(path, 'utf8')) };
    });

const dashboards = readJsonFiles(dashboardsDir);
const dashboardPanels = new Map();

for (const { file, document } of dashboards) {
  requireString(file, document.dashboardId, 'dashboardId');
  requireString(file, document.title, 'title');
  requireString(file, document.owner, 'owner');
  requireExistingRunbook(file, document.runbook);
  requireArray(file, document.panels, 'panels');

  for (const panel of document.panels ?? []) {
    requireString(file, panel.panelId, 'panel.panelId');
    requireAllowedMetric(file, panel.metric);
    requireSafeLabels(file, panel.labels ?? {});
    requireString(file, panel.safeDiagnosticQuestion, 'panel.safeDiagnosticQuestion');
    dashboardPanels.set(`${document.dashboardId}:${panel.panelId}`, panel);
  }
}

for (const { file, document } of readJsonFiles(alertsDir)) {
  requireString(file, document.alertSetId, 'alertSetId');
  requireString(file, document.owner, 'owner');
  requireArray(file, document.alerts, 'alerts');

  for (const alert of document.alerts ?? []) {
    requireString(file, alert.alertId, 'alert.alertId');
    requireString(file, alert.severity, 'alert.severity');
    requireAllowedMetric(file, alert.metric);
    requireSafeLabels(file, alert.labels ?? {});
    requireString(file, alert.condition, 'alert.condition');
    requireString(file, alert.dashboardId, 'alert.dashboardId');
    requireString(file, alert.dashboardPanelId, 'alert.dashboardPanelId');
    requireExistingRunbook(file, alert.runbook);
    requireString(file, alert.userVisibleState, 'alert.userVisibleState');
    requireString(file, alert.firstMitigation, 'alert.firstMitigation');

    const panelKey = `${alert.dashboardId}:${alert.dashboardPanelId}`;
    if (!dashboardPanels.has(panelKey)) {
      violations.push(`${file}: alert "${alert.alertId}" references missing dashboard panel "${panelKey}"`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Observability definitions OK');

function requireString(file, value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    violations.push(`${file}: missing required string field "${field}"`);
  }
}

function requireArray(file, value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    violations.push(`${file}: missing required non-empty array field "${field}"`);
  }
}

function requireAllowedMetric(file, metric) {
  requireString(file, metric, 'metric');
  if (typeof metric === 'string' && !allowedMetrics.has(metric)) {
    violations.push(`${file}: unsupported metric "${metric}"`);
  }
}

function requireSafeLabels(file, labels) {
  for (const [key, value] of Object.entries(labels)) {
    if (forbiddenLabelKeys.has(key.toLowerCase())) {
      violations.push(`${file}: forbidden high-risk label key "${key}"`);
    }

    if (!safeLabelPattern.test(String(value))) {
      violations.push(`${file}: unsafe label value for "${key}"`);
    }
  }
}

function requireExistingRunbook(file, runbook) {
  requireString(file, runbook, 'runbook');
  if (typeof runbook !== 'string') {
    return;
  }

  const [path] = runbook.split('#');
  if (!path || !existsSync(join(root, path))) {
    violations.push(`${file}: runbook path does not exist "${runbook}"`);
  }
}
