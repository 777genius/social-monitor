#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const stateArtifactFormat = "reader-summary-production-day-state-v1";
const proofArtifactFormat =
  "reader-summary-production-day-publication-proof-v1";
const outcomeArtifactFormat = "reader-summary-production-day-outcome-v1";
const reportArtifactFormat = "reader-summary-production-day-run-v1";
const reportGeneratedBy = "npm run run:reader-summary-production-day";
const options = parseOptions(process.argv.slice(2));

if (options.has("--latest-state")) {
  assertOnlyOptions(options, ["--latest-state", "--state-dir"]);
  const latestPath = requiredOption(options, "--latest-state");
  const stateDirectory = requiredOption(options, "--state-dir");
  const latestBytes = readFileSync(latestPath);
  const state = validateState(parseJson(latestBytes, latestPath));
  const datedPath = join(stateDirectory, stateFilename(state.requestedDate));
  const datedBytes = readFileSync(datedPath);
  if (!latestBytes.equals(datedBytes)) {
    fail("latest state does not exactly match its immutable dated state");
  }
  validateBinding(state, join(stateDirectory, state.binding.filename));
  process.stdout.write(state.requestedDate);
  process.exit(0);
}

if (options.has("--dated-state")) {
  assertOnlyOptions(options, ["--dated-state", "--state-dir"]);
  const datedPath = requiredOption(options, "--dated-state");
  const stateDirectory = requiredOption(options, "--state-dir");
  const state = validateState(parseJson(readFileSync(datedPath), datedPath));
  if (basename(datedPath) !== stateFilename(state.requestedDate)) {
    fail("dated state filename does not match its requested date");
  }
  validateBinding(state, join(stateDirectory, state.binding.filename));
  process.stdout.write(state.requestedDate);
  process.exit(0);
}

if (options.has("--legacy-latest")) {
  assertOnlyOptions(options, [
    "--legacy-latest",
    "--state-dir",
    "--state-out",
  ]);
  const latestPath = requiredOption(options, "--legacy-latest");
  const stateDirectory = requiredOption(options, "--state-dir");
  const stateOutPath = requiredOption(options, "--state-out");
  const legacy = validateLegacyPublication(latestPath, stateDirectory);
  writeState(stateOutPath, buildState(
    legacy.requestedDate,
    legacy.proofPath,
    true,
  ));
  process.stdout.write(legacy.requestedDate);
  process.exit(0);
}

assertOnlyOptions(options, [
  "--expected-date",
  "--publication-proof",
  "--state",
  "--state-out",
  "--terminal-outcome",
]);
const expectedDate = requiredOption(options, "--expected-date");
assertDate(expectedDate);
const proofPath = options.get("--publication-proof");
const outcomePath = options.get("--terminal-outcome");
if ((proofPath === undefined) === (outcomePath === undefined)) {
  fail("provide exactly one publication proof or terminal outcome");
}
const statePath = options.get("--state");
const stateOutPath = options.get("--state-out");
if ((statePath === undefined) === (stateOutPath === undefined)) {
  fail("provide exactly one of --state or --state-out");
}

const bindingPath = proofPath ?? outcomePath;
const state = buildState(expectedDate, bindingPath, proofPath !== undefined);
if (stateOutPath !== undefined) {
  writeState(stateOutPath, state);
} else {
  const actual = validateState(parseJson(readFileSync(statePath), statePath));
  if (stableJson(actual) !== stableJson(state)) {
    fail("day state does not exactly bind its verified terminal artifact");
  }
}
console.log(
  `Reader summary production-day state OK (${expectedDate}, ${state.state})`,
);

