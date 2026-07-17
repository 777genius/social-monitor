#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const options = parseOptions(process.argv.slice(2));
const expectedDate = requiredOption(options, '--expected-date');
const datedReportPath = requiredOption(options, '--dated-report');
assertDate(expectedDate);

const datedReportBytes = readFileSync(datedReportPath);
const report = parseJson(datedReportBytes, datedReportPath);
validateReport(report, expectedDate);

const latestCandidatePath = options.get('--latest-candidate');
if (latestCandidatePath !== undefined) {
  const latestCandidateBytes = readFileSync(latestCandidatePath);
  if (!latestCandidateBytes.equals(datedReportBytes)) {
    fail('latest candidate bytes do not match the exact dated report');
  }
}

const expectedProof = buildProof({
  report,
  reportBytes: datedReportBytes,
  reportFilename: basename(datedReportPath),
  expectedDate,
});
const proofOutPath = options.get('--proof-out');
const proofPath = options.get('--proof');
if ((proofOutPath === undefined) === (proofPath === undefined)) {
  fail('provide exactly one of --proof-out or --proof');
}

if (proofOutPath !== undefined) {
  writeFileSync(proofOutPath, `${stableJson(expectedProof)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o444,
  });
} else {
  const proof = parseJson(readFileSync(proofPath), proofPath);
  if (stableJson(proof) !== stableJson(expectedProof)) {
    fail('publication proof does not exactly bind the dated report');
  }
}

console.log(
  `Reader summary production-day publication proof OK (${expectedDate}, ${expectedProof.reportSha256})`,
);

function validateReport(report, expectedDate) {
  assertObject(report, 'report');
  if (
    report.schemaVersion !== 1 ||
    report.artifactFormat !== 'reader-summary-production-day-run-v1' ||
    report.generatedBy !== 'npm run run:reader-summary-production-day' ||
    report.requestedDate !== expectedDate ||
    report.collectionDate !== expectedDate ||
    report.blockingPassed !== true ||
    report.failure !== null
  ) {
    fail('dated production-day report identity or blocking result is invalid');
  }

  assertObject(report.model, 'report.model');
  if (
    report.model.writesProductionData !== true ||
    report.model.rawProviderPayloadPersistedInReport !== false ||
    report.model.rawPostTextPersistedInReport !== false
  ) {
    fail('dated production-day report model safety proof is invalid');
  }

  assertObject(report.qualityGates, 'report.qualityGates');
  const gateNames = Object.keys(report.qualityGates);
  if (
    gateNames.length === 0 ||
    gateNames.some((name) => report.qualityGates[name] !== true)
  ) {
    fail('dated production-day report has a missing or failed quality gate');
  }

  if (
    !Array.isArray(report.steps) ||
    report.steps.length === 0 ||
    report.steps.some(
      (step) =>
        !isObject(step) ||
        (step.status !== 'passed' && step.status !== 'skipped'),
    )
  ) {
    fail('dated production-day report has an invalid blocking step result');
  }

  assertObject(report.summary, 'report.summary');
  assertUuid(report.summary.readerSummaryId, 'report.summary.readerSummaryId');
  assertUuid(report.summary.readerSummaryJobId, 'report.summary.readerSummaryJobId');
}

function buildProof({ report, reportBytes, reportFilename, expectedDate }) {
  return {
    schemaVersion: 1,
    artifactFormat: 'reader-summary-production-day-publication-proof-v1',
    collectionDate: expectedDate,
    reportFilename,
    reportByteLength: reportBytes.byteLength,
    reportSha256: createHash('sha256').update(reportBytes).digest('hex'),
    readerSummaryId: report.summary.readerSummaryId,
    readerSummaryJobId: report.summary.readerSummaryJobId,
    qualityGateNames: Object.keys(report.qualityGates).sort(),
    blockingPassed: true,
  };
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseOptions(args) {
  const result = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (name === undefined || value === undefined || !name.startsWith('--')) {
      fail('publication verifier options must be --name value pairs');
    }
    if (result.has(name)) {
      fail(`duplicate option: ${name}`);
    }
    result.set(name, value);
  }
  return result;
}

function requiredOption(options, name) {
  const value = options.get(name);
  if (value === undefined || value.length === 0) {
    fail(`missing required option: ${name}`);
  }
  return value;
}

function parseJson(bytes, path) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(`${path} is not valid JSON`);
  }
}

function assertDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail('expected date must use YYYY-MM-DD');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail('expected date is invalid');
  }
}

function assertUuid(value, name) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    fail(`${name} must be a UUID`);
  }
}

function assertObject(value, name) {
  if (!isObject(value)) {
    fail(`${name} must be an object`);
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message) {
  throw new Error(message);
}
