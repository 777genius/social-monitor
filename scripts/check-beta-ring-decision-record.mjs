import { existsSync, readFileSync } from 'node:fs';

const decisionPath = 'ops/release/beta-ring-expansion-decision-record.json';
const policyPath = 'ops/release/beta-ring-expansion-policy.json';
const feedbackPath = 'ops/release/beta-feedback-classification-report.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';

const decision = JSON.parse(readFileSync(decisionPath, 'utf8'));
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const feedbackReport = JSON.parse(readFileSync(feedbackPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const backendSafe = JSON.parse(readFileSync(backendSafePath, 'utf8'));
const scripts = packageJson.scripts ?? {};
const verifyScript = String(scripts.verify ?? '');
const backendSafeScripts = new Set(backendSafe.backendScripts ?? []);
const hasVerificationScript = (scriptName) =>
  verifyScript.includes(`npm run ${scriptName}`) || backendSafeScripts.has(scriptName);
const violations = [];

const fail = (message) => {
  violations.push(message);
};

const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

if (decision.schemaVersion !== 1) {
  fail(`${decisionPath}: schemaVersion must be 1`);
}

if (decision.recordId !== 'beta-ring-expansion-decision-record-mvp-v1') {
  fail(`${decisionPath}: recordId must be beta-ring-expansion-decision-record-mvp-v1`);
}

if (decision.decisionModel !== 'go_hold_rework') {
  fail(`${decisionPath}: decisionModel must be go_hold_rework`);
}

if (!['deterministic_pre_beta_fixture', 'redacted_beta_samples'].includes(decision.evidenceMode)) {
  fail(`${decisionPath}: evidenceMode must be deterministic_pre_beta_fixture or redacted_beta_samples`);
}

if (!['go', 'hold', 'rework'].includes(decision.decision)) {
  fail(`${decisionPath}: decision must be go, hold or rework`);
}

if (!nonEmptyString(decision.decisionOwner)) {
  fail(`${decisionPath}: decisionOwner must be non-empty`);
}

if (decision.policyReference !== policyPath || !existsSync(decision.policyReference)) {
  fail(`${decisionPath}: policyReference must point to ${policyPath}`);
}

if (decision.feedbackReportReference !== feedbackPath || !existsSync(decision.feedbackReportReference)) {
  fail(`${decisionPath}: feedbackReportReference must point to ${feedbackPath}`);
}

const rings = Array.isArray(policy.rings) ? policy.rings : [];
const currentRing = rings.find((ring) => ring.ringId === decision.currentRing);
const candidateRing = rings.find((ring) => ring.ringId === decision.candidateNextRing);
if (currentRing === undefined) {
  fail(`${decisionPath}: currentRing must exist in beta ring policy`);
}
if (candidateRing === undefined) {
  fail(`${decisionPath}: candidateNextRing must exist in beta ring policy`);
}
if (currentRing !== undefined && candidateRing !== undefined && candidateRing.maxUsers <= currentRing.maxUsers) {
  fail(`${decisionPath}: candidateNextRing must increase capacity versus currentRing`);
}

const feedbackFindings = Array.isArray(feedbackReport.findings) ? feedbackReport.findings : [];
const blockerFindings = feedbackFindings.filter((finding) => finding.classification === 'blocker');
if (feedbackReport.evidenceMode === 'deterministic_pre_beta_fixture' && decision.decision === 'go') {
  fail(`${decisionPath}: deterministic fixture feedback cannot produce a go expansion decision`);
}
if (blockerFindings.length > 0 && decision.decision === 'go') {
  fail(`${decisionPath}: blocker feedback findings require hold or rework`);
}
if (decision.decision === 'hold' && (!Array.isArray(decision.holdReasons) || decision.holdReasons.length < 3)) {
  fail(`${decisionPath}: hold decision must include concrete holdReasons`);
}

const requiredGateCommands = new Set(decision.requiredGateCommands ?? []);
for (const gate of candidateRing?.requiredGates ?? []) {
  const command = `npm run ${gate.replace(/^check:/, 'check:')}`;
  if (!requiredGateCommands.has(command)) {
    fail(`${decisionPath}: requiredGateCommands missing candidate ring gate "${command}"`);
  }
}
for (const command of [
  'npm run check:beta-feedback-report',
  'npm run check:persistence-readiness',
  'npm run check:release',
]) {
  if (!requiredGateCommands.has(command)) {
    fail(`${decisionPath}: requiredGateCommands missing "${command}"`);
  }
}

for (const command of requiredGateCommands) {
  if (!String(command).startsWith('npm run ')) {
    fail(`${decisionPath}: requiredGateCommands must contain npm run commands`);
    continue;
  }

  const scriptName = String(command).replace(/^npm run /, '');
  if (!scripts[scriptName]) {
    fail(`${decisionPath}: requiredGateCommands references missing npm script "${scriptName}"`);
  }
  if (!hasVerificationScript(scriptName)) {
    fail(`${packagePath}: npm run verify or verify:backend must include ring decision gate dependency "${scriptName}"`);
  }
}

for (const [inputId, input] of Object.entries(decision.decisionInputs ?? {})) {
  if (!nonEmptyString(input.status)) {
    fail(`${decisionPath}: decisionInputs.${inputId}.status must be non-empty`);
  }
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
    fail(`${decisionPath}: decisionInputs.${inputId}.evidence must be non-empty`);
  }
  if (!nonEmptyString(input.risk)) {
    fail(`${decisionPath}: decisionInputs.${inputId}.risk must be non-empty`);
  }
}

const holdReasonIds = new Set();
for (const holdReason of decision.holdReasons ?? []) {
  if (!nonEmptyString(holdReason.reasonId)) {
    fail(`${decisionPath}: every holdReason must define reasonId`);
  } else {
    holdReasonIds.add(holdReason.reasonId);
  }
  if (!nonEmptyString(holdReason.owner) || !nonEmptyString(holdReason.exitCondition)) {
    fail(`${decisionPath}: every holdReason must define owner and exitCondition`);
  }
}
for (const requiredReason of [
  'feedback-report-is-fixture-only',
  'summary-feedback-blockers-exist',
  'durable-runtime-not-proven-for-external-beta',
  'live-source-evidence-not-attached',
]) {
  if (!holdReasonIds.has(requiredReason)) {
    fail(`${decisionPath}: holdReasons missing "${requiredReason}"`);
  }
}

const allowedWhileHeld = new Set(decision.allowedWhileHeld ?? []);
if (![...allowedWhileHeld].some((item) => String(item).includes('internal dogfood'))) {
  fail(`${decisionPath}: allowedWhileHeld must allow internal dogfood while expansion is held`);
}
if (![...allowedWhileHeld].some((item) => String(item).includes('source requests'))) {
  fail(`${decisionPath}: allowedWhileHeld must preserve source-request evidence collection`);
}

const forbiddenWhileHeld = new Set(decision.forbiddenWhileHeld ?? []);
for (const forbiddenAction of [
  'Invite private-beta-1 users.',
  'Enable x-twitter or telegram source bindings.',
]) {
  if (!forbiddenWhileHeld.has(forbiddenAction)) {
    fail(`${decisionPath}: forbiddenWhileHeld missing "${forbiddenAction}"`);
  }
}

const checklistOwners = new Set((decision.nextDecisionChecklist ?? []).map((item) => item.owner));
for (const owner of [
  'product-owner',
  'summary-owner',
  'backend-lead',
  'source-owner',
]) {
  if (!checklistOwners.has(owner)) {
    fail(`${decisionPath}: nextDecisionChecklist must include owner ${owner}`);
  }
}

if (!scripts['check:beta-ring-decision']) {
  fail(`${packagePath}: missing check:beta-ring-decision script`);
} else if (!hasVerificationScript('check:beta-ring-decision')) {
  fail(`${packagePath}: npm run verify or verify:backend must include check:beta-ring-decision`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Beta ring expansion decision record OK');
