import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateArtifactProvenance, validateSampleSource, validateSampleRedaction,
  validateSampleRollup, incrementCount, validateRedactedSample,
  validateRealSampleDoesNotCopyFixtureExample, validateSerializedArtifact,
  validateSerializedArtifactContent,
} from './summary-feedback-redacted-sample-policy.mjs';
import {
  validateEvidenceArtifactProvenance, validateRealEvidenceIdentityStrings,
} from './evidence-provenance.mjs';
import { isIsoDateString } from './summary-feedback-evidence-values.mjs';

const startedAt = '2026-11-08T12:00:00Z';
const endedAt = '2026-11-08T12:30:00Z';
const redactionFlags = {
  rawProviderPayloadsIncluded: false, piiIncluded: false,
  rawPromptTextIncluded: false, rawSourceTextIncluded: false,
  tokenValuesIncluded: false, secretUrlsIncluded: false,
  commentsAreSyntheticOrRedacted: true,
};
const signals = new Set(['claimsChecked', 'citationsChecked', 'costChecked', 'staleMarkerChecked']);

function context(violations = [], calls = []) {
  return {
    violations, redactedSampleEvidenceKind: 'redacted_real_feedback_samples',
    validateEvidenceArtifactProvenance, validateRealEvidenceIdentityStrings,
    allowedRealSampleSourceKinds: new Set(['internal_dogfood', 'private_beta']),
    forbiddenRealSourceFragments: ['example', 'fixture', 'synthetic', 'mock', 'test'],
    isIsoDateString,
    requiredSampleRedactionFlags: redactionFlags,
    knownFixtureSampleGuards: { feedbackIds: new Set(), signalFingerprints: new Set() },
    sampleSignalFingerprint: (sample) => sample.sanitizedSignal + '|' + sample.redactedComment,
    allowedSampleCategories: new Set(['low_relevance', 'wrong_fact', 'bad_citation']),
    allowedSampleClassifications: new Set(['blocker', 'accepted_mvp_gap']),
    allowedSampleSeverities: new Set(['blocker', 'accepted_gap']),
    forbiddenSerializedFragments: ['bearer ', 'access_token', 'private_key'],
    requiredSampleSignals: signals,
    allowedActionTypes: new Set(['eval_fixture', 'validator_change', 'runbook_action']),
    validateCommand: (...args) => calls.push(['command', ...args]),
    requireExistingPath: (...args) => calls.push(['path', ...args]),
    evalFixtureIds: new Set(['fixture-1']),
    costFixtureIds: new Set(['fixture-1']),
    evalOutputPath: 'ops/evals/summary-eval-output.json',
    costPath: 'ops/cost/summary-cost-attribution.json',
    forbiddenSampleKeys: new Set(['access_token', 'accesstoken', 'rawpayload', 'private_key']),
    validateSerializedPatterns: (...args) => calls.push(['patterns', ...args]),
  };
}
function source() {
  return {
    kind: 'internal_dogfood', environmentId: 'staging-alpha', operator: 'security-owner',
    collectionMethod: 'Protected staging feedback collection without raw comments',
    redactedBy: 'privacy-owner', approvedBy: 'quality-owner', sampleCount: 1,
    sampleWindow: { startedAt, endedAt },
    export: {
      sourceSystem: 'internal-feedback', exportId: 'run-20261108', exportedAt: endedAt,
      reviewQueue: 'feedback-review', redactionReviewId: 'review-1',
      approvalReference: 'approval-1',
    },
  };
}
function sample() {
  return {
    feedbackId: 'feedback-1', category: 'low_relevance', classification: 'blocker',
    severity: 'blocker', triageOwner: 'quality-owner', eligibleForEvalFixture: false,
    releaseBlocking: true, summaryEvidence: { summaryId: 'summary-1', interestId: 'interest-1' },
    sanitizedSignal: 'Redacted quality signal with sufficient evidence detail.',
    redactedComment: 'An operator comment with all identifiers safely redacted.',
    qualitySignals: Object.fromEntries([...signals].map((key) => [key, true])),
    hardeningAction: {
      actionType: 'validator_change', status: 'passed',
      command: 'npm run check:summary-quality-loop',
      artifact: 'ops/release/redacted-summary-proof.json',
      exitCondition: 'The quality gate must pass without raw secrets.',
      fixtureIds: [],
    },
  };
}
function rollup() {
  return {
    sampleCount: 1, categoryCounts: { low_relevance: 1 },
    classificationCounts: { blocker: 1 }, severityCounts: { blocker: 1 },
    actionTypeCounts: { validator_change: 1 },
    releaseBlockingSamples: 1, evalFixtureEligibleSamples: 0,
    blockerSampleIds: ['feedback-1'],
  };
}
function inputCounts() {
  return {
    categoryCounts: new Map([['low_relevance', 1]]),
    classificationCounts: new Map([['blocker', 1]]),
    severityCounts: new Map([['blocker', 1]]),
    actionTypeCounts: new Map([['validator_change', 1]]),
    releaseBlockingSamples: 1,
    evalFixtureEligibleSamples: 0,
  };
}