function validateLegacyPublication(latestPath, stateDirectory) {
  const latestBytes = readFileSync(latestPath);
  const report = parseJson(latestBytes, latestPath);
  assertObject(report, "legacy latest report");
  assertDate(report.requestedDate);
  const requestedDate = report.requestedDate;
  const datedPath = join(stateDirectory, reportFilename(requestedDate));
  const proofPath = join(stateDirectory, proofFilename(requestedDate));
  const datedBytes = readFileSync(datedPath);
  if (!latestBytes.equals(datedBytes)) {
    fail("legacy latest report does not exactly match its dated publication");
  }
  const { proof } = validateProof(
    parseJson(readFileSync(proofPath), proofPath),
    requestedDate,
  );
  const expectedPeriod = utcPeriod(requestedDate);
  const identity = report.reportIdentity;
  const provenance = report.provenance;
  const binding = provenance?.sourceEvidence;
  if (
    report.schemaVersion !== 1 ||
    report.artifactFormat !== reportArtifactFormat ||
    report.generatedBy !== reportGeneratedBy ||
    report.collectionDate !== requestedDate ||
    report.blockingPassed !== true ||
    report.failure !== null ||
    !isObject(report.qualityGates) ||
    Object.keys(report.qualityGates).length === 0 ||
    Object.values(report.qualityGates).some((passed) => passed !== true) ||
    !isObject(identity) ||
    identity.requestedDate !== requestedDate ||
    !periodsEqual(identity.requestedUtcPeriod, expectedPeriod) ||
    !isObject(provenance) ||
    !periodsEqual(provenance.requestedUtcPeriod, expectedPeriod) ||
    !periodsEqual(provenance.collectionUtcPeriod, expectedPeriod) ||
    !isObject(binding)
  ) {
    fail("legacy latest report is not a verified completed publication");
  }
  if (
    proof.reportByteLength !== latestBytes.byteLength ||
    proof.reportSha256 !== sha256Hex(latestBytes) ||
    proof.reportArtifactId !== identity.artifactId ||
    proof.evidenceArtifactId !== binding.artifactId ||
    proof.evidenceArtifactSha256 !== binding.sha256 ||
    proof.evidenceArtifactByteLength !== binding.byteLength ||
    proof.frontendArtifactSha256 !==
      binding.captureExecution?.frontendArtifactSha256 ||
    proof.frontendArtifactByteLength !==
      binding.captureExecution?.frontendArtifactByteLength ||
    proof.readerSummaryId !== binding.readerSummaryId ||
    proof.readerSummaryJobId !== binding.readerSummaryJobId ||
    !periodsEqual(proof.requestedUtcPeriod, expectedPeriod) ||
    stableJson(proof.captureExecution) !==
      stableJson(binding.captureExecution) ||
    stableJson(proof.model) !== stableJson(binding.runtimeProvenance) ||
    stableJson(proof.qualityGateNames) !==
      stableJson(Object.keys(report.qualityGates).sort())
  ) {
    fail("legacy publication proof or evidence binding is inconsistent");
  }
  return { proofPath, requestedDate };
}

function buildState(expectedDate, bindingPath, complete) {
  const bytes = readFileSync(bindingPath);
  const artifact = parseJson(bytes, bindingPath);
  const state = complete
    ? validateProof(artifact, expectedDate).state
    : validateOutcome(artifact, expectedDate);
  return {
    schemaVersion: 1,
    artifactFormat: stateArtifactFormat,
    requestedDate: expectedDate,
    state,
    terminal: true,
    binding: {
      artifactFormat: complete ? proofArtifactFormat : outcomeArtifactFormat,
      filename: basename(bindingPath),
      byteLength: bytes.byteLength,
      sha256: sha256Hex(bytes),
    },
  };
}

function validateBinding(state, path) {
  const expected = buildState(
    state.requestedDate,
    path,
    state.state === "complete",
  );
  if (stableJson(expected) !== stableJson(state)) {
    fail("day state binding is stale or conflicting");
  }
}

function validateState(value) {
  assertObject(value, "day state");
  assertExactKeys(value, [
    "artifactFormat",
    "binding",
    "requestedDate",
    "schemaVersion",
    "state",
    "terminal",
  ], "day state");
  assertDate(value.requestedDate);
  if (
    value.schemaVersion !== 1 ||
    value.artifactFormat !== stateArtifactFormat ||
    !["complete", "partial", "unavailable"].includes(value.state) ||
    value.terminal !== true
  ) {
    fail("day state identity or terminal status is invalid");
  }
  assertObject(value.binding, "day state binding");
  assertExactKeys(value.binding, [
    "artifactFormat",
    "byteLength",
    "filename",
    "sha256",
  ], "day state binding");
  const complete = value.state === "complete";
  if (
    value.binding.artifactFormat !==
      (complete ? proofArtifactFormat : outcomeArtifactFormat) ||
    value.binding.filename !==
      (complete
        ? proofFilename(value.requestedDate)
        : outcomeFilename(value.requestedDate)) ||
    !Number.isInteger(value.binding.byteLength) ||
    value.binding.byteLength < 1 ||
    !isSha256(value.binding.sha256)
  ) {
    fail("day state binding identity is invalid");
  }
  return value;
}

