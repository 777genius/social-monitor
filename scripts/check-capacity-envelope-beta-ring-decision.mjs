import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/release/capacity-envelope-beta-ring-decision.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const betaPolicyPath = 'ops/release/beta-ring-expansion-policy.json';
const betaDecisionPath = 'ops/release/beta-ring-expansion-decision-record.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';

const contract = readJson(contractPath);
const externalReadiness = readJson(externalReadinessPath);
const betaPolicy = readJson(betaPolicyPath);
const betaDecision = readJson(betaDecisionPath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const baseline = readJson(baselinePath);
const scripts = packageJson.scripts ?? {};
const violations = [];

const gateScript = 'check:capacity-envelope-beta-ring-decision';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'capacity-envelope-beta-ring-decision';
const requiredLimitFields = new Set([
  'maxTenants',
  'maxWorkspacesPerTenant',
  'maxUsers',
  'maxTopicsPerWorkspace',
  'maxEnabledSourcesPerTopic',
  'minScheduledScanIntervalMinutes',
  'maxManualScansPerWorkspacePerHour',
  'maxSummaryRequestsPerWorkspacePerHour',
  'maxQueueLagSeconds',
  'maxSummaryEstimatedCostUsdPerWorkspacePerDay',
  'maxDeliveryAttemptsPerWorkspacePerHour',
]);
const requiredHoldReasons = new Set([
  'feedback-report-is-fixture-only',
  'summary-feedback-blockers-exist',
  'durable-runtime-not-proven-for-external-beta',
  'live-source-evidence-not-attached',
  'credential-secret-runtime-evidence-not-attached',
  'staging-reliability-evidence-not-attached',
  'release-artifact-evidence-not-attached',
  'security-final-sweep-evidence-not-attached',
]);
const requiredGoPrerequisiteIds = new Set([
  'durable-runtime-proof',
  'live-source-provider-evidence',
  'credential-secret-runtime-flow',
  'real-feedback-samples',
  'staging-reliability-drills',
  'release-artifact-evidence',
  'security-final-sweep',
]);

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (contract.scope !== 'backend-only') {
  violations.push(`${contractPath}: scope must be backend-only`);
}

if (contract.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${contractPath}: frontendPolicy must keep frontend deferred`);
}

if (contract.decision !== 'hold') {
  violations.push(`${contractPath}: decision must stay hold until all go prerequisites pass`);
}

if (contract.capacityEnvelopeSource !== externalReadinessPath) {
  violations.push(`${contractPath}: capacityEnvelopeSource must reference ${externalReadinessPath}`);
}
if (contract.ringPolicy !== betaPolicyPath) {
  violations.push(`${contractPath}: ringPolicy must reference ${betaPolicyPath}`);
}
if (contract.decisionRecord !== betaDecisionPath) {
  violations.push(`${contractPath}: decisionRecord must reference ${betaDecisionPath}`);
}

validateCapacityEnvelope();
validatePolicyAndDecision();
validateGoPrerequisites();
validateLoadCostGuardrails();
requireWiring();
requireRuntimeCapacityEnforcement();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Capacity envelope beta ring decision OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateCapacityEnvelope() {
  const limits = contract.limits ?? {};
  const externalEnvelope = externalReadiness.capacityEnvelope ?? {};
  const targetRing = (betaPolicy.rings ?? []).find((ring) => ring.ringId === contract.targetRing);

  if (externalEnvelope.ringId !== contract.targetRing) {
    violations.push(`${externalReadinessPath}: capacityEnvelope.ringId must be ${contract.targetRing}`);
  }

  for (const field of requiredLimitFields) {
    if (!Number.isFinite(limits[field]) || limits[field] <= 0) {
      violations.push(`${contractPath}: limits.${field} must be positive`);
      continue;
    }
    if (externalEnvelope[field] !== limits[field]) {
      violations.push(`${externalReadinessPath}: capacityEnvelope.${field} must match ${contractPath}`);
    }
    if (targetRing !== undefined && targetRing[field] !== limits[field]) {
      violations.push(`${betaPolicyPath}: target ring "${contract.targetRing}" ${field} must match capacity envelope`);
    }
  }

  if (limits.maxEnabledSourcesPerTopic > 4) {
    violations.push(`${contractPath}: maxEnabledSourcesPerTopic must stay <= 4 for MVP`);
  }
  if (limits.minScheduledScanIntervalMinutes < 60) {
    violations.push(`${contractPath}: minScheduledScanIntervalMinutes must stay >= 60 before external beta go`);
  }
  if (limits.maxQueueLagSeconds > 300) {
    violations.push(`${contractPath}: maxQueueLagSeconds must stay <= 300 for private beta 1`);
  }
  if (limits.maxSummaryEstimatedCostUsdPerWorkspacePerDay > 5) {
    violations.push(`${contractPath}: maxSummaryEstimatedCostUsdPerWorkspacePerDay must stay <= 5`);
  }
  if (targetRing === undefined) {
    violations.push(`${betaPolicyPath}: missing target ring "${contract.targetRing}"`);
  }
}

function validatePolicyAndDecision() {
  if (externalReadiness.externalBetaDecision !== 'hold') {
    violations.push(`${externalReadinessPath}: externalBetaDecision must remain hold until go prerequisites pass`);
  }
  if (betaDecision.decision !== 'hold') {
    violations.push(`${betaDecisionPath}: decision must remain hold until go prerequisites pass`);
  }
  if (betaDecision.candidateNextRing !== contract.targetRing) {
    violations.push(`${betaDecisionPath}: candidateNextRing must match ${contract.targetRing}`);
  }

  const holdReasonIds = new Set((betaDecision.holdReasons ?? []).map((reason) => reason.reasonId));
  for (const holdReason of requiredHoldReasons) {
    if (!holdReasonIds.has(holdReason)) {
      violations.push(`${betaDecisionPath}: holdReasons missing "${holdReason}"`);
    }
  }

  for (const reason of betaDecision.holdReasons ?? []) {
    if (typeof reason.owner !== 'string' || reason.owner.trim().length === 0) {
      violations.push(`${betaDecisionPath}: holdReason "${reason.reasonId}" must define owner`);
    }
    if (typeof reason.exitCondition !== 'string' || reason.exitCondition.trim().length === 0) {
      violations.push(`${betaDecisionPath}: holdReason "${reason.reasonId}" must define exitCondition`);
    }
  }

  const forbiddenWhileHeld = new Set(contract.forbiddenWhileHeld ?? []);
  for (const action of [
    'invite_private_beta_1_users',
    'increase_capacity_limits',
    'lower_scan_interval_below_envelope',
    'enable_deferred_sources',
    'change_decision_to_go_without_passed_prerequisites',
  ]) {
    if (!forbiddenWhileHeld.has(action)) {
      violations.push(`${contractPath}: forbiddenWhileHeld missing "${action}"`);
    }
  }
}

function validateGoPrerequisites() {
  let hasPendingPrerequisite = false;
  const observedPrerequisiteIds = new Set();
  const holdReasonIds = new Set((betaDecision.holdReasons ?? []).map((reason) => reason.reasonId));

  for (const prerequisite of contract.goPrerequisites ?? []) {
    for (const field of ['prerequisiteId', 'owner', 'artifact', 'requiredStatusField', 'requiredPassedValue', 'currentHoldValue', 'holdReasonId']) {
      if (typeof prerequisite[field] !== 'string' || prerequisite[field].trim().length === 0) {
        violations.push(`${contractPath}: goPrerequisite must define ${field}`);
      }
    }
    if (observedPrerequisiteIds.has(prerequisite.prerequisiteId)) {
      violations.push(`${contractPath}: duplicate goPrerequisite "${prerequisite.prerequisiteId}"`);
    }
    observedPrerequisiteIds.add(prerequisite.prerequisiteId);
    if (!requiredGoPrerequisiteIds.has(prerequisite.prerequisiteId)) {
      violations.push(`${contractPath}: unsupported goPrerequisite "${prerequisite.prerequisiteId}"`);
    }
    if (!holdReasonIds.has(prerequisite.holdReasonId)) {
      violations.push(`${betaDecisionPath}: holdReasons missing go prerequisite reason "${prerequisite.holdReasonId}"`);
    }
    if (!existsSync(prerequisite.artifact)) {
      violations.push(`${contractPath}: goPrerequisite "${prerequisite.prerequisiteId}" references missing artifact`);
      continue;
    }

    const artifact = readJson(prerequisite.artifact);
    const actual = artifact[prerequisite.requiredStatusField];
    if (actual !== prerequisite.requiredPassedValue) {
      hasPendingPrerequisite = true;
      if (actual !== prerequisite.currentHoldValue) {
        violations.push(
          `${prerequisite.artifact}: prerequisite "${prerequisite.prerequisiteId}" must be passed or hold at "${prerequisite.currentHoldValue}"`,
        );
      }
    }
  }
  for (const requiredPrerequisiteId of requiredGoPrerequisiteIds) {
    if (!observedPrerequisiteIds.has(requiredPrerequisiteId)) {
      violations.push(`${contractPath}: goPrerequisites missing "${requiredPrerequisiteId}"`);
    }
  }

  if (hasPendingPrerequisite && externalReadiness.externalBetaDecision !== 'hold') {
    violations.push(`${externalReadinessPath}: pending go prerequisites require externalBetaDecision=hold`);
  }
  if (hasPendingPrerequisite && betaDecision.decision !== 'hold') {
    violations.push(`${betaDecisionPath}: pending go prerequisites require decision=hold`);
  }
}

function validateLoadCostGuardrails() {
  const guardrails = contract.loadCostGuardrails;
  if (typeof guardrails !== 'object' || guardrails === null) {
    violations.push(`${contractPath}: loadCostGuardrails must be defined`);
    return;
  }

  if (guardrails.script !== 'scripts/check-load-cost.mjs') {
    violations.push(`${contractPath}: loadCostGuardrails.script must be scripts/check-load-cost.mjs`);
  }
  if (!existsSync(guardrails.script ?? '')) {
    violations.push(`${contractPath}: loadCostGuardrails.script must reference an existing script`);
    return;
  }

  const derivedFromLimits = new Set(guardrails.derivedFromLimits ?? []);
  for (const field of [
    'maxManualScansPerWorkspacePerHour',
    'maxSummaryRequestsPerWorkspacePerHour',
    'maxDeliveryAttemptsPerWorkspacePerHour',
  ]) {
    if (!derivedFromLimits.has(field)) {
      violations.push(`${contractPath}: loadCostGuardrails.derivedFromLimits missing "${field}"`);
    }
  }
  if (guardrails.mustRejectNoisyTenant !== true) {
    violations.push(`${contractPath}: loadCostGuardrails.mustRejectNoisyTenant must be true`);
  }
  if (guardrails.mustKeepQuietTenantAllowed !== true) {
    violations.push(`${contractPath}: loadCostGuardrails.mustKeepQuietTenantAllowed must be true`);
  }

  const scriptSource = readFileSync(guardrails.script, 'utf8');
  if (!scriptSource.includes(contractPath)) {
    violations.push(`${guardrails.script}: load/cost script must read ${contractPath}`);
  }
  for (const field of derivedFromLimits) {
    if (!requiredLimitFields.has(field)) {
      violations.push(`${contractPath}: loadCostGuardrails references unsupported limit "${field}"`);
    }
    if (!scriptSource.includes(field)) {
      violations.push(`${guardrails.script}: load/cost script must reference limit "${field}"`);
    }
  }
}

function requireWiring() {
  const backendScripts = new Set(backendSafe.backendScripts ?? []);
  const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
  const externalDomain = (backendOps.requiredDomains ?? []).find(
    (domain) => domain.domainId === 'external-beta-evidence',
  );
  const externalGroup = (externalReadiness.requiredEvidenceGroups ?? []).find(
    (group) => group.groupId === 'capacity-envelope-beta-ring-decision',
  );
  const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
  const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));

  if (!scripts[gateScript]) {
    violations.push(`${packagePath}: missing ${gateScript}`);
  }
  if (!backendScripts.has(gateScript)) {
    violations.push(`${backendSafePath}: backend-safe verify must include ${gateScript}`);
  }
  if (!releaseGateIds.has(gateId)) {
    violations.push(`${releaseContractPath}: missing ${gateId} release gate`);
  }
  if (!releaseGateCommands.has(gateCommand)) {
    violations.push(`${releaseContractPath}: release gates must include ${gateScript}`);
  }

  if (externalDomain === undefined) {
    violations.push(`${backendOpsPath}: missing external-beta-evidence domain`);
  } else {
    if (!externalDomain.gates?.includes(gateScript)) {
      violations.push(`${backendOpsPath}: external-beta-evidence domain must include ${gateScript}`);
    }
    if (!externalDomain.releaseGateIds?.includes(gateId)) {
      violations.push(`${backendOpsPath}: external-beta-evidence domain must include ${gateId}`);
    }
    if (!externalDomain.artifacts?.includes(contractPath)) {
      violations.push(`${backendOpsPath}: external-beta-evidence domain must include ${contractPath}`);
    }
  }

  if (externalGroup === undefined) {
    violations.push(`${externalReadinessPath}: missing capacity-envelope-beta-ring-decision group`);
  } else {
    if (!externalGroup.verificationCommands?.includes(gateCommand)) {
      violations.push(`${externalReadinessPath}: capacity-envelope-beta-ring-decision group must include ${gateScript}`);
    }
    if (!externalGroup.requiredArtifacts?.includes(contractPath)) {
      violations.push(`${externalReadinessPath}: capacity-envelope-beta-ring-decision group must include ${contractPath}`);
    }
  }

  if (!baselineScripts.has(gateScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${gateScript}`);
  }
  if (!baselineArtifacts.has(contractPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${contractPath}`);
  }
}

function requireRuntimeCapacityEnforcement() {
  const monitoringModulePath = 'libs/monitoring/interfaces/rest/monitoring-rest.module.ts';
  const createTopicPath = 'libs/monitoring/features/create-topic/create-topic.use-case.ts';
  const bindSourcePath = 'libs/monitoring/features/bind-source/bind-source.use-case.ts';
  const capacityLimitsPath = 'libs/monitoring/features/shared/monitoring-capacity-limits.ts';
  const monitoringModule = readFileSync(monitoringModulePath, 'utf8');
  const createTopic = readFileSync(createTopicPath, 'utf8');
  const bindSource = readFileSync(bindSourcePath, 'utf8');
  const capacityLimits = readFileSync(capacityLimitsPath, 'utf8');
  const envExample = readFileSync('ops/release/external-beta-evidence.env.example', 'utf8');

  for (const marker of [
    'MONITORING_MAX_TOPICS_PER_WORKSPACE',
    'MONITORING_MAX_ENABLED_SOURCES_PER_TOPIC',
    'resolveMonitoringCapacityLimits(process.env)',
    'defaultMonitoringCapacityLimits',
  ]) {
    if (!monitoringModule.includes(marker)) {
      violations.push(`${monitoringModulePath}: runtime capacity enforcement missing "${marker}"`);
    }
    if (marker.startsWith('MONITORING_') && !envExample.includes(`${marker}=`)) {
      violations.push(`ops/release/external-beta-evidence.env.example: missing "${marker}"`);
    }
  }

  for (const [field, expectedValue] of [
    ['maxTopicsPerWorkspace', contract.limits.maxTopicsPerWorkspace],
    ['maxEnabledSourcesPerTopic', contract.limits.maxEnabledSourcesPerTopic],
  ]) {
    if (!capacityLimits.includes(`${field}: ${expectedValue}`)) {
      violations.push(`${capacityLimitsPath}: ${field} must default to capacity envelope value ${expectedValue}`);
    }
  }

  for (const marker of [
    'this.capacityLimits.maxTopicsPerWorkspace',
    'operation.quota_exceeded',
    'Workspace topic capacity limit reached',
  ]) {
    if (!createTopic.includes(marker)) {
      violations.push(`${createTopicPath}: topic capacity enforcement missing "${marker}"`);
    }
  }

  for (const marker of [
    'this.capacityLimits.maxEnabledSourcesPerTopic',
    "binding.toSnapshot().status === 'enabled'",
    'operation.quota_exceeded',
    'Topic source binding capacity limit reached',
  ]) {
    if (!bindSource.includes(marker)) {
      violations.push(`${bindSourcePath}: source binding capacity enforcement missing "${marker}"`);
    }
  }
}
