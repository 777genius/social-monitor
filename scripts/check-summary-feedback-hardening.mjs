import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateEvidenceArtifactProvenance,
  validateEvidenceProvenanceRequirements,
  validateRealEvidenceIdentityStrings,
} from './lib/evidence-provenance.mjs';
import { readPrivateEvidenceJsonFile } from './lib/evidence-env-file.mjs';

const evidencePath = 'ops/release/summary-feedback-hardening-evidence.json';
const feedbackPath = 'ops/release/beta-feedback-classification-report.json';
const evalOutputPath = 'ops/evals/summary-eval-output.json';
const costPath = 'ops/cost/summary-cost-attribution.json';
const packagePath = 'package.json';
const envExamplePath = 'ops/release/external-beta-evidence.env.example';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const currentScriptPath = fileURLToPath(import.meta.url);

const evidence = readJson(evidencePath);
const feedback = readJson(feedbackPath);
const evalOutput = readJson(evalOutputPath);
const cost = readJson(costPath);
const packageJson = readJson(packagePath);
const envExampleSource = readFileSync(envExamplePath, 'utf8');
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const externalReadiness = readJson(externalReadinessPath);
const baseline = readJson(baselinePath);
const scripts = packageJson.scripts ?? {};
const violations = [];
const summaryRealFeedbackSamplesPath = process.env.SUMMARY_REAL_FEEDBACK_SAMPLES_PATH;

