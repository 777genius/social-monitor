import { existsSync, readFileSync } from 'node:fs';

const evidencePath = 'ops/release/summary-feedback-hardening-evidence.json';
const feedbackPath = 'ops/release/beta-feedback-classification-report.json';
const evalOutputPath = 'ops/evals/summary-eval-output.json';
const costPath = 'ops/cost/summary-cost-attribution.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';

const evidence = readJson(evidencePath);
const feedback = readJson(feedbackPath);
const evalOutput = readJson(evalOutputPath);
const cost = readJson(costPath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const externalReadiness = readJson(externalReadinessPath);
const baseline = readJson(baselinePath);
const scripts = packageJson.scripts ?? {};
const violations = [];

const gateScript = 'check:summary-feedback-hardening';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'summary-feedback-hardening';
const allowedActionTypes = new Set(['eval_fixture', 'validator_change', 'runbook_action']);
const allowedActionStatuses = new Set(['fixture_covered_pending_real_sample', 'passed']);
const requiredInvariantIds = new Set([
  'claims-and-citations-grounded',
  'summary-evidence-citations-valid',
  'summary-cost-budget-attributed',
  'summary-window-stale-markers',
  'summary-retry-safety',
]);
const requiredFeedbackFixtureIds = new Set([
  'feedback-wrong-fact-grounding',
  'feedback-bad-citation-grounding',
]);
const forbiddenSerializedFragments = [
  'access_token',
  'authorization',
  'cookie',
  'raw_payload',
  'bearer ',
];

if (evidence.schemaVersion !== 1) {
  violations.push(`${evidencePath}: schemaVersion must be 1`);
}

if (evidence.scope !== 'backend-only') {
  violations.push(`${evidencePath}: scope must be backend-only`);
}

if (evidence.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${evidencePath}: frontendPolicy must keep frontend deferred`);
}

if (evidence.evidenceMode !== 'fixture_contract_with_redacted_real_samples_required') {
  violations.push(`${evidencePath}: evidenceMode must require redacted real samples`);
}

if (!['hold_until_redacted_real_feedback_samples', 'passed'].includes(evidence.externalBetaStatus)) {
  violations.push(`${evidencePath}: externalBetaStatus must be hold_until_redacted_real_feedback_samples or passed`);
}

if (evidence.sourceReport !== feedbackPath) {
  violations.push(`${evidencePath}: sourceReport must reference ${feedbackPath}`);
}

for (const [field, expected] of Object.entries({
  rawProviderPayloadsIncluded: false,
  piiIncluded: false,
  rawPromptTextIncluded: false,
  rawSourceTextIncluded: false,
  commentsAreSyntheticOrRedacted: true,
})) {
  if (evidence.privacyGuardrails?.[field] !== expected) {
    violations.push(`${evidencePath}: privacyGuardrails.${field} must be ${expected}`);
  }
}

const redactedSampleEvidence = evidence.redactedSampleEvidence ?? {};
if (!['pending_real_samples', 'passed'].includes(redactedSampleEvidence.status)) {
  violations.push(`${evidencePath}: redactedSampleEvidence.status must be pending_real_samples or passed`);
}
if (redactedSampleEvidence.requiredForExternalBeta !== true) {
  violations.push(`${evidencePath}: redactedSampleEvidence must be required for external beta`);
}
if (redactedSampleEvidence.status === 'pending_real_samples' && redactedSampleEvidence.artifactPath !== null) {
  violations.push(`${evidencePath}: pending redacted sample evidence must keep artifactPath=null`);
}
if (redactedSampleEvidence.status === 'passed') {
  requireExistingPath(redactedSampleEvidence.artifactPath, 'redactedSampleEvidence.artifactPath');
}
if (feedback.evidenceMode !== 'redacted_beta_samples' && evidence.externalBetaStatus !== 'hold_until_redacted_real_feedback_samples') {
  violations.push(`${evidencePath}: fixture feedback mode must keep externalBetaStatus on hold`);
}
if (feedback.evidenceMode === 'redacted_beta_samples' && redactedSampleEvidence.status !== 'passed') {
  violations.push(`${evidencePath}: redacted feedback report requires passed redacted sample evidence`);
}

const findingsById = new Map((feedback.findings ?? []).map((finding) => [finding.feedbackId, finding]));
const blockerIds = new Set((feedback.findings ?? [])
  .filter((finding) => finding.classification === 'blocker')
  .map((finding) => finding.feedbackId));
const evalFixtureIds = new Set((evalOutput.fixtureResults ?? []).map((fixture) => fixture.fixtureId));
const costFixtureIds = new Set((cost.rows ?? []).map((row) => row.fixtureId));
const coveredBlockerIds = new Set();

for (const action of evidence.blockerActions ?? []) {
  validateAction(action, coveredBlockerIds, 'blockerActions');

  if (!blockerIds.has(action.feedbackId)) {
    violations.push(`${evidencePath}: blocker action "${action.feedbackId}" must reference a blocker finding`);
  }
}

for (const blockerId of blockerIds) {
  if (!coveredBlockerIds.has(blockerId)) {
    violations.push(`${evidencePath}: blocker finding "${blockerId}" must have a hardening action`);
  }
}

for (const action of evidence.watchActions ?? []) {
  validateAction(action, new Set(), 'watchActions');
}

for (const fixtureId of requiredFeedbackFixtureIds) {
  if (!evalFixtureIds.has(fixtureId)) {
    violations.push(`${evalOutputPath}: missing required feedback hardening fixture "${fixtureId}"`);
  }
  if (!costFixtureIds.has(fixtureId)) {
    violations.push(`${costPath}: missing cost attribution for feedback hardening fixture "${fixtureId}"`);
  }
}

const invariantIds = new Set();
for (const invariant of evidence.releaseBlockingInvariants ?? []) {
  if (invariantIds.has(invariant.invariantId)) {
    violations.push(`${evidencePath}: duplicate invariant "${invariant.invariantId}"`);
  }
  invariantIds.add(invariant.invariantId);

  if (!requiredInvariantIds.has(invariant.invariantId)) {
    violations.push(`${evidencePath}: unsupported invariant "${invariant.invariantId}"`);
  }
  validateCommand(invariant.command, `invariant "${invariant.invariantId}"`);
  requireExistingPath(invariant.artifact, `invariant "${invariant.invariantId}" artifact`);
  if (typeof invariant.requiredSignal !== 'string' || invariant.requiredSignal.trim().length === 0) {
    violations.push(`${evidencePath}: invariant "${invariant.invariantId}" must define requiredSignal`);
  }
}

for (const invariantId of requiredInvariantIds) {
  if (!invariantIds.has(invariantId)) {
    violations.push(`${evidencePath}: missing invariant "${invariantId}"`);
  }
}

if (evalOutput.blockingPassed !== true) {
  violations.push(`${evalOutputPath}: summary evals must be blockingPassed`);
}
if (cost.blockingPassed !== true) {
  violations.push(`${costPath}: summary cost attribution must be blockingPassed`);
}

if (!Array.isArray(evidence.externalBetaExitCriteria) || evidence.externalBetaExitCriteria.length < 3) {
  violations.push(`${evidencePath}: externalBetaExitCriteria must list real samples, blocker action and invariant conditions`);
}

const serializedEvidence = JSON.stringify(evidence).toLowerCase();
for (const fragment of forbiddenSerializedFragments) {
  if (serializedEvidence.includes(fragment)) {
    violations.push(`${evidencePath}: hardening evidence must not contain "${fragment}"`);
  }
}

requireWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Summary feedback hardening evidence OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateAction(action, coveredIds, field) {
  const finding = findingsById.get(action.feedbackId);

  if (finding === undefined) {
    violations.push(`${evidencePath}: ${field} action references unknown feedbackId "${action.feedbackId}"`);
  } else {
    if (action.triageOwner !== finding.triageOwner) {
      violations.push(`${evidencePath}: action "${action.feedbackId}" owner must match feedback report owner`);
    }
    coveredIds.add(action.feedbackId);
  }

  if (!allowedActionTypes.has(action.actionType)) {
    violations.push(`${evidencePath}: action "${action.feedbackId}" has unsupported actionType "${action.actionType}"`);
  }
  if (!allowedActionStatuses.has(action.status)) {
    violations.push(`${evidencePath}: action "${action.feedbackId}" has unsupported status "${action.status}"`);
  }
  if (action.releaseBlocking !== true) {
    violations.push(`${evidencePath}: action "${action.feedbackId}" must be releaseBlocking`);
  }
  validateCommand(action.command, `action "${action.feedbackId}"`);
  requireExistingPath(action.artifact, `action "${action.feedbackId}" artifact`);
  if (typeof action.exitCondition !== 'string' || action.exitCondition.trim().length === 0) {
    violations.push(`${evidencePath}: action "${action.feedbackId}" must define exitCondition`);
  }

  for (const fixtureId of action.fixtureIds ?? []) {
    if (!evalFixtureIds.has(fixtureId)) {
      violations.push(`${evalOutputPath}: action "${action.feedbackId}" references missing fixture "${fixtureId}"`);
    }
    if (!costFixtureIds.has(fixtureId)) {
      violations.push(`${costPath}: action "${action.feedbackId}" references fixture without cost row "${fixtureId}"`);
    }
  }

  if (action.actionType === 'eval_fixture' && (!Array.isArray(action.fixtureIds) || action.fixtureIds.length === 0)) {
    violations.push(`${evidencePath}: eval_fixture action "${action.feedbackId}" must reference at least one fixture`);
  }
}

function validateCommand(command, label) {
  const scriptName = String(command ?? '').replace(/^npm run /, '');
  if (!String(command ?? '').startsWith('npm run ')) {
    violations.push(`${evidencePath}: ${label} command must use npm run`);
    return;
  }
  if (!scripts[scriptName]) {
    violations.push(`${evidencePath}: ${label} references missing npm script "${scriptName}"`);
  }
}

function requireExistingPath(path, label) {
  if (typeof path !== 'string' || path.trim().length === 0 || !existsSync(path)) {
    violations.push(`${evidencePath}: ${label} must reference an existing path`);
  }
}

function requireWiring() {
  const backendScripts = new Set(backendSafe.backendScripts ?? []);
  const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
  const mvpLoopDomain = (backendOps.requiredDomains ?? []).find((domain) => domain.domainId === 'mvp-loop');
  const summaryExternalGroup = (externalReadiness.requiredEvidenceGroups ?? []).find(
    (group) => group.groupId === 'summary-quality-feedback-hardening',
  );

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

  if (mvpLoopDomain === undefined) {
    violations.push(`${backendOpsPath}: missing mvp-loop domain`);
  } else {
    if (!mvpLoopDomain.gates?.includes(gateScript)) {
      violations.push(`${backendOpsPath}: mvp-loop must include ${gateScript}`);
    }
    if (!mvpLoopDomain.releaseGateIds?.includes(gateId)) {
      violations.push(`${backendOpsPath}: mvp-loop must include ${gateId} release gate`);
    }
    if (!mvpLoopDomain.artifacts?.includes(evidencePath)) {
      violations.push(`${backendOpsPath}: mvp-loop must include ${evidencePath}`);
    }
  }

  if (summaryExternalGroup === undefined) {
    violations.push(`${externalReadinessPath}: missing summary-quality-feedback-hardening group`);
  } else {
    if (!summaryExternalGroup.verificationCommands?.includes(gateCommand)) {
      violations.push(`${externalReadinessPath}: summary group must include ${gateScript}`);
    }
    if (!summaryExternalGroup.requiredArtifacts?.includes(evidencePath)) {
      violations.push(`${externalReadinessPath}: summary group must include ${evidencePath}`);
    }
  }

  if (!baseline.requiredGreenScripts?.includes(gateScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${gateScript}`);
  }
  if (!(baseline.trackedArtifacts ?? []).some((artifact) => artifact.path === evidencePath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${evidencePath}`);
  }
}
