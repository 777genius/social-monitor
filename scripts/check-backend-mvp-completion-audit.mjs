import { existsSync, readFileSync } from 'node:fs';

const auditPath = 'ops/release/backend-mvp-completion-audit.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const betaDecisionPath = 'ops/release/beta-ring-expansion-decision-record.json';
const packagePath = 'package.json';

const audit = readJson(auditPath);
const externalReadiness = readJson(externalReadinessPath);
const releaseContract = readJson(releaseContractPath);
const backendSafe = readJson(backendSafePath);
const baseline = readJson(baselinePath);
const betaDecision = readJson(betaDecisionPath);
const packageJson = readJson(packagePath);
const scripts = packageJson.scripts ?? {};
const backendSafeScripts = new Set(backendSafe.backendScripts ?? []);
const forbiddenBackendSafeScripts = new Set(backendSafe.forbiddenScriptNames ?? []);
const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
const externalGroups = new Map(
  (externalReadiness.requiredEvidenceGroups ?? []).map((group) => [group.groupId, group]),
);
const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));
const violations = [];

const gateScript = 'check:backend-mvp-completion-audit';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'backend-mvp-completion-audit';
const allowedStatuses = new Set([
  'contract_ready',
  'pending_staging_evidence',
  'blocked_without_live_credentials',
  'blocked_until_real_feedback',
  'pending_image_digest_and_deploy_smoke',
  'hold',
  'passed',
]);
const requiredRequirementIds = new Set([
  'release-baseline-freeze',
  'durable-runtime-proof',
  'production-auth-finalization',
  'source-provider-live-certification',
  'credential-secret-runtime-flow',
  'rabbitmq-staging-reliability-drill',
  'postgres-restore-migration-drill',
  'durable-backend-e2e-loop',
  'summary-quality-feedback-hardening',
  'operational-support-package',
  'capacity-envelope-beta-ring-decision',
  'release-artifact-evidence',
  'security-final-sweep',
  'no-go-cleanup',
]);

if (audit.schemaVersion !== 1) {
  violations.push(`${auditPath}: schemaVersion must be 1`);
}

if (audit.scope !== 'backend-only') {
  violations.push(`${auditPath}: scope must be backend-only`);
}

