import { existsSync, readFileSync } from 'node:fs';

const policyPath = 'ops/release/beta-ring-expansion-policy.json';
const packagePath = 'package.json';
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const scripts = packageJson.scripts ?? {};
const verifyScript = String(scripts.verify ?? '');
const violations = [];

const requiredRingIds = ['internal-dogfood', 'private-beta-1', 'private-beta-2'];
const requiredGatesByRing = new Map([
  ['internal-dogfood', ['check:mvp-core-loop', 'check:source-certification', 'check:beta-scope-policy']],
  [
    'private-beta-1',
    [
      'check:mvp-core-loop',
      'check:source-certification',
      'check:beta-scope-policy',
      'check:load-cost',
      'check:observability',
      'check:summary-evals',
      'check:delivery-replay',
    ],
  ],
  [
    'private-beta-2',
    [
      'check:mvp-core-loop',
      'check:source-certification',
      'check:beta-scope-policy',
      'check:load-cost',
      'check:observability',
      'check:summary-evals',
      'check:summary-cost',
      'check:delivery-replay',
      'check:drills',
    ],
  ],
]);

if (policy.schemaVersion !== 1) {
  violations.push(`${policyPath}: schemaVersion must be 1`);
}

if (policy.decisionModel !== 'go_hold_rework') {
  violations.push(`${policyPath}: decisionModel must be go_hold_rework`);
}

const rings = Array.isArray(policy.rings) ? policy.rings : [];
const ringIds = rings.map((ring) => ring.ringId);
for (const requiredRingId of requiredRingIds) {
  if (!ringIds.includes(requiredRingId)) {
    violations.push(`${policyPath}: missing ring "${requiredRingId}"`);
  }
}

let previousMaxUsers = 0;
for (const ring of rings) {
  if (typeof ring.ringId !== 'string' || ring.ringId.trim().length === 0) {
    violations.push(`${policyPath}: ring must define ringId`);
    continue;
  }

  for (const field of [
    'maxUsers',
    'maxTopicsPerWorkspace',
    'maxEnabledSourcesPerTopic',
    'maxManualScansPerWorkspacePerHour',
    'maxSummaryRequestsPerWorkspacePerHour',
  ]) {
    if (!Number.isInteger(ring[field]) || ring[field] < 1) {
      violations.push(`${policyPath}: ring "${ring.ringId}" must define positive integer ${field}`);
    }
  }

  if (ring.maxUsers < previousMaxUsers) {
    violations.push(`${policyPath}: ring "${ring.ringId}" cannot reduce maxUsers versus previous ring`);
  }
  previousMaxUsers = ring.maxUsers;

  if (ring.maxEnabledSourcesPerTopic > 3) {
    violations.push(`${policyPath}: ring "${ring.ringId}" maxEnabledSourcesPerTopic must stay <= 3 for MVP`);
  }

  const requiredGates = requiredGatesByRing.get(ring.ringId) ?? [];
  const configuredGates = new Set(ring.requiredGates ?? []);
  for (const gate of requiredGates) {
    if (!configuredGates.has(gate)) {
      violations.push(`${policyPath}: ring "${ring.ringId}" missing required gate "${gate}"`);
    }
  }

  for (const gate of configuredGates) {
    const scriptName = gate.replace(/^check:/, 'check:');
    if (!scripts[scriptName]) {
      violations.push(`${policyPath}: ring "${ring.ringId}" references missing npm script "${scriptName}"`);
    }
    if (!verifyScript.includes(`npm run ${scriptName}`)) {
      violations.push(`${packagePath}: npm run verify must include ring gate "${scriptName}"`);
    }
  }
}

for (const [field, value] of Object.entries(policy.capacityEvidence ?? {})) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    violations.push(`${policyPath}: capacityEvidence.${field} must be a non-empty string`);
    continue;
  }

  if (value.startsWith('ops/') && !existsSync(value)) {
    violations.push(`${policyPath}: capacityEvidence.${field} references missing file "${value}"`);
  }

  if (value.startsWith('npm run ')) {
    const scriptName = value.replace(/^npm run /, '');
    if (!scripts[scriptName]) {
      violations.push(`${policyPath}: capacityEvidence.${field} references missing npm script "${scriptName}"`);
    }
  }
}

if ((policy.sourceHealthThresholds?.maxProviderFailureRatePercent ?? 101) > 5) {
  violations.push(`${policyPath}: maxProviderFailureRatePercent must stay <= 5`);
}

if ((policy.sourceHealthThresholds?.maxCursorResetRatePercent ?? 101) > 2) {
  violations.push(`${policyPath}: maxCursorResetRatePercent must stay <= 2`);
}

if (policy.sourceHealthThresholds?.unsupportedSourceBindingPolicy !== 'reject_binding_capture_source_request_feedback') {
  violations.push(`${policyPath}: unsupported source policy must reject binding and capture source_request feedback`);
}

if ((policy.costThresholds?.maxSummaryEstimatedCostUsdPerWorkspacePerDay ?? 0) <= 0) {
  violations.push(`${policyPath}: maxSummaryEstimatedCostUsdPerWorkspacePerDay must be positive`);
}

const degradationActions = new Set(policy.degradationActions ?? []);
for (const requiredAction of [
  'hold_ring_expansion',
  'reduce_scan_frequency',
  'pause_affected_source_bindings',
  'lower_summary_budget',
]) {
  if (!degradationActions.has(requiredAction)) {
    violations.push(`${policyPath}: degradationActions missing "${requiredAction}"`);
  }
}

const forbiddenFirstActions = new Set(policy.forbiddenFirstActions ?? []);
for (const forbiddenAction of [
  'expand_ring_without_gates',
  'enable_deferred_source_without_readiness',
  'add_workers_before_quota_or_source_pause_review',
]) {
  if (!forbiddenFirstActions.has(forbiddenAction)) {
    violations.push(`${policyPath}: forbiddenFirstActions missing "${forbiddenAction}"`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Beta ring expansion policy OK');
