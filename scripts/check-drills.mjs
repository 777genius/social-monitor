import { existsSync, readFileSync } from 'node:fs';

const drillsPath = 'ops/drills/mvp-staging-drills.json';
const alertsPath = 'ops/observability/alerts/mvp-alerts.json';
const drills = JSON.parse(readFileSync(drillsPath, 'utf8'));
const alerts = JSON.parse(readFileSync(alertsPath, 'utf8'));
const alertIds = new Set((alerts.alerts ?? []).map((alert) => alert.alertId));
const requiredDrills = new Set(['provider-outage', 'provider-rate-limit', 'dlq-growth', 'summary-cost-spike', 'backup-restore']);
const allowedCommands = new Set([
  'npm run check:backup-restore',
  'npm run check:load-cost',
  'npm run check:observability',
]);
const violations = [];

if (drills.schemaVersion !== 1) {
  violations.push(`${drillsPath}: schemaVersion must be 1`);
}

const drillIds = new Set();
for (const drill of drills.drills ?? []) {
  if (drillIds.has(drill.drillId)) {
    violations.push(`${drillsPath}: duplicate drillId "${drill.drillId}"`);
  }
  drillIds.add(drill.drillId);

  if (!requiredDrills.has(drill.drillId)) {
    violations.push(`${drillsPath}: unsupported drillId "${drill.drillId}"`);
  }

  if (drill.requiredAlertId !== null && !alertIds.has(drill.requiredAlertId)) {
    violations.push(`${drillsPath}: drill "${drill.drillId}" references missing alert "${drill.requiredAlertId}"`);
  }

  if (!allowedCommands.has(drill.verificationCommand)) {
    violations.push(`${drillsPath}: drill "${drill.drillId}" uses unsupported verification command`);
  }

  const [runbookPath, runbookAnchor] = String(drill.runbook ?? '').split('#');
  if (!runbookPath || !existsSync(runbookPath)) {
    violations.push(`${drillsPath}: drill "${drill.drillId}" references missing runbook path`);
  } else if (!readFileSync(runbookPath, 'utf8').toLowerCase().includes((runbookAnchor ?? '').replaceAll('-', ' '))) {
    violations.push(`${drillsPath}: drill "${drill.drillId}" references missing runbook section`);
  }

  if (typeof drill.supportOutcome !== 'string' || drill.supportOutcome.trim().length === 0) {
    violations.push(`${drillsPath}: drill "${drill.drillId}" must define supportOutcome`);
  }
}

for (const requiredDrill of requiredDrills) {
  if (!drillIds.has(requiredDrill)) {
    violations.push(`${drillsPath}: missing required drill "${requiredDrill}"`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('MVP staging drill contracts OK');