if (audit.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${auditPath}: frontendPolicy must keep frontend deferred`);
}

if (audit.mvpExitRequiresAllRequirementsPassed !== true) {
  violations.push(`${auditPath}: mvpExitRequiresAllRequirementsPassed must be true`);
}

if (audit.externalBetaDecision !== externalReadiness.externalBetaDecision) {
  violations.push(`${auditPath}: externalBetaDecision must match ${externalReadinessPath}`);
}

if (audit.externalBetaDecision !== betaDecision.decision) {
  violations.push(`${auditPath}: externalBetaDecision must match ${betaDecisionPath}`);
}

const requirementIds = new Set();
let hasNonPassedRequirement = false;
for (const requirement of audit.requirements ?? []) {
  if (requirementIds.has(requirement.requirementId)) {
    violations.push(`${auditPath}: duplicate requirementId "${requirement.requirementId}"`);
  }
  requirementIds.add(requirement.requirementId);

  if (!requiredRequirementIds.has(requirement.requirementId)) {
    violations.push(`${auditPath}: unsupported requirementId "${requirement.requirementId}"`);
  }

  if (typeof requirement.planLabel !== 'string' || requirement.planLabel.trim().length === 0) {
    violations.push(`${auditPath}: requirement "${requirement.requirementId}" must define planLabel`);
  }

  if (!allowedStatuses.has(requirement.status)) {
    violations.push(`${auditPath}: requirement "${requirement.requirementId}" has unsupported status "${requirement.status}"`);
  }

  if (requirement.status !== 'passed') {
    hasNonPassedRequirement = true;
  }

  if (requirement.blocksMvpExit !== true) {
    violations.push(`${auditPath}: requirement "${requirement.requirementId}" must block MVP exit until passed`);
  }

  for (const field of ['owner', 'exitCondition', 'goCondition']) {
    if (typeof requirement[field] !== 'string' || requirement[field].trim().length === 0) {
      violations.push(`${auditPath}: requirement "${requirement.requirementId}" must define ${field}`);
    }
  }

  const externalGroup = externalGroups.get(requirement.externalReadinessGroupId);
  if (externalGroup === undefined) {
    violations.push(
      `${auditPath}: requirement "${requirement.requirementId}" references missing external readiness group "${requirement.externalReadinessGroupId}"`,
    );
  } else {
    if (requirement.status !== externalGroup.status) {
      violations.push(
        `${auditPath}: requirement "${requirement.requirementId}" status must match external readiness group status "${externalGroup.status}"`,
      );
    }
    if (externalGroup.blocksExternalBeta !== true) {
      violations.push(
        `${externalReadinessPath}: group "${externalGroup.groupId}" must block external beta until passed`,
      );
    }
  }

  validateArtifacts(requirement);
  validateBackendSafeCommands(requirement);
  validateExternalCommands(requirement);
  validateReleaseGates(requirement);
}

for (const requirementId of requiredRequirementIds) {
  if (!requirementIds.has(requirementId)) {
    violations.push(`${auditPath}: missing requirement "${requirementId}"`);
  }
}

if (audit.completionStatus === 'complete' && hasNonPassedRequirement) {
  violations.push(`${auditPath}: completionStatus cannot be complete while a requirement is not passed`);
}

if (audit.completionStatus !== 'complete' && audit.completionStatus !== 'hold_until_external_evidence') {
  violations.push(`${auditPath}: completionStatus must be complete or hold_until_external_evidence`);
}

if (hasNonPassedRequirement && audit.completionStatus !== 'hold_until_external_evidence') {
  violations.push(`${auditPath}: non-passed requirements require completionStatus=hold_until_external_evidence`);
}

if (externalReadiness.externalBetaDecision === 'go' && audit.completionStatus !== 'complete') {
  violations.push(`${externalReadinessPath}: go requires ${auditPath} completionStatus=complete`);
}

requireWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Backend MVP completion audit OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateArtifacts(requirement) {
  const artifacts = requirement.authoritativeArtifacts ?? [];
  if (artifacts.length === 0) {
    violations.push(`${auditPath}: requirement "${requirement.requirementId}" must define authoritativeArtifacts`);
  }

  for (const artifact of artifacts) {
    if (!existsSync(artifact)) {
      violations.push(`${auditPath}: requirement "${requirement.requirementId}" references missing artifact "${artifact}"`);
    }
  }
}

function validateBackendSafeCommands(requirement) {
  const commands = requirement.backendSafeVerificationCommands ?? [];
  if (commands.length === 0) {
    violations.push(`${auditPath}: requirement "${requirement.requirementId}" must define backendSafeVerificationCommands`);
  }

  for (const command of commands) {
    const scriptName = parseNpmScript(command, `requirement "${requirement.requirementId}" backendSafeVerificationCommands`);
    if (scriptName === null) {
      continue;
    }

    if (!scripts[scriptName]) {
      violations.push(`${auditPath}: requirement "${requirement.requirementId}" references missing npm script "${scriptName}"`);
    }
    if (!backendSafeScripts.has(scriptName)) {
      violations.push(`${backendSafePath}: backend-safe verify must include "${scriptName}" from requirement "${requirement.requirementId}"`);
    }
    if (forbiddenBackendSafeScripts.has(scriptName)) {
      violations.push(`${backendSafePath}: backend-safe verify must not include forbidden script "${scriptName}"`);
    }
  }
}

function validateExternalCommands(requirement) {
  for (const command of requirement.externalVerificationCommands ?? []) {
    const scriptName = parseNpmScript(command, `requirement "${requirement.requirementId}" externalVerificationCommands`);
    if (scriptName === null) {
      continue;
    }

    if (!scripts[scriptName]) {
      violations.push(`${auditPath}: requirement "${requirement.requirementId}" references missing external script "${scriptName}"`);
    }
    if (backendSafeScripts.has(scriptName)) {
      violations.push(`${backendSafePath}: external verification script "${scriptName}" must stay outside backend-safe verify`);
    }
  }
}

function validateReleaseGates(requirement) {
  const gates = requirement.releaseGateIds ?? [];
  if (gates.length === 0) {
    violations.push(`${auditPath}: requirement "${requirement.requirementId}" must define releaseGateIds`);
  }

  for (const releaseGateId of gates) {
    if (!releaseGateIds.has(releaseGateId)) {
      violations.push(`${releaseContractPath}: missing release gate "${releaseGateId}" for requirement "${requirement.requirementId}"`);
    }
  }
}

function requireWiring() {
  if (!scripts[gateScript]) {
    violations.push(`${packagePath}: missing ${gateScript}`);
  }

  if (!backendSafeScripts.has(gateScript)) {
    violations.push(`${backendSafePath}: backend-safe verify must include ${gateScript}`);
  }

  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
  if (!releaseGateIds.has(gateId)) {
    violations.push(`${releaseContractPath}: missing ${gateId} release gate`);
  }
  if (!releaseGateCommands.has(gateCommand)) {
    violations.push(`${releaseContractPath}: release gates must include ${gateScript}`);
  }

  if (!baselineScripts.has(gateScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${gateScript}`);
  }
  if (!baselineArtifacts.has(auditPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${auditPath}`);
  }
}

function parseNpmScript(command, label) {
  if (!String(command ?? '').startsWith('npm run ')) {
    violations.push(`${auditPath}: ${label} must use npm run`);
    return null;
  }

  return String(command).replace(/^npm run /, '');
}