test('fixture provenance retains shared provenance validator semantics', () => {
  const ctx = context();
  validateArtifactProvenance({
    evidenceKind: 'fixture_example', collectionMethod: 'fixture export',
    runner: 'scripts/check-summary-feedback-hardening.mjs', fixtureOnly: true,
  }, 'artifact', { allowExample: true }, ctx);
  assert.deepEqual(ctx.violations, []);
});
test('real provenance rejects forbidden fixture markers', () => {
  const ctx = context();
  validateArtifactProvenance({
    evidenceKind: 'redacted_real_feedback_samples',
    collectionMethod: 'mock real feedback export',
    runner: 'scripts/capture-feedback.mjs', fixtureOnly: false,
  }, 'artifact', { allowExample: false }, ctx);
  assert.ok(ctx.violations.some((message) => message.includes('"mock"')));
});
test('valid fixture source retains its window and export traceability', () => {
  const data = source(), snapshot = globalThis.structuredClone(data), ctx = context();
  validateSampleSource(data, 'artifact', { allowExample: true }, ctx);
  assert.deepEqual(ctx.violations, []);
  assert.deepEqual(data, snapshot);
});
test('valid real source passes source-kind and identity checks', () => {
  const ctx = context();
  validateSampleSource(source(), 'artifact', { allowExample: false }, ctx);
  assert.deepEqual(ctx.violations, []);
});
test('null source fails closed with exact object diagnostic', () => {
  const ctx = context();
  validateSampleSource(null, 'artifact', {}, ctx);
  assert.deepEqual(ctx.violations, ['artifact: source must be an object']);
});
test('unsupported real source and mock identity are rejected', () => {
  const ctx = context(), data = source();
  data.kind = 'fixture_example';
  data.environmentId = 'mock-host';
  validateSampleSource(data, 'artifact', { allowExample: false }, ctx);
  assert.ok(ctx.violations.some((x) => x.includes('real sample source.kind must be one of')));
  assert.ok(ctx.violations.some((x) => x.includes('"fixture"')));
  assert.ok(ctx.violations.some((x) => x.includes('"mock"')));
});
test('source time-window, sample count and export date errors accumulate in order', () => {
  const ctx = context(), data = source();
  data.sampleCount = 0;
  data.sampleWindow = { startedAt: endedAt, endedAt: startedAt };
  data.export.exportedAt = 'invalid';
  validateSampleSource(data, 'artifact', { allowExample: true }, ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: source.sampleCount must be a positive integer',
    'artifact: source.sampleWindow.startedAt must be before endedAt',
    'artifact: source.export.exportedAt must be an ISO timestamp',
  ]);
});
test('redaction flags and explanation reject raw content without mutation', () => {
  const ctx = context();
  const data = { ...redactionFlags, method: 'Redacted protected comments and identifiers before output.' };
  validateSampleRedaction(data, 'artifact', ctx);
  assert.deepEqual(ctx.violations, []);
  data.rawProviderPayloadsIncluded = true;
  data.method = 'short';
  validateSampleRedaction(data, 'artifact', ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: redaction.rawProviderPayloadsIncluded must be false',
    'artifact: redaction.method must describe how comments and identifiers were redacted',
  ]);
});
test('canonical rollup preserves original count maps and blocker IDs', () => {
  const ctx = context(), data = rollup(), snapshot = globalThis.structuredClone(data);
  validateSampleRollup(data, 'artifact', 1, new Set(['feedback-1']), inputCounts(), ctx);
  assert.deepEqual(ctx.violations, []);
  assert.deepEqual(data, snapshot);
});
test('duplicate and unknown blockers plus extra count keys reject', () => {
  const ctx = context(), data = rollup();
  data.categoryCounts.extra = 2;
  data.blockerSampleIds = ['feedback-1', 'feedback-1', 'other'];
  validateSampleRollup(data, 'artifact', 1, new Set(['feedback-1']), inputCounts(), ctx);
  assert.ok(ctx.violations.includes('artifact: rollup.categoryCounts.extra is not present in samples'));
  assert.ok(ctx.violations.includes('artifact: rollup.blockerSampleIds must not contain duplicates'));
  assert.ok(ctx.violations.includes('artifact: rollup.blockerSampleIds contains non-blocker sample "other"'));
});
test('invalid rollup fails closed and retains earlier violations', () => {
  const ctx = context(['prior']);
  validateSampleRollup(null, 'artifact', 1, new Set(), inputCounts(), ctx);
  assert.deepEqual(ctx.violations, ['prior', 'artifact: rollup must be an object']);
});
test('incrementCount maintains insertion order and duplicate totals', () => {
  const counts = new Map();
  incrementCount(counts, 'a'); incrementCount(counts, 'a'); incrementCount(counts, 'b');
  assert.deepEqual([...counts], [['a', 2], ['b', 1]]);
});
test('valid redacted sample delegates original command and artifact path checks', () => {
  const calls = [], ctx = context([], calls), data = sample();
  const snapshot = globalThis.structuredClone(data);
  validateRedactedSample(data, 'sample', new Set(), ctx);
  assert.deepEqual(ctx.violations, []);
  assert.deepEqual(data, snapshot);
  assert.deepEqual(calls.map((x) => x[0]), ['command', 'path']);
});
test('duplicate feedback IDs, unsupported category and nonblocking sample reject', () => {
  const ctx = context(), data = sample();
  data.category = 'unknown';
  data.releaseBlocking = false;
  validateRedactedSample(data, 'sample', new Set(['feedback-1']), ctx);
  assert.ok(ctx.violations.includes('sample: duplicate feedbackId "feedback-1"'));
  assert.ok(ctx.violations.includes('sample: unsupported category "unknown"'));
  assert.ok(ctx.violations.includes('sample: releaseBlocking must be true'));
});
test('nested forbidden fields retain ordered diagnostic traversal', () => {
  const ctx = context(), data = sample();
  data.summaryEvidence.extra = [{ 'raw-payload': 'redacted' }, { 'access-token': 'redacted' }];
  validateRedactedSample(data, 'sample', new Set(), ctx);
  assert.deepEqual(ctx.violations.slice(0, 2), [
    'sample: forbidden sensitive field "raw-payload"',
    'sample: forbidden sensitive field "access-token"',
  ]);
});
test('wrong-fact category requires explicit source and citation identity fields', () => {
  const ctx = context(), data = sample();
  data.category = 'wrong_fact';
  validateRedactedSample(data, 'sample', new Set(), ctx);
  assert.deepEqual(ctx.violations.filter((x) => x.includes('is required for wrong_fact')), [
    'sample: summaryEvidence.citationId is required for wrong_fact',
    'sample: summaryEvidence.feedItemId is required for wrong_fact',
    'sample: summaryEvidence.sourceItemId is required for wrong_fact',
    'sample: summaryEvidence.providerKey is required for wrong_fact',
  ]);
});
test('sensitive text, incomplete quality and pending hardening action fail closed', () => {
  const ctx = context(), data = sample();
  data.sanitizedSignal = 'Bearer should-never-appear-in-redacted-logs';
  data.qualitySignals.claimsChecked = false;
  data.hardeningAction.status = 'pending';
  validateRedactedSample(data, 'sample', new Set(), ctx);
  assert.ok(ctx.violations.includes('sample.sanitizedSignal must not contain "bearer "'));
  assert.ok(ctx.violations.includes('sample: qualitySignals.claimsChecked must be true'));
  assert.ok(ctx.violations.includes('sample: hardeningAction.status must be passed for redacted samples'));
});
test('real feedback cannot reuse fixture ID or exact signal fingerprint', () => {
  const ctx = context(), data = sample();
  ctx.knownFixtureSampleGuards.feedbackIds.add(data.feedbackId);
  ctx.knownFixtureSampleGuards.signalFingerprints.add(ctx.sampleSignalFingerprint(data));
  validateRealSampleDoesNotCopyFixtureExample(data, 'sample', ctx);
  assert.deepEqual(ctx.violations, [
    'sample: real feedback sample must not reuse fixture sample id "feedback-1"',
    'sample: real feedback sample must not copy fixture sample signal text',
  ]);
});
test('serialized redacted artifact rejects forbidden literals and invokes the original pattern gate', () => {
  const calls = [], ctx = context([], calls);
  validateSerializedArtifact({ message: 'Bearer redacted-value' }, 'artifact', ctx);
  assert.ok(ctx.violations.includes('artifact: redacted sample artifact must not contain "bearer "'));
  assert.deepEqual(calls.map((item) => item[0]), ['patterns']);
});

test('raw serialized evidence passes the same pre-parse privacy and regex gates', () => {
  const calls = [], ctx = context([], calls);
  validateSerializedArtifactContent('{"message":"Bearer raw-secret"}', 'artifact', ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: redacted sample artifact must not contain "bearer "',
  ]);
  assert.deepEqual(calls.map((item) => item[0]), ['patterns']);
});
