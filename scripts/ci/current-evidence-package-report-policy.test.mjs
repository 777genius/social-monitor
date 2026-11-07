import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCurrentEvidencePackageReport } from '../lib/current-evidence-package-report-policy.mjs';

const commitSha = 'a'.repeat(40);
const digest = 'f'.repeat(64);
const requiredArtifacts = [
  'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH',
  'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH',
  'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH',
  'RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH',
  'SECURITY_FINAL_SWEEP_ARTIFACT_PATH',
  'SUMMARY_REAL_FEEDBACK_SAMPLES_PATH',
];

/** Build a complete deterministic report fixture for validation tests. */
function validReport() {
  return {
    artifactFormat: 'external-beta-current-evidence-package-v1',
    inputPolicy: { secretValuesIncluded: false, secretEnvNamesWithheld: ['DATABASE_URL', 'INFINITY_CONTEXT_TOKEN'] },
    commitPolicy: { expectedCommitSha: commitSha, packagedCommitSha: commitSha },
    artifactIntegrity: {
      inputEnvFiles: Array.from({ length: 7 }, () => ({ sha256: digest, sizeBytes: 1 })),
      packagedEvidenceArtifacts: requiredArtifacts.map((envName) => ({ envName, sha256: digest, sizeBytes: 1 })),
    },
    remaining: {
      requiredEnv: [],
      activeBlockerJobs: [],
      requiredAlternativeGroups: [{
        jobId: 'live-reddit-oauth',
        label: 'reddit_refresh_token_flow',
        missingEnv: ['REDDIT_REFRESH_TOKEN'],
      }],
    },
    readiness: { activeExternalEvidenceBlockerJobCount: 0 },
  };
}

/** Collect validator diagnostics without changing the supplied report. */
function diagnose(report, expectedCommit = commitSha) {
  const violations = [];
  validateCurrentEvidencePackageReport(report, expectedCommit, violations);
  return violations;
}

test('accepts a complete local package report without diagnostics', () => {
  assert.deepEqual(diagnose(validReport()), []);
});

test('preserves original format, secret and commit violation order', () => {
  const report = validReport();
  report.artifactFormat = 'unknown';
  report.inputPolicy.secretValuesIncluded = true;
  report.commitPolicy.packagedCommitSha = 'b'.repeat(40);
  assert.deepEqual(diagnose(report), [
    'current evidence package report must use the expected artifact format',
    'current evidence package report must state that secret values are excluded',
    'current evidence package report must expose the expected and packaged commit SHA',
  ]);
});

test('rejects wrong integrity record counts and retains missing artifact diagnostics', () => {
  const report = validReport();
  report.artifactIntegrity.inputEnvFiles = [];
  report.artifactIntegrity.packagedEvidenceArtifacts = [];
  const errors = diagnose(report);
  assert.equal(errors[0], 'current evidence package report must include input env file integrity records');
  assert.equal(errors[1], 'current evidence package report must include packaged evidence artifact integrity records');
  assert.equal(errors.length, 2 + requiredArtifacts.length);
  assert.ok(errors.includes('current evidence package report must hash security final sweep evidence artifact'));
});

test('rejects invalid hashes and sizes once, including a zero byte count', () => {
  const report = validReport();
  report.artifactIntegrity.inputEnvFiles[0].sha256 = 'UPPERCASE';
  report.artifactIntegrity.packagedEvidenceArtifacts[0].sizeBytes = 0;
  assert.deepEqual(diagnose(report), [
    'current evidence package integrity records must include sha256 and positive sizeBytes',
  ]);
});

test('preserves the specific diagnostic for every missing artifact name', () => {
  const original = diagnose(validReport());
  assert.deepEqual(original, []);
  const expected = [
    'current evidence package report must hash live-open evidence artifact',
    'current evidence package report must hash GitHub Repo Radar evidence artifact',
    'current evidence package report must hash GitHub Trending Page evidence artifact',
    'current evidence package report must hash relevance memory canary evidence artifact',
    'current evidence package report must hash security final sweep evidence artifact',
    'current evidence package report must hash summary feedback sample evidence artifact',
  ];
  for (let index = 0; index < requiredArtifacts.length; index += 1) {
    const report = validReport();
    report.artifactIntegrity.packagedEvidenceArtifacts.splice(index, 1);
    assert.deepEqual(diagnose(report), [expected[index]]);
  }
});

test('preserves withheld-secret and remaining work diagnostics', () => {
  const report = validReport();
  report.inputPolicy.secretEnvNamesWithheld = [];
  report.remaining.requiredEnv = undefined;
  report.remaining.activeBlockerJobs = null;
  report.readiness.activeExternalEvidenceBlockerJobCount = '0';
  assert.deepEqual(diagnose(report), [
    'current evidence package report must list withheld DATABASE_URL',
    'current evidence package report must list withheld INFINITY_CONTEXT_TOKEN',
    'current evidence package report must include remaining required env names',
    'current evidence package report must include active external evidence blocker count',
    'current evidence package report must include active blocker jobs',
  ]);
});

test('preserves missing, invalid and incomplete Reddit refresh alternatives', () => {
  const report = validReport();
  report.remaining.requiredAlternativeGroups = {};
  assert.deepEqual(diagnose(report), [
    'current evidence package report must include remaining required alternative groups',
  ]);
  report.remaining.requiredAlternativeGroups = [];
  assert.deepEqual(diagnose(report), [
    'current evidence package report must expose Reddit refresh-token alternative when Reddit evidence is missing',
  ]);
  report.remaining.requiredAlternativeGroups = [{
    jobId: 'live-reddit-oauth', label: 'reddit_refresh_token_flow', missingEnv: [],
  }];
  assert.deepEqual(diagnose(report), [
    'current evidence package report must mark missing Reddit refresh token in the refresh-token alternative',
  ]);
});

test('does not mutate the report or its nested integrity records', () => {
  const report = validReport();
  const before = JSON.stringify(report);
  diagnose(report);
  assert.equal(JSON.stringify(report), before);
});

test('preserves the original TypeError on a null report', () => {
  assert.throws(() => diagnose(null), TypeError);
});