function validateProof(value, expectedDate) {
  assertObject(value, "publication proof");
  assertExactKeys(value, [
    "artifactFormat",
    "blockingPassed",
    "captureExecution",
    "collectionDate",
    "evidenceArtifactByteLength",
    "evidenceArtifactId",
    "evidenceArtifactSha256",
    "frontendArtifactByteLength",
    "frontendArtifactSha256",
    "model",
    "qualityGateNames",
    "readerSummaryId",
    "readerSummaryJobId",
    "reportArtifactId",
    "reportByteLength",
    "reportFilename",
    "reportSha256",
    "requestedUtcPeriod",
    "schemaVersion",
  ], "publication proof");
  if (
    value.schemaVersion !== 1 ||
    value.artifactFormat !== proofArtifactFormat ||
    value.collectionDate !== expectedDate ||
    value.reportFilename !== reportFilename(expectedDate) ||
    !positiveInteger(value.reportByteLength) ||
    !isSha256(value.reportSha256) ||
    typeof value.reportArtifactId !== "string" ||
    value.reportArtifactId.length === 0 ||
    typeof value.evidenceArtifactId !== "string" ||
    value.evidenceArtifactId.length === 0 ||
    !positiveInteger(value.evidenceArtifactByteLength) ||
    !isSha256(value.evidenceArtifactSha256) ||
    !positiveInteger(value.frontendArtifactByteLength) ||
    !isSha256(value.frontendArtifactSha256) ||
    typeof value.readerSummaryId !== "string" ||
    typeof value.readerSummaryJobId !== "string" ||
    !periodsEqual(value.requestedUtcPeriod, utcPeriod(expectedDate)) ||
    !isObject(value.captureExecution) ||
    !isObject(value.model) ||
    !Array.isArray(value.qualityGateNames) ||
    value.qualityGateNames.length === 0 ||
    value.qualityGateNames.some(
      (name) => typeof name !== "string" || name.length === 0,
    ) ||
    new Set(value.qualityGateNames).size !== value.qualityGateNames.length ||
    stableJson(value.qualityGateNames) !==
      stableJson([...value.qualityGateNames].sort()) ||
    value.blockingPassed !== true
  ) {
    fail("publication proof identity or verified result is invalid");
  }
  return { state: "complete", proof: value };
}

function validateOutcome(value, expectedDate) {
  assertObject(value, "terminal outcome");
  assertExactKeys(value, [
    "artifactFormat",
    "boundaries",
    "generatedAt",
    "generatedBy",
    "outcome",
    "providerReadiness",
    "reason",
    "requestedDate",
    "schemaVersion",
    "terminal",
  ], "terminal outcome");
  const expectedReason =
    value.outcome === "unavailable"
      ? "verified_provider_unavailability"
      : "bounded_provider_shortfall";
  if (
    value.schemaVersion !== 1 ||
    value.artifactFormat !== outcomeArtifactFormat ||
    value.generatedBy !== reportGeneratedBy ||
    value.requestedDate !== expectedDate ||
    !["partial", "unavailable"].includes(value.outcome) ||
    value.terminal !== true ||
    value.reason !== expectedReason
  ) {
    fail("terminal outcome identity or status is invalid");
  }
  assertIsoTimestamp(value.generatedAt, "terminal outcome generatedAt");
  if (
    stableJson(value.boundaries) !==
    stableJson({
      recollectionPerformedByOutcome: false,
      summaryModelCalled: false,
      summaryPublished: false,
      topicModelCalled: false,
    })
  ) {
    fail("terminal outcome does not prove model and publication boundaries");
  }
  assertObject(value.providerReadiness, "terminal provider readiness");
  if (
    value.providerReadiness.diagnosticsOwner !==
      "postgres_feed_items_published_window" ||
    !Array.isArray(value.providerReadiness.providers) ||
    value.providerReadiness.providers.length === 0
  ) {
    fail("terminal provider readiness is invalid");
  }
  const providers = value.providerReadiness.providers;
  for (const provider of providers) validateProvider(provider);
  if (
    new Set(providers.map((provider) => provider.providerKey)).size !==
      providers.length ||
    (value.outcome === "partial" &&
      (!providers.some((provider) => provider.state === "partial") ||
        providers.some((provider) => provider.state === "unavailable"))) ||
    (value.outcome === "unavailable" &&
      !providers.some((provider) => provider.state === "unavailable"))
  ) {
    fail("terminal provider states do not prove the declared outcome");
  }
  return value.outcome;
}