const gateScript = 'check:summary-feedback-hardening';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'summary-feedback-hardening';
const captureScript = 'capture:summary-feedback-samples';
const captureScriptPath = 'scripts/capture-summary-feedback-samples.mjs';
const dogfoodCaptureScript = 'capture:summary-feedback-dogfood-samples';
const dogfoodCaptureScriptPath = 'scripts/capture-summary-feedback-dogfood-samples.ts';
const exportScript = 'export:summary-feedback-samples';
const exportScriptPath = 'scripts/export-summary-feedback-samples.ts';
const captureCheckScript = 'check:summary-feedback-sample-capture';
const redactedSampleFormat = 'redacted-summary-feedback-samples-v1';
const redactedSampleEvidenceKind = 'redacted_real_feedback_samples';
const allowedActionTypes = new Set(['eval_fixture', 'validator_change', 'runbook_action']);
const allowedActionStatuses = new Set(['fixture_covered_pending_real_sample', 'passed']);
const allowedSampleCategories = new Set([
  'wrong_fact',
  'missing_source',
  'bad_citation',
  'low_relevance',
  'too_verbose',
  'too_terse',
  'source_request',
  'ux_confusing',
  'other',
]);
const allowedSampleClassifications = new Set([
  'blocker',
  'accepted_mvp_gap',
  'evidence_based_opportunity',
  'deferred_idea',
]);
const allowedSampleSeverities = new Set(['blocker', 'accepted_gap', 'opportunity', 'watch']);
const allowedRealSampleSourceKinds = new Set(['internal_dogfood', 'private_beta']);
const requiredSampleSourceFields = new Set([
  'kind',
  'environmentId',
  'sampleWindow',
  'operator',
  'sampleCount',
  'collectionMethod',
  'redactedBy',
  'approvedBy',
  'export',
]);
const requiredSampleSourceExportFields = new Set([
  'sourceSystem',
  'exportId',
  'exportedAt',
  'reviewQueue',
  'redactionReviewId',
  'approvalReference',
]);
const forbiddenRealSourceFragments = [
  'example',
  'fixture',
  'synthetic',
  'mock',
  'test',
];
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
const requiredSummaryQualityFixtureIds = new Set([
  ...requiredFeedbackFixtureIds,
  'rss-secret-redaction-boundary',
  'stale-window-marker-regression',
]);
const forbiddenSerializedFragments = [
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'client_secret',
  'authorization',
  'cookie',
  'private_key',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
  'raw_payload',
  'bearer ',
  'basic ',
  'github_pat_',
  'ghp_',
  'glpat-',
  'xoxb-',
  'xoxp-',
  'sk-proj-',
  'sk-live-',
];
const forbiddenSerializedPatterns = [
  {
    label: 'query credential',
    regex: /\b(?:access_token|refresh_token|id_token|api_key|apikey|client_secret|signature|sig)=([^&\s"']+)/gi,
  },
  {
    label: 'header credential',
    regex: /\b(?:authorization|x-api-key|x-amz-security-token):\s*([^,\s"'}]+)/gi,
  },
  {
    label: 'jwt credential',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
];
const forbiddenSampleKeys = new Set([
  'apikey',
  'api_key',
  'apitoken',
  'api_token',
  'id_token',
  'idtoken',
  'jwttoken',
  'jwt_token',
  'sessiontoken',
  'session_token',
  'password',
  'privatekey',
  'private_key',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'authorization',
  'authorizationheader',
  'cookie',
  'cookies',
  'raw_payload',
  'rawpayload',
  'rawproviderpayload',
  'prompt',
  'prompttext',
  'source_text',
  'sourcetext',
  'rawprompt',
  'rawsource',
]);
const requiredSampleRedactionFlags = {
  rawProviderPayloadsIncluded: false,
  piiIncluded: false,
  rawPromptTextIncluded: false,
  rawSourceTextIncluded: false,
  tokenValuesIncluded: false,
  secretUrlsIncluded: false,
  commentsAreSyntheticOrRedacted: true,
};
const requiredSampleSignals = new Set([
  'claimsChecked',
  'citationsChecked',
  'costChecked',
  'staleMarkerChecked',
]);
const requiredRealSampleGuardFragments = [
  'must not reuse fixture sample ids',
  'must not copy fixture sample signal text',
];
const requiredTopLevelSampleArtifactFields = new Set([
  'schemaVersion',
  'artifactFormat',
  'scope',
  'frontendPolicy',
  'provenance',
  'evidenceMode',
  'generatedAt',
  'source',
  'redaction',
  'samples',
  'rollup',
]);
const requiredRedactedSampleFields = new Set([
  'feedbackId',
  'category',
  'classification',
  'severity',
  'triageOwner',
  'eligibleForEvalFixture',
  'releaseBlocking',
  'summaryEvidence',
  'sanitizedSignal',
  'redactedComment',
  'qualitySignals',
  'hardeningAction',
]);
const requiredRollupRequirementFragments = [
  'sampleCount',
  'categoryCounts',
  'classificationCounts',
  'severityCounts',
  'actionTypeCounts',
  'releaseBlockingSamples',
  'evalFixtureEligibleSamples',
  'blockerSampleIds',
];
const requiredSummaryFeedbackExportEnv = [
  'SUMMARY_FEEDBACK_REDACTED_INPUT_PATH',
  'SUMMARY_FEEDBACK_EXPORT_ENV_PATH',
  'SUMMARY_FEEDBACK_TENANT_ID',
  'SUMMARY_FEEDBACK_WORKSPACE_ID',
  'SUMMARY_FEEDBACK_WINDOW_STARTED_AT',
  'SUMMARY_FEEDBACK_WINDOW_ENDED_AT',
  'SUMMARY_FEEDBACK_EXPORT_LIMIT',
  'SUMMARY_FEEDBACK_MIN_SAMPLES',
  'SUMMARY_FEEDBACK_SOURCE_KIND',
  'SUMMARY_FEEDBACK_ENVIRONMENT_ID',
  'SUMMARY_FEEDBACK_OPERATOR',
  'SUMMARY_FEEDBACK_COLLECTION_METHOD',
  'SUMMARY_FEEDBACK_REDACTED_BY',
  'SUMMARY_FEEDBACK_APPROVED_BY',
  'SUMMARY_FEEDBACK_EXPORT_SOURCE_SYSTEM',
  'SUMMARY_FEEDBACK_EXPORT_ID',
  'SUMMARY_FEEDBACK_EXPORTED_AT',
  'SUMMARY_FEEDBACK_REVIEW_QUEUE',
  'SUMMARY_FEEDBACK_REDACTION_REVIEW_ID',
  'SUMMARY_FEEDBACK_APPROVAL_REFERENCE',
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

const redactedSampleSchema = evidence.redactedSampleContentSchema ?? {};
const knownFixtureSampleGuards = readKnownFixtureSampleGuards(redactedSampleSchema.exampleArtifact);

const findingsById = new Map((feedback.findings ?? []).map((finding) => [finding.feedbackId, finding]));
const blockerIds = new Set((feedback.findings ?? [])
  .filter((finding) => finding.classification === 'blocker')
  .map((finding) => finding.feedbackId));
const evalFixtureIds = new Set((evalOutput.fixtureResults ?? []).map((fixture) => fixture.fixtureId));
const costFixtureIds = new Set((cost.rows ?? []).map((row) => row.fixtureId));
const coveredBlockerIds = new Set();

validateRedactedSampleContentSchema(redactedSampleSchema);
validateRedactedSampleArtifactPath(
  redactedSampleSchema.exampleArtifact,
  'redactedSampleContentSchema.exampleArtifact',
  { allowExample: true },
);
if (redactedSampleEvidence.status === 'passed') {
  validateRedactedSampleArtifactPath(
    redactedSampleEvidence.artifactPath,
    'redactedSampleEvidence.artifactPath',
    { allowExample: false },
  );
}
if (summaryRealFeedbackSamplesPath !== undefined && summaryRealFeedbackSamplesPath.trim().length > 0) {
  validateRedactedSampleArtifactPath(
    summaryRealFeedbackSamplesPath,
    'SUMMARY_REAL_FEEDBACK_SAMPLES_PATH',
    { allowExample: false, requirePrivateExternalPath: true },
  );
}

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

for (const fixtureId of requiredSummaryQualityFixtureIds) {
  if (!evalFixtureIds.has(fixtureId)) {
    violations.push(`${evalOutputPath}: missing required summary quality hardening fixture "${fixtureId}"`);
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

validateDirectArtifactPathGuards();
requireWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Summary feedback hardening evidence OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readRedactedSampleArtifact(path) {
  return readRedactedSampleArtifactContent(readFileSync(path, 'utf8'), path);
}

function readPrivateRedactedSampleArtifact(path, label) {
  return readRedactedSampleArtifactContent(readPrivateEvidenceJsonFile(path, label), path);
}

function readRedactedSampleArtifactContent(rawContent, path) {
  validateSerializedArtifactContent(rawContent, path);
  return JSON.parse(rawContent);
}

function validateRedactedSampleContentSchema(schema) {
  if (schema.artifactFormat !== redactedSampleFormat) {
    violations.push(`${evidencePath}: redactedSampleContentSchema.artifactFormat must be ${redactedSampleFormat}`);
  }
  requireExistingPath(schema.exampleArtifact, 'redactedSampleContentSchema.exampleArtifact');
  if (!Number.isInteger(schema.minimumSamples) || schema.minimumSamples < 2) {
    violations.push(`${evidencePath}: redactedSampleContentSchema.minimumSamples must be an integer >= 2`);
  }
  if (schema.requiredEvidenceMode !== 'redacted_beta_samples') {
    violations.push(`${evidencePath}: redactedSampleContentSchema.requiredEvidenceMode must be redacted_beta_samples`);
  }

  requireSetCoverage(
    new Set(schema.requiredTopLevelFields ?? []),
    requiredTopLevelSampleArtifactFields,
    'redactedSampleContentSchema.requiredTopLevelFields',
  );
  requireSetCoverage(
    new Set(schema.requiredSampleFields ?? []),
    requiredRedactedSampleFields,
    'redactedSampleContentSchema.requiredSampleFields',
  );
  requireSetCoverage(
    new Set(schema.requiredSourceFields ?? []),
    requiredSampleSourceFields,
    'redactedSampleContentSchema.requiredSourceFields',
  );
  requireSetCoverage(
    new Set(schema.requiredSourceExportFields ?? []),
    requiredSampleSourceExportFields,
    'redactedSampleContentSchema.requiredSourceExportFields',
  );
  validateProvenanceRequirements(schema.provenanceRequirements);
  requireSetCoverage(
    new Set(schema.allowedRealSourceKinds ?? []),
    allowedRealSampleSourceKinds,
    'redactedSampleContentSchema.allowedRealSourceKinds',
  );
  requireSetCoverage(
    new Set(schema.forbiddenRealSourceFragments ?? []),
    new Set(forbiddenRealSourceFragments),
    'redactedSampleContentSchema.forbiddenRealSourceFragments',
  );
  const rollupRequirements = schema.rollupRequirements ?? [];
  for (const fragment of requiredRollupRequirementFragments) {
    if (!Array.isArray(rollupRequirements) || !rollupRequirements.some((requirement) => String(requirement).includes(fragment))) {
      violations.push(`${evidencePath}: redactedSampleContentSchema.rollupRequirements must include ${fragment}`);
    }
  }
  for (const fragment of requiredRealSampleGuardFragments) {
    if (!Array.isArray(schema.realSampleGuards) || !schema.realSampleGuards.some((guard) => String(guard).includes(fragment))) {
      violations.push(`${evidencePath}: redactedSampleContentSchema.realSampleGuards must include "${fragment}"`);
    }
  }

  requireSetCoverage(
    new Set(schema.allowedCategories ?? []),
    allowedSampleCategories,
    'redactedSampleContentSchema.allowedCategories',
  );
  requireSetCoverage(
    new Set(schema.allowedClassifications ?? []),
    allowedSampleClassifications,
    'redactedSampleContentSchema.allowedClassifications',
  );
  requireSetCoverage(
    new Set(schema.blockingActionTypes ?? []),
    allowedActionTypes,
    'redactedSampleContentSchema.blockingActionTypes',
  );

  for (const [field, expected] of Object.entries(requiredSampleRedactionFlags)) {
    if (schema.requiredRedactionFlags?.[field] !== expected) {
      violations.push(`${evidencePath}: redactedSampleContentSchema.requiredRedactionFlags.${field} must be ${expected}`);
    }
  }

  const schemaSignals = new Set(schema.requiredSampleSignals ?? []);
  for (const signal of requiredSampleSignals) {
    if (!schemaSignals.has(signal)) {
      violations.push(`${evidencePath}: redactedSampleContentSchema.requiredSampleSignals must include ${signal}`);
    }
  }

  if (typeof schema.exitCondition !== 'string' || !schema.exitCondition.includes(redactedSampleFormat)) {
    violations.push(`${evidencePath}: redactedSampleContentSchema.exitCondition must mention ${redactedSampleFormat}`);
  }
}

function requireSetCoverage(actual, expected, label) {
  for (const expectedValue of expected) {
    if (!actual.has(expectedValue)) {
      violations.push(`${evidencePath}: ${label} must include "${expectedValue}"`);
    }
  }
}

function validateRedactedSampleArtifactPath(path, label, options) {
  if (typeof path !== 'string' || path.trim().length === 0) {
    violations.push(`${evidencePath}: ${label} must reference an existing path`);
    return;
  }
  if (options.requirePrivateExternalPath !== true && !existsSync(path)) {
    violations.push(`${evidencePath}: ${label} must reference an existing path`);
    return;
  }

  let artifact;
  try {
    artifact = options.requirePrivateExternalPath === true
      ? readPrivateRedactedSampleArtifact(path, label)
      : readRedactedSampleArtifact(path);
  } catch (error) {
    violations.push(error instanceof Error ? error.message : String(error));
    return;
  }
  validateRedactedSampleArtifact(artifact, path, options);
}

function validateRedactedSampleArtifact(artifact, path, options) {
  for (const field of requiredTopLevelSampleArtifactFields) {
    if (!(field in artifact)) {
      violations.push(`${path}: missing top-level field ${field}`);
    }
  }

  if (artifact.schemaVersion !== 1) {
    violations.push(`${path}: schemaVersion must be 1`);
  }
  if (artifact.artifactFormat !== redactedSampleFormat) {
    violations.push(`${path}: artifactFormat must be ${redactedSampleFormat}`);
  }
  if (artifact.scope !== 'backend-only') {
    violations.push(`${path}: scope must be backend-only`);
  }
  if (artifact.frontendPolicy !== 'deferred_contract_only') {
    violations.push(`${path}: frontendPolicy must be deferred_contract_only`);
  }
  if (artifact.evidenceMode !== 'redacted_beta_samples') {
    violations.push(`${path}: evidenceMode must be redacted_beta_samples`);
  }

  if (!isIsoDateString(artifact.generatedAt)) {
    violations.push(`${path}: generatedAt must be an ISO timestamp`);
  }
  validateSampleSource(artifact.source, path, options);
  validateArtifactProvenance(artifact.provenance, path, options);
  validateSampleRedaction(artifact.redaction, path);

  if (!Array.isArray(artifact.samples)) {
    violations.push(`${path}: samples must be an array`);
    return;
  }
  if (artifact.samples.length < redactedSampleSchema.minimumSamples) {
    violations.push(`${path}: samples must include at least ${redactedSampleSchema.minimumSamples} samples`);
  }
  if (artifact.source?.sampleCount !== artifact.samples.length) {
    violations.push(`${path}: source.sampleCount must match samples.length`);
  }
  validateGeneratedAtCoversSampleWindow(artifact, path);

  const sampleIds = new Set();
  const blockerIdsFromSamples = new Set();
  const rollupInput = {
    categoryCounts: new Map(),
    classificationCounts: new Map(),
    severityCounts: new Map(),
    actionTypeCounts: new Map(),
    releaseBlockingSamples: 0,
    evalFixtureEligibleSamples: 0,
  };
  for (const [index, sample] of artifact.samples.entries()) {
    const sampleLabel = `${path}: samples[${index}]`;
    validateRedactedSample(sample, sampleLabel, sampleIds);
    if (options.allowExample !== true) {
      validateRealSampleDoesNotCopyFixtureExample(sample, sampleLabel);
    }
    if (typeof sample.category === 'string') {
      incrementCount(rollupInput.categoryCounts, sample.category);
    }
    if (typeof sample.classification === 'string') {
      incrementCount(rollupInput.classificationCounts, sample.classification);
    }
    if (typeof sample.severity === 'string') {
      incrementCount(rollupInput.severityCounts, sample.severity);
    }
    if (typeof sample.hardeningAction?.actionType === 'string') {
      incrementCount(rollupInput.actionTypeCounts, sample.hardeningAction.actionType);
    }
    if (sample.releaseBlocking === true) {
      rollupInput.releaseBlockingSamples += 1;
    }
    if (sample.eligibleForEvalFixture === true) {
      rollupInput.evalFixtureEligibleSamples += 1;
    }
    if (sample.classification === 'blocker') {
      blockerIdsFromSamples.add(sample.feedbackId);
    }
  }

  if (options.allowExample === true && blockerIdsFromSamples.size === 0) {
    violations.push(`${path}: example artifact must include at least one blocker sample`);
  }

  validateSampleRollup(artifact.rollup, path, artifact.samples.length, blockerIdsFromSamples, rollupInput);
  validateSerializedArtifact(artifact, path);
}

function validateProvenanceRequirements(requirements) {
  validateEvidenceProvenanceRequirements({
    requirements,
    expectedEvidenceKind: redactedSampleEvidenceKind,
    label: 'redactedSampleContentSchema.provenanceRequirements',
    sourcePath: evidencePath,
    violations,
  });
}

function validateArtifactProvenance(provenance, path, options) {
  validateEvidenceArtifactProvenance({
    provenance,
    label: path,
    expectedEvidenceKind: redactedSampleEvidenceKind,
    allowFixture: options.allowExample === true,
    violations,
    realEvidenceLabel: 'real feedback artifacts',
  });
}

function validateSampleSource(source, path, options) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    violations.push(`${path}: source must be an object`);
    return;
  }
  for (const field of ['kind', 'environmentId', 'operator', 'collectionMethod', 'redactedBy', 'approvedBy']) {
    if (typeof source[field] !== 'string' || source[field].trim().length === 0) {
      violations.push(`${path}: source.${field} must be a non-empty string`);
    }
  }
  if (options.allowExample !== true) {
    if (!allowedRealSampleSourceKinds.has(source.kind)) {
      violations.push(`${path}: real sample source.kind must be one of ${[...allowedRealSampleSourceKinds].join(', ')}`);
    }
    validateRealEvidenceIdentityStrings({
      source,
      fields: ['kind', 'environmentId', 'operator', 'collectionMethod', 'redactedBy', 'approvedBy'],
      label: `${path}: source`,
      violations,
      realEvidenceLabel: 'real feedback artifacts',
      forbiddenRealFragments: forbiddenRealSourceFragments,
    });
    if (typeof source.collectionMethod === 'string' && source.collectionMethod.trim().length < 20) {
      violations.push(`${path}: source.collectionMethod must describe the real export path`);
    }
  }
  if (!Number.isInteger(source.sampleCount) || source.sampleCount <= 0) {
    violations.push(`${path}: source.sampleCount must be a positive integer`);
  }
  if (!isIsoDateString(source.sampleWindow?.startedAt) || !isIsoDateString(source.sampleWindow?.endedAt)) {
    violations.push(`${path}: source.sampleWindow must include ISO startedAt and endedAt`);
  } else if (Date.parse(source.sampleWindow.startedAt) >= Date.parse(source.sampleWindow.endedAt)) {
    violations.push(`${path}: source.sampleWindow.startedAt must be before endedAt`);
  }
  validateSourceExport(source.export, path, options);
}

function validateSourceExport(sourceExport, path, options) {
  if (sourceExport === null || typeof sourceExport !== 'object' || Array.isArray(sourceExport)) {
    violations.push(`${path}: source.export must be an object`);
    return;
  }

  for (const field of ['sourceSystem', 'exportId', 'reviewQueue', 'redactionReviewId', 'approvalReference']) {
    if (typeof sourceExport[field] !== 'string' || sourceExport[field].trim().length < 4) {
      violations.push(`${path}: source.export.${field} must be a non-empty traceability string`);
    }
  }
  if (!isIsoDateString(sourceExport.exportedAt)) {
    violations.push(`${path}: source.export.exportedAt must be an ISO timestamp`);
  }

  if (options.allowExample === true) {
    return;
  }

  validateRealEvidenceIdentityStrings({
    source: sourceExport,
    fields: ['sourceSystem', 'exportId', 'reviewQueue', 'redactionReviewId', 'approvalReference'],
    label: `${path}: source.export`,
    violations,
    realEvidenceLabel: 'real feedback artifacts',
    forbiddenRealFragments: forbiddenRealSourceFragments,
  });
}

function validateSampleRedaction(redaction, path) {
  if (redaction === null || typeof redaction !== 'object' || Array.isArray(redaction)) {
    violations.push(`${path}: redaction must be an object`);
    return;
  }

  for (const [field, expected] of Object.entries(requiredSampleRedactionFlags)) {
    if (redaction[field] !== expected) {
      violations.push(`${path}: redaction.${field} must be ${expected}`);
    }
  }

  if (typeof redaction.method !== 'string' || redaction.method.trim().length < 20) {
    violations.push(`${path}: redaction.method must describe how comments and identifiers were redacted`);
  }
}

function validateSampleRollup(rollup, path, sampleCount, blockerIdsFromSamples, rollupInput) {
  if (rollup === null || typeof rollup !== 'object' || Array.isArray(rollup)) {
    violations.push(`${path}: rollup must be an object`);
    return;
  }

  if (rollup.sampleCount !== sampleCount) {
    violations.push(`${path}: rollup.sampleCount must match samples.length`);
  }
  validateCountObject(rollup.categoryCounts, rollupInput.categoryCounts, `${path}: rollup.categoryCounts`);
  validateCountObject(rollup.classificationCounts, rollupInput.classificationCounts, `${path}: rollup.classificationCounts`);
  validateCountObject(rollup.severityCounts, rollupInput.severityCounts, `${path}: rollup.severityCounts`);
  validateCountObject(rollup.actionTypeCounts, rollupInput.actionTypeCounts, `${path}: rollup.actionTypeCounts`);

  if (rollup.releaseBlockingSamples !== rollupInput.releaseBlockingSamples) {
    violations.push(`${path}: rollup.releaseBlockingSamples must match releaseBlocking samples`);
  }
  if (rollup.evalFixtureEligibleSamples !== rollupInput.evalFixtureEligibleSamples) {
    violations.push(`${path}: rollup.evalFixtureEligibleSamples must match eligibleForEvalFixture samples`);
  }

  if (!Array.isArray(rollup.blockerSampleIds)) {
    violations.push(`${path}: rollup.blockerSampleIds must be an array`);
  } else {
    const actualBlockerIds = new Set(rollup.blockerSampleIds);
    if (actualBlockerIds.size !== rollup.blockerSampleIds.length) {
      violations.push(`${path}: rollup.blockerSampleIds must not contain duplicates`);
    }
    for (const blockerId of blockerIdsFromSamples) {
      if (!actualBlockerIds.has(blockerId)) {
        violations.push(`${path}: rollup.blockerSampleIds missing "${blockerId}"`);
      }
    }
    for (const blockerId of actualBlockerIds) {
      if (!blockerIdsFromSamples.has(blockerId)) {
        violations.push(`${path}: rollup.blockerSampleIds contains non-blocker sample "${blockerId}"`);
      }
    }
  }
}

function validateCountObject(actual, expected, label) {
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
    violations.push(`${label} must be an object`);
    return;
  }

  for (const [key, expectedCount] of expected.entries()) {
    if (actual[key] !== expectedCount) {
      violations.push(`${label}.${key} must be ${expectedCount}`);
    }
  }
  for (const key of Object.keys(actual)) {
    if (!expected.has(key)) {
      violations.push(`${label}.${key} is not present in samples`);
    }
  }
}

function incrementCount(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function validateRedactedSample(sample, sampleLabel, sampleIds) {
  if (sample === null || typeof sample !== 'object' || Array.isArray(sample)) {
    violations.push(`${sampleLabel}: sample must be an object`);
    return;
  }

  scanForbiddenSampleKeys(sample, sampleLabel);

  if (typeof sample.feedbackId !== 'string' || sample.feedbackId.trim().length === 0) {
    violations.push(`${sampleLabel}: feedbackId must be a non-empty string`);
  } else if (sampleIds.has(sample.feedbackId)) {
    violations.push(`${sampleLabel}: duplicate feedbackId "${sample.feedbackId}"`);
  } else {
    sampleIds.add(sample.feedbackId);
  }

  if (!allowedSampleCategories.has(sample.category)) {
    violations.push(`${sampleLabel}: unsupported category "${sample.category}"`);
  }
  if (!allowedSampleClassifications.has(sample.classification)) {
    violations.push(`${sampleLabel}: unsupported classification "${sample.classification}"`);
  }
  if (!allowedSampleSeverities.has(sample.severity)) {
    violations.push(`${sampleLabel}: unsupported severity "${sample.severity}"`);
  }
  if (typeof sample.triageOwner !== 'string' || sample.triageOwner.trim().length === 0) {
    violations.push(`${sampleLabel}: triageOwner must be a non-empty string`);
  }
  if (typeof sample.eligibleForEvalFixture !== 'boolean') {
    violations.push(`${sampleLabel}: eligibleForEvalFixture must be boolean`);
  }
  if (sample.releaseBlocking !== true) {
    violations.push(`${sampleLabel}: releaseBlocking must be true`);
  }

  validateSummaryEvidence(sample.summaryEvidence, sample.category, sampleLabel);
  validateSanitizedText(sample.sanitizedSignal, `${sampleLabel}.sanitizedSignal`, 20);
  validateSanitizedText(sample.redactedComment, `${sampleLabel}.redactedComment`, 20);
  validateQualitySignals(sample.qualitySignals, sampleLabel);
  validateSampleHardeningAction(sample, sampleLabel);
}

function validateRealSampleDoesNotCopyFixtureExample(sample, sampleLabel) {
  const feedbackId = typeof sample.feedbackId === 'string' ? sample.feedbackId.trim() : '';
  if (knownFixtureSampleGuards.feedbackIds.has(feedbackId)) {
    violations.push(`${sampleLabel}: real feedback sample must not reuse fixture sample id "${feedbackId}"`);
  }

  const fingerprint = sampleSignalFingerprint(sample);
  if (fingerprint !== undefined && knownFixtureSampleGuards.signalFingerprints.has(fingerprint)) {
    violations.push(`${sampleLabel}: real feedback sample must not copy fixture sample signal text`);
  }
}

function validateSummaryEvidence(summaryEvidence, category, sampleLabel) {
  if (summaryEvidence === null || typeof summaryEvidence !== 'object' || Array.isArray(summaryEvidence)) {
    violations.push(`${sampleLabel}: summaryEvidence must be an object`);
    return;
  }

  for (const field of ['summaryId', 'interestId']) {
    if (typeof summaryEvidence[field] !== 'string' || summaryEvidence[field].trim().length === 0) {
      violations.push(`${sampleLabel}: summaryEvidence.${field} must be a non-empty string`);
    }
  }

  if (['wrong_fact', 'missing_source', 'bad_citation'].includes(category)) {
    for (const field of ['citationId', 'feedItemId', 'sourceItemId', 'providerKey']) {
      if (typeof summaryEvidence[field] !== 'string' || summaryEvidence[field].trim().length === 0) {
        violations.push(`${sampleLabel}: summaryEvidence.${field} is required for ${category}`);
      }
    }
  }
}

function validateSanitizedText(value, label, minimumLength) {
  if (typeof value !== 'string' || value.trim().length < minimumLength) {
    violations.push(`${label} must be a redacted string with at least ${minimumLength} characters`);
    return;
  }

  const normalized = value.toLowerCase();
  for (const fragment of forbiddenSerializedFragments) {
    if (normalized.includes(fragment)) {
      violations.push(`${label} must not contain "${fragment}"`);
    }
  }
}

function validateQualitySignals(qualitySignals, sampleLabel) {
  if (qualitySignals === null || typeof qualitySignals !== 'object' || Array.isArray(qualitySignals)) {
    violations.push(`${sampleLabel}: qualitySignals must be an object`);
    return;
  }

  for (const signal of requiredSampleSignals) {
    if (qualitySignals[signal] !== true) {
      violations.push(`${sampleLabel}: qualitySignals.${signal} must be true`);
    }
  }
}

function validateSampleHardeningAction(sample, sampleLabel) {
  const action = sample.hardeningAction;
  if (action === null || typeof action !== 'object' || Array.isArray(action)) {
    violations.push(`${sampleLabel}: hardeningAction must be an object`);
    return;
  }

  if (!allowedActionTypes.has(action.actionType)) {
    violations.push(`${sampleLabel}: hardeningAction has unsupported actionType "${action.actionType}"`);
  }
  if (action.status !== 'passed') {
    violations.push(`${sampleLabel}: hardeningAction.status must be passed for redacted samples`);
  }
  validateCommand(action.command, `${sampleLabel} hardeningAction`);
  requireExistingPath(action.artifact, `${sampleLabel} hardeningAction artifact`);
  if (typeof action.exitCondition !== 'string' || action.exitCondition.trim().length === 0) {
    violations.push(`${sampleLabel}: hardeningAction.exitCondition must be a non-empty string`);
  }

  const fixtureIds = action.fixtureIds ?? [];
  if (!Array.isArray(fixtureIds)) {
    violations.push(`${sampleLabel}: hardeningAction.fixtureIds must be an array`);
    return;
  }
  if (action.actionType === 'eval_fixture' && fixtureIds.length === 0) {
    violations.push(`${sampleLabel}: eval_fixture hardeningAction must reference at least one fixture`);
  }

  for (const fixtureId of fixtureIds) {
    if (!evalFixtureIds.has(fixtureId)) {
      violations.push(`${evalOutputPath}: ${sampleLabel} references missing fixture "${fixtureId}"`);
    }
    if (!costFixtureIds.has(fixtureId)) {
      violations.push(`${costPath}: ${sampleLabel} references fixture without cost row "${fixtureId}"`);
    }
  }

  if (sample.classification === 'blocker' && !allowedActionTypes.has(action.actionType)) {
    violations.push(`${sampleLabel}: blocker sample must map to eval, validator or runbook action`);
  }
}

function scanForbiddenSampleKeys(value, label) {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      scanForbiddenSampleKeys(item, `${label}[${index}]`);
    }
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (forbiddenSampleKeys.has(normalizedKey)) {
      violations.push(`${label}: forbidden sensitive field "${key}"`);
    }
    scanForbiddenSampleKeys(nested, `${label}.${key}`);
  }
}

function validateSerializedArtifact(artifact, path) {
  validateSerializedArtifactContent(JSON.stringify(artifact), path);
}

function validateSerializedArtifactContent(content, path) {
  const serializedArtifact = content.toLowerCase();
  for (const fragment of forbiddenSerializedFragments) {
    if (serializedArtifact.includes(fragment)) {
      violations.push(`${path}: redacted sample artifact must not contain "${fragment}"`);
    }
  }
  validateSerializedPatterns(content, `${path}: redacted sample artifact`);
}

function readKnownFixtureSampleGuards(examplePath) {
  if (typeof examplePath !== 'string' || examplePath.trim().length === 0 || !existsSync(examplePath)) {
    return { feedbackIds: new Set(), signalFingerprints: new Set() };
  }

  const fixture = readJson(examplePath);
  const feedbackIds = new Set();
  const signalFingerprints = new Set();
  for (const sample of fixture.samples ?? []) {
    if (typeof sample.feedbackId === 'string' && sample.feedbackId.trim().length > 0) {
      feedbackIds.add(sample.feedbackId.trim());
    }
    const fingerprint = sampleSignalFingerprint(sample);
    if (fingerprint !== undefined) {
      signalFingerprints.add(fingerprint);
    }
  }

  return { feedbackIds, signalFingerprints };
}

function sampleSignalFingerprint(sample) {
  if (sample === null || typeof sample !== 'object' || Array.isArray(sample)) {
    return undefined;
  }
  if (
    typeof sample.category !== 'string' ||
    typeof sample.sanitizedSignal !== 'string' ||
    typeof sample.redactedComment !== 'string'
  ) {
    return undefined;
  }

  return JSON.stringify([
    sample.category.trim(),
    sample.sanitizedSignal.trim(),
    sample.redactedComment.trim(),
  ]);
}

function isIsoDateString(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function validateGeneratedAtCoversSampleWindow(artifact, path) {
  const generatedAtMs = parseIsoTimestampMs(artifact.generatedAt);
  const endedAtMs = parseIsoTimestampMs(artifact.source?.sampleWindow?.endedAt);
  const exportedAtMs = parseIsoTimestampMs(artifact.source?.export?.exportedAt);
  if (generatedAtMs === undefined || endedAtMs === undefined) {
    return;
  }
  if (generatedAtMs < endedAtMs) {
    violations.push(`${path}: generatedAt must be greater than or equal to source.sampleWindow.endedAt`);
  }
  if (exportedAtMs === undefined) {
    return;
  }
  if (exportedAtMs < endedAtMs) {
    violations.push(`${path}: source.export.exportedAt must be greater than or equal to source.sampleWindow.endedAt`);
  }
  if (generatedAtMs < exportedAtMs) {
    violations.push(`${path}: generatedAt must be greater than or equal to source.export.exportedAt`);
  }
}

function validateSerializedPatterns(content, label) {
  for (const pattern of forbiddenSerializedPatterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(content)) {
      violations.push(`${label} must not contain sensitive ${pattern.label}`);
    }
    pattern.regex.lastIndex = 0;
  }
}

function parseIsoTimestampMs(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
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

function validateDirectArtifactPathGuards() {
  if (process.env.SUMMARY_FEEDBACK_DIRECT_PATH_GUARD_TEST === '1') {
    return;
  }

  const workspaceArtifactPath = resolve('summary-real-feedback-samples-direct-workspace-output.json');
  const workspaceResult = runSelfExpectingFailure({
    SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: workspaceArtifactPath,
  });
  if (workspaceResult.exitCode === 0) {
    violations.push('check:summary-feedback-hardening must reject workspace SUMMARY_REAL_FEEDBACK_SAMPLES_PATH');
  } else if (!workspaceResult.output.includes('SUMMARY_REAL_FEEDBACK_SAMPLES_PATH must not write release evidence into the git workspace')) {
    violations.push('check:summary-feedback-hardening workspace artifact rejection must explain evidence path policy');
  }
  if (existsSync(workspaceArtifactPath)) {
    violations.push(`check:summary-feedback-hardening workspace artifact rejection must not create ${workspaceArtifactPath}`);
  }

  const tempDirectory = mkdtempSync(join(tmpdir(), 'summary-feedback-direct-'));
  try {
    const publicArtifactPath = join(tempDirectory, 'summary-real-feedback-samples.json');
    writeFileSync(publicArtifactPath, '{}\n', { mode: 0o600 });
    chmodSync(publicArtifactPath, 0o644);
    const publicResult = runSelfExpectingFailure({
      SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: publicArtifactPath,
    });
    if (publicResult.exitCode === 0) {
      violations.push('check:summary-feedback-hardening must reject public SUMMARY_REAL_FEEDBACK_SAMPLES_PATH permissions');
    } else if (!publicResult.output.includes('SUMMARY_REAL_FEEDBACK_SAMPLES_PATH must use 0600-style private file permissions')) {
      violations.push('check:summary-feedback-hardening public artifact rejection must explain private file mode policy');
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function runSelfExpectingFailure(env) {
  try {
    execFileSync(process.execPath, [currentScriptPath], {
      env: {
        ...process.env,
        SUMMARY_FEEDBACK_DIRECT_PATH_GUARD_TEST: '1',
        ...env,
      },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
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
  if (!String(scripts[captureScript] ?? '').includes(captureScriptPath)) {
    violations.push(`${packagePath}: ${captureScript} must run ${captureScriptPath}`);
  }
  if (!String(scripts[dogfoodCaptureScript] ?? '').includes(dogfoodCaptureScriptPath)) {
    violations.push(`${packagePath}: ${dogfoodCaptureScript} must run ${dogfoodCaptureScriptPath}`);
  }
  if (!String(scripts[exportScript] ?? '').includes(exportScriptPath)) {
    violations.push(`${packagePath}: ${exportScript} must run ${exportScriptPath}`);
  }
  if (!scripts[captureCheckScript]) {
    violations.push(`${packagePath}: missing ${captureCheckScript}`);
  }
  const dogfoodCaptureSource = existsSync(dogfoodCaptureScriptPath)
    ? readFileSync(dogfoodCaptureScriptPath, 'utf8')
    : '';
  for (const marker of [
    'PrismaSummaryFeedbackRepository',
    'ExportSummaryFeedbackSamplesUseCase',
    'scripts/capture-summary-feedback-samples.mjs',
    'SUMMARY_FEEDBACK_REDACTED_INPUT_PATH',
    'internal_dogfood',
    'must not write release evidence into the git workspace',
  ]) {
    if (!dogfoodCaptureSource.includes(marker)) {
      violations.push(`${dogfoodCaptureScriptPath}: dogfood capture wrapper must include ${marker}`);
    }
  }
  for (const envName of requiredSummaryFeedbackExportEnv) {
    if (!new RegExp(`^${envName}=`, 'm').test(envExampleSource)) {
      violations.push(`${envExamplePath}: missing summary feedback export env ${envName}`);
    }
    if (new RegExp(`^${envName}=\\S`, 'm').test(envExampleSource)) {
      violations.push(`${envExamplePath}: summary feedback export env ${envName} must not commit a value`);
    }
  }
  const selfSource = readFileSync(currentScriptPath, 'utf8');
  for (const marker of [
    'readPrivateEvidenceJsonFile',
    'validateDirectArtifactPathGuards',
    '0600-style private file permissions',
  ]) {
    if (!selfSource.includes(marker)) {
      violations.push(`${currentScriptPath}: direct summary feedback artifact env path guard must include ${marker}`);
    }
  }
  if (!backendScripts.has(gateScript)) {
    violations.push(`${backendSafePath}: backend-safe verify must include ${gateScript}`);
  }
  if (!backendScripts.has(captureCheckScript)) {
    violations.push(`${backendSafePath}: backend-safe verify must include ${captureCheckScript}`);
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
