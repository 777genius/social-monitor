import { existsSync, globSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dashboardsDir = join(root, 'ops/observability/dashboards');
const alertsDir = join(root, 'ops/observability/alerts');
const collectorConfigPath = join(root, 'ops/observability/otel-collector.yml');
const composePath = join(root, 'docker-compose.yml');
const safeLabelPattern = /^[A-Za-z0-9._:-]+$/;
const allowedMetrics = new Set([
  'queue_commands_backlog',
  'queue_command_delivery_lag_seconds',
  'queue_commands_enqueued_total',
  'delivery_digest_scheduler_failures_total',
  'delivery_digest_scheduler_last_assembled',
  'delivery_digest_scheduler_last_evaluated',
  'delivery_digest_scheduler_runs_total',
  'delivery_attempts_total',
  'delivery_failures_total',
  'scan_failure_queue_backlog',
  'scan_failure_queue_events_total',
  'scan_failures_total',
  'scan_jobs_total',
  'summary_job_failures_total',
  'summary_jobs_total',
  'summary_model_estimated_cost_usd',
  'summary_model_requests_total',
  'summary_model_tokens_total',
  'summary_story_ranking_average_signal',
  'summary_story_ranking_clusters_without_provider_metrics',
  'summary_story_ranking_cross_provider_cluster_share',
  'summary_story_ranking_same_provider_duplicate_max',
  'summary_story_ranking_same_provider_duplicates_total',
  'summary_story_ranking_title_only_cluster_share',
  'summary_story_ranking_top_provider_cluster_share',
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

requireFileFragments(collectorConfigPath, [
  'health_check:',
  'endpoint: 0.0.0.0:4318',
  'memory_limiter:',
  'batch:',
  'prometheus:',
  'processors: [memory_limiter, batch]',
  'exporters: [prometheus]',
]);
requireFileFragments(composePath, [
  'SOCIAL_MONITOR_METRICS_MODE: otlp',
  'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: http://otel-collector:4318/v1/metrics',
  'otel/opentelemetry-collector-contrib:0.157.0@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6',
  './ops/observability/otel-collector.yml:/etc/otelcol-contrib/config.yaml:ro',
]);

for (const file of [
  ...globSync('apps/**/*.ts'),
  ...globSync('libs/**/*.ts'),
]) {
  if (
    file.includes('/platform/metrics/') ||
    file.endsWith('.spec.ts') ||
    file.endsWith('.e2e-spec.ts') ||
    file.endsWith('.test.ts')
  ) {
    continue;
  }
  const source = readFileSync(file, 'utf8');
  if (
    source.includes('InMemoryMetricsRecorder') &&
    !source.includes('useExisting: METRICS_RECORDER')
  ) {
    violations.push(
      `${file}: production source must inject METRICS_RECORDER instead of InMemoryMetricsRecorder`,
    );
  }
}

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

function requireFileFragments(path, fragments) {
  if (!existsSync(path)) {
    violations.push(`${relativePath(path)}: required observability file is missing`);
    return;
  }
  const source = readFileSync(path, 'utf8');
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      violations.push(`${relativePath(path)}: missing required fragment "${fragment}"`);
    }
  }
}

function relativePath(path) {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}
