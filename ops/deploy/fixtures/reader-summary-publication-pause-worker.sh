#!/usr/bin/env bash
set -euo pipefail

date_flag=${1:?date flag is required}
report_dir=${READER_SUMMARY_DAILY_RUN_REPORT_DIR:?report directory is required}
expected_date=${READER_SUMMARY_DAILY_RUN_EXPECTED_DATE:?expected date is required}
ready=${READER_SUMMARY_DAILY_RUN_READY_FILE:?ready file is required}

[[ $date_flag == --today || $date_flag == --yesterday ]]
mkdir -p "$report_dir" "$(dirname "$ready")"
node - "$report_dir" "$expected_date" <<'NODE'
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const [reportDir, collectionDate] = process.argv.slice(2);
const report = {
  schemaVersion: 1,
  artifactFormat: 'reader-summary-production-day-run-v1',
  generatedBy: 'npm run run:reader-summary-production-day',
  requestedDate: collectionDate,
  collectionDate,
  model: {
    liveCollection: true,
    summaryModel: 'agent-runtime',
    physicalModel: 'gpt-5.5',
    reasoningEffort: 'xhigh',
    topicLabeler: 'agent-runtime',
    writesProductionData: true,
    allowDegraded: false,
    allowHistorical: false,
    rawProviderPayloadPersistedInReport: false,
    rawPostTextPersistedInReport: false,
  },
  inputs: {},
  run: {
    startedAt: `${collectionDate}T01:00:00.000Z`,
    completedAt: `${collectionDate}T01:01:00.000Z`,
  },
  failure: null,
  summary: {
    evidenceArtifactId: 'fixture-evidence',
    readerSummaryId: '11111111-1111-4111-8111-111111111111',
    readerSummaryJobId: '22222222-2222-4222-8222-222222222222',
    headline: 'Candidate must not publish before worker success',
  },
  steps: [
    {
      id: 'fixture-blocking-quality',
      command: 'fixture blocking quality',
      status: 'passed',
      durationMs: 1,
      exitCode: 0,
    },
  ],
  stats: {},
  qualityGates: { fixtureBlockingQualityPassed: true },
  blockingPassed: true,
};
const bytes = `${JSON.stringify(report, null, 2)}\n`;
writeFileSync(join(reportDir, 'reader-summary-production-day-run.v1.json'), bytes);
writeFileSync(
  join(reportDir, `reader-summary-production-day-run.${collectionDate}.v1.json`),
  bytes,
);
NODE

printf '%s\n' "$BASHPID" > "$ready"

case ${READER_SUMMARY_DAILY_RUN_WORKER_MODE:-pause} in
  success)
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
