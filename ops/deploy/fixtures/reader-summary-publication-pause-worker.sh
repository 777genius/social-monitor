#!/usr/bin/env bash
set -euo pipefail

date_flag=${1:?date flag is required}
report_dir=${READER_SUMMARY_DAILY_RUN_REPORT_DIR:?report directory is required}
expected_date=${READER_SUMMARY_DAILY_RUN_EXPECTED_DATE:?expected date is required}
ready=${READER_SUMMARY_DAILY_RUN_READY_FILE:?ready file is required}
worker_mode=${READER_SUMMARY_DAILY_RUN_WORKER_MODE:-pause}
publication_recovery_dir=${DURABLE_READER_SUMMARY_PUBLICATION_RECOVERY_DIR:?publication recovery directory is required}

[[ $date_flag == --today || $date_flag == --yesterday ]]
mkdir -p "$report_dir" "$(dirname "$ready")"
if [[ $worker_mode == success || $worker_mode == invalid || $worker_mode == pause ||
      $worker_mode == crash-after-db-before-filesystem ]]; then
  mkdir -p "$publication_recovery_dir"
  simulated_db_publication="$publication_recovery_dir/$expected_date.db-publication"
  if [[ ! -e $simulated_db_publication ]]; then
    printf '%s\n' \
      'job=22222222-2222-4222-8222-222222222222' \
      'artifact=11111111-1111-4111-8111-111111111111' \
      > "$simulated_db_publication"
    printf 'model-call\n' >> "$publication_recovery_dir/model-calls"
  fi
fi
if [[ $worker_mode == crash-after-db-before-filesystem ]]; then
  kill -KILL "$$"