function validateProvider(value) {
  assertObject(value, "terminal provider");
  assertExactKeys(value, [
    "collectionFeedItemCount",
    "databaseFeedItemCount",
    "evidence",
    "minimumFeedItemCount",
    "providerKey",
    "reasonCodes",
    "state",
  ], "terminal provider");
  if (
    typeof value.providerKey !== "string" ||
    value.providerKey.length === 0 ||
    !["complete", "partial", "unavailable"].includes(value.state) ||
    typeof value.evidence !== "string" ||
    value.evidence.length === 0 ||
    ![
      value.databaseFeedItemCount,
      value.collectionFeedItemCount,
      value.minimumFeedItemCount,
    ].every((count) => Number.isInteger(count) && count >= 0) ||
    !Array.isArray(value.reasonCodes) ||
    value.reasonCodes.length === 0 ||
    value.reasonCodes.some(
      (reason) => typeof reason !== "string" || reason.length === 0,
    )
  ) {
    fail("terminal provider diagnostic is malformed");
  }
}

function writeState(path, state) {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

function reportFilename(date) {
  return `reader-summary-production-day-run.${date}.v1.json`;
}

function stateFilename(date) {
  return `reader-summary-production-day-state.${date}.v1.json`;
}

function proofFilename(date) {
  return `reader-summary-production-day-run.${date}.publication-proof.v1.json`;
}

function outcomeFilename(date) {
  return `reader-summary-production-day-outcome.${date}.v1.json`;
}

function utcPeriod(value) {
  const startedAt = `${value}T00:00:00.000Z`;
  const end = new Date(startedAt);
  end.setUTCDate(end.getUTCDate() + 1);
  const endedAt = end.toISOString();
  return {
    cadence: "daily",
    startedAt,
    endedAt,
    timezone: "UTC",
    periodKey: `daily:${startedAt}:${endedAt}:UTC`,
  };
}

function periodsEqual(value, expected) {
  return (
    isObject(value) &&
    value.cadence === expected.cadence &&
    value.startedAt === expected.startedAt &&
    value.endedAt === expected.endedAt &&
    value.timezone === expected.timezone &&
    value.periodKey === expected.periodKey
  );
}

function parseOptions(args) {
  const result = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (name === undefined || value === undefined || !name.startsWith("--")) {
      fail("state verifier options must be --name value pairs");
    }
    if (result.has(name)) fail(`duplicate option: ${name}`);
    result.set(name, value);
  }
  return result;
}

function assertOnlyOptions(values, allowed) {
  for (const name of values.keys()) {
    if (!allowed.includes(name)) fail(`unsupported option: ${name}`);
  }
}

function requiredOption(values, name) {
  const value = values.get(name);
  if (value === undefined || value.length === 0) {
    fail(`missing required option: ${name}`);
  }
  return value;
}

function parseJson(bytes, path) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${path} is not valid JSON`);
  }
}

function assertExactKeys(value, expected, name) {
  const actual = Object.keys(value).sort();
  if (stableJson(actual) !== stableJson([...expected].sort())) {
    fail(`${name} fields are malformed`);
  }
}

function assertDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail("date must use YYYY-MM-DD");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    fail("date is invalid");
  }
}

function assertIsoTimestamp(value, name) {
  const parsed = typeof value === "string" ? new Date(value) : null;
  if (
    parsed === null ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString() !== value
  ) {
    fail(`${name} must be an exact ISO timestamp`);
  }
}

function assertObject(value, name) {
  if (!isObject(value)) fail(`${name} must be an object`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function fail(message) {
  throw new Error(message);
}