fi
node - "$report_dir" "$expected_date" "$worker_mode" <<'NODE'
const { createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const [reportDir, collectionDate, workerMode] = process.argv.slice(2);
const startedAt = `${collectionDate}T00:00:00.000Z`;
const end = new Date(startedAt);
end.setUTCDate(end.getUTCDate() + 1);
const endedAt = end.toISOString();
const period = {
  cadence: 'daily',
  startedAt,
  endedAt,
  timezone: 'UTC',
  periodKey: `daily:${startedAt}:${endedAt}:UTC`,
};
if (workerMode === 'partial' || workerMode === 'unavailable') {
  const unavailable = workerMode === 'unavailable';
  const boundaries = {
    summaryModelCalled: false,
    topicModelCalled: false,
    summaryPublished: false,
    recollectionPerformedByOutcome: false,
  };
  const provider = {
    providerKey: 'reddit',
    state: workerMode,
    evidence: unavailable ? 'explicit_unavailable' : 'live_collection',
    databaseFeedItemCount: unavailable ? 0 : 45,
    collectionFeedItemCount: unavailable ? 0 : 45,
    minimumFeedItemCount: 50,
    reasonCodes: [
      unavailable ? 'provider_unavailable' : 'target_shortfall',
    ],
  };
  const outcome = {
    schemaVersion: 1,
    artifactFormat: 'reader-summary-production-day-outcome-v1',
    generatedBy: 'npm run run:reader-summary-production-day',
    generatedAt: `${collectionDate}T01:01:00.000Z`,
    requestedDate: collectionDate,
    outcome: workerMode,
    terminal: true,
    reason: unavailable
      ? 'verified_provider_unavailability'
      : 'bounded_provider_shortfall',
    boundaries,
    providerReadiness: {
      diagnosticsOwner: 'postgres_feed_items_published_window',
      providers: [provider],
    },
  };
  const report = {
    schemaVersion: 1,
    artifactFormat: 'reader-summary-production-day-run-v1',
    generatedBy: 'npm run run:reader-summary-production-day',
    requestedDate: collectionDate,
    collectionDate,
    failure: {
      code: 'collection_quality_failed',
      safeMessage: `Verified terminal provider outcome: ${workerMode}`,
    },
    model: boundaries,
    blockingPassed: false,
  };
  const reportBytes = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(
    join(reportDir, `reader-summary-production-day-outcome.${collectionDate}.v1.json`),
    `${JSON.stringify(outcome, null, 2)}\n`,
  );
  writeFileSync(
    join(reportDir, 'reader-summary-production-day-run.v1.json'),
    reportBytes,
  );
  writeFileSync(
    join(reportDir, `reader-summary-production-day-run.${collectionDate}.v1.json`),
    reportBytes,
  );
  process.exit(0);
}
const readerSummaryId = '11111111-1111-4111-8111-111111111111';
const readerSummaryJobId = '22222222-2222-4222-8222-222222222222';
const evidenceArtifactId = 'durable-reader-summary-postgres-evidence-v1';
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const captureExecution = {
  executionId: '55555555-5555-4555-8555-555555555555',
  startedAt: `${collectionDate}T01:00:00.000Z`,
  completedAt: `${collectionDate}T01:01:00.000Z`,
};
const executionAttestations = [
  {
    taskRole: 'summary',
    attempt: 'primary',
    normalizedOutputSha256: 'f'.repeat(64),
    attestation: {
      schemaVersion: 1,
      requestId: 'fixture-summary-request',
      purpose: 'social_monitor.reader_summary.generate',
      canonicalRequestSha256: 'a'.repeat(64),
      provider: 'codex',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'xhigh',
      runtimeEngine: 'subscription-runtime-cli',
      runtimePackageVersion: '0.1.0-main.2',
      launcherSha256: 'b'.repeat(64),
      selectedOutputKind: 'structured_output',
      selectedOutputSha256: 'c'.repeat(64),
    },
  },
  {
    taskRole: 'topic_label',
    attempt: '1',
    normalizedOutputSha256: '9'.repeat(64),
    attestation: {
      schemaVersion: 1,
      requestId: 'fixture-topic-label-request',
      purpose: 'social_monitor.reader_summary.topic_map.label',
      canonicalRequestSha256: 'd'.repeat(64),
      provider: 'codex',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'xhigh',
      runtimeEngine: 'subscription-runtime-cli',
      runtimePackageVersion: '0.1.0-main.2',
      launcherSha256: 'b'.repeat(64),
      selectedOutputKind: 'structured_output',
      selectedOutputSha256: 'e'.repeat(64),
    },
  },
];
const frontendContent = { topicMap: { generatedBy: 'agent-runtime' } };
const summaryContentSha256 = createHash('sha256')
  .update(stableJson(frontendContent))
  .digest('hex');
const topicMapSha256 = createHash('sha256')
  .update(stableJson(frontendContent.topicMap))
  .digest('hex');
const attestationSetSha256 = createHash('sha256')
  .update(stableJson(executionAttestations))
  .digest('hex');
const runtimeProvenance = {
  execution: 'attested',
  summaryModel: 'agent-runtime',
  physicalModel: 'gpt-5.6-sol',
  provider: 'codex',
  runtime: 'subscription-runtime-cli',
  runtimeVersion: '0.1.0-main.2',
  reasoningEffort: 'xhigh',
  launcherSha256: 'b'.repeat(64),
  summaryContentSha256,
  topicMapSha256,
  attestationSetSha256,
  completedTaskCount: executionAttestations.length,
  topicLabeler: {
    mode: 'agent-runtime',
    physicalModel: 'gpt-5.6-sol',
    provider: 'codex',
    runtime: 'subscription-runtime-cli',
    runtimeVersion: '0.1.0-main.2',
    reasoningEffort: 'xhigh',
    launcherSha256: 'b'.repeat(64),
  },
};
const frontend = {
  schemaVersion: 1,
  format: 'frontend-reader-summary-live-fixture-v1',
  generatedAt: `${collectionDate}T01:00:11.000Z`,
  readerSummaryArtifact: {
    readerSummaryId,
    period,
    lineage: {
      modelVersion: 'codex:gpt-5.6-sol:xhigh',
      providerVersion: 'agent-runtime',
    },
    content: frontendContent,
  },
  evidence: { readerSummaryId, readerSummaryJobId },
};
const frontendBytes = `${JSON.stringify(frontend, null, 2)}\n`;
const frontendPath = join(
  reportDir,
  `frontend-reader-summary-${collectionDate}.fixture.v1.json`,
);
writeFileSync(frontendPath, frontendBytes);
const frontendSha256 = createHash('sha256')
  .update(frontendBytes)
  .digest('hex');
writeFileSync(
  join(reportDir, `runtime-live-identity-${collectionDate}.v1.json`),
  `${JSON.stringify({
    schemaVersion: 1,
    format: 'reader-summary-runtime-live-identity-v1',
    checkedAt: `${collectionDate}T01:00:30.000Z`,
    status: 'serving',
    runtimeEngine: 'subscription-runtime-cli',
    runtimePackageVersion: '0.1.0-main.2',
    launcherSha256: 'b'.repeat(64),
  }, null, 2)}\n`,
);
const evidence = {
  schemaVersion: 1,
  artifactId: evidenceArtifactId,
  format: evidenceArtifactId,
  generatedAt: `${collectionDate}T01:00:00.000Z`,
  provenance: {
    runner: 'scripts/capture-durable-reader-summary-from-postgres.ts',
    fixtureOnly: false,
    database: 'postgres',
    modelMode: 'agent-runtime',
  },
  period,
  result: {
    readerSummaryId,
    readerSummaryJobId,
    status: 'completed',
    headline: 'Candidate must not publish before worker success',
    selectedFeedItemCount: 5,
    topReadCount: 3,
  },
  executionAttestations,
  durableReadback: {
    summaryContentSha256,
    topicMapSha256,
    executionAttestationSetSha256: attestationSetSha256,
  },
  captureExecution: {
    schemaVersion: 1,
    ...captureExecution,
    runtimeHealth: {
      status: 'serving',
      runtimeEngine: 'subscription-runtime-cli',
      runtimeVersion: '0.1.0-main.2',
      launcherSha256: 'b'.repeat(64),
      checkedAt: `${collectionDate}T01:00:30.000Z`,
    },
    frontendArtifact: {
      format: frontend.format,
      sha256: frontendSha256,
      byteLength: Buffer.byteLength(frontendBytes),
      generatedAt: frontend.generatedAt,
    },
    runtimeResult: runtimeProvenance,
  },
};
const evidenceBytes = `${JSON.stringify(evidence, null, 2)}\n`;
const evidencePath = join(
  reportDir,
  `durable-reader-summary-${collectionDate}.v1.json`,
);
writeFileSync(evidencePath, evidenceBytes);
const evidenceSha256 = createHash('sha256').update(evidenceBytes).digest('hex');
const evidenceBinding = {
  artifactId: evidenceArtifactId,
  sha256: evidenceSha256,
  byteLength: Buffer.byteLength(evidenceBytes),
  readerSummaryId,
  readerSummaryJobId,
  requestedUtcPeriod: period,
  captureExecution: {
    ...captureExecution,
    evidenceGeneratedAt: evidence.generatedAt,
    frontendGeneratedAt: frontend.generatedAt,
    frontendArtifactFormat: frontend.format,
    frontendArtifactSha256: frontendSha256,
    frontendArtifactByteLength: Buffer.byteLength(frontendBytes),
    runtimeHealthCheckedAt: evidence.captureExecution.runtimeHealth.checkedAt,
    runtimeEngine: evidence.captureExecution.runtimeHealth.runtimeEngine,
    runtimeVersion: evidence.captureExecution.runtimeHealth.runtimeVersion,
    runtimeLauncherSha256:
      evidence.captureExecution.runtimeHealth.launcherSha256,
  },
  runtimeProvenance,
};
const stepIds = [
  'collect',
  'collection-quality',
  'durable-reader-summary',
  'artifact-quality',
  'quality-dashboard',
  'top-read-ranking',
  'source-quality-trace',
  'clean-day-e2e',
];
const report = {
  schemaVersion: 1,
  artifactFormat: 'reader-summary-production-day-run-v1',
  generatedBy: 'npm run run:reader-summary-production-day',
  requestedDate: collectionDate,
  collectionDate,
  reportIdentity: {
    artifactId: [
      'reader-summary-production-day-run-v1',
      collectionDate,
      readerSummaryId,
      readerSummaryJobId,
      evidenceArtifactId,
      evidenceSha256,
      frontendSha256,
      captureExecution.executionId,
    ].join('/'),
    requestedDate: collectionDate,
    readerSummaryId,
    readerSummaryJobId,
    evidenceArtifactId,
    evidenceArtifactSha256: evidenceSha256,
    frontendArtifactSha256: frontendSha256,
    captureExecutionId: captureExecution.executionId,
    requestedUtcPeriod: period,
  },
  provenance: {
    mode: 'live-production',
    nonLive: false,
    requestedUtcPeriod: period,
    collectionUtcPeriod: period,
    sourceReport: null,
    sourceEvidence: evidenceBinding,
  },
  model: {
    liveCollection: true,
    reusedCollection: false,
    freshSummaryCapture: true,
    runtimeExecution: runtimeProvenance.execution,
    runtimeExecutionReason: null,
    summaryModel: runtimeProvenance.summaryModel,
    physicalModel: runtimeProvenance.physicalModel,
    provider: runtimeProvenance.provider,
    runtime: runtimeProvenance.runtime,
    runtimeVersion: runtimeProvenance.runtimeVersion,
    reasoningEffort: runtimeProvenance.reasoningEffort,
    launcherSha256: runtimeProvenance.launcherSha256,
    summaryContentSha256: runtimeProvenance.summaryContentSha256,
    topicMapSha256: runtimeProvenance.topicMapSha256,
    attestationSetSha256: runtimeProvenance.attestationSetSha256,
    completedTaskCount: runtimeProvenance.completedTaskCount,
    topicLabeler: runtimeProvenance.topicLabeler,
    writesProductionData: true,
    allowDegraded: false,
    allowHistorical: false,
    rawProviderPayloadPersistedInReport: false,
    rawPostTextPersistedInReport: false,
  },
  inputs: {
    periodStartedAt: period.startedAt,
    periodEndedAt: period.endedAt,
    timezone: period.timezone,
    periodKey: period.periodKey,
    evidenceArtifactId,
    frontendArtifactFormat: frontend.format,
  },
  run: {
    startedAt: `${collectionDate}T01:00:00.000Z`,
    completedAt: `${collectionDate}T01:01:00.000Z`,
    captureExecution,
  },
  failure: null,
  summary: {
    evidenceArtifactId,
    evidenceArtifactSha256: evidenceSha256,
    evidenceArtifactByteLength: evidenceBinding.byteLength,
    requestedUtcPeriod: period,
    readerSummaryId,
    readerSummaryJobId,
    captureExecution: evidenceBinding.captureExecution,
    runtimeProvenance,
    headline: 'Candidate must not publish before worker success',
  },
  steps: stepIds.map((id) => ({
      id,
      command: `npm run fixture:${id}`,
      status: 'passed',
      durationMs: 1,
      exitCode: 0,
    })),
  stats: {},
  qualityGates: {
    exactRequiredStepsExecutedOnceAndPassed: true,
    durableSummaryPersistedAndUuidBound: true,
    evidenceArtifactContentHashBound: true,
    freshEvidenceAndFrontendArtifactsHashBound: true,
    productionDefinitionOfDoneSatisfied: true,
    strictLiveProductionControls: true,
    subscriptionRuntimeProvenanceVerified: true,
    topicLabelerProvenanceVerified: true,
    provenanceMatchesExecutionMode: true,
    reportUtcWindowMatchesRequestedDate: true,
    collectionInputProvenanceSatisfied: true,
    regenerationDatasetGuardVerified: true,
    fixtureBlockingQualityPassed: true,
  },
  blockingPassed: true,
};
const bytes = `${JSON.stringify(report, null, 2)}\n`;
writeFileSync(join(reportDir, 'reader-summary-production-day-run.v1.json'), bytes);
writeFileSync(
  join(reportDir, `reader-summary-production-day-run.${collectionDate}.v1.json`),
  bytes,
);
NODE

printf '%s\n' "$$" > "$ready"

case $worker_mode in
  success|partial|unavailable)
    exit 0
    ;;
  invalid)
    node - "$report_dir" "$expected_date" <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const [reportDir, collectionDate] = process.argv.slice(2);
for (const filename of [
  'reader-summary-production-day-run.v1.json',
  `reader-summary-production-day-run.${collectionDate}.v1.json`,
]) {
  const path = join(reportDir, filename);
  const report = JSON.parse(readFileSync(path, 'utf8'));
  report.qualityGates.fixtureBlockingQualityPassed = false;
  report.blockingPassed = false;
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
NODE
    exit 0
    ;;
  pause) ;;
  *)
    echo 'unsupported fixture worker mode' >&2
    exit 64
    ;;
esac

trap '' TERM

while true; do
  sleep 0.1
done
