#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { publicationQualityContract } from "./lib/reader-summary-publication-quality-contract.mjs";

const reportArtifactFormat = "reader-summary-production-day-run-v1";
const reportGeneratedBy = "npm run run:reader-summary-production-day";
const evidenceArtifactId = "durable-reader-summary-postgres-evidence-v1";
const frontendArtifactFormat = "frontend-reader-summary-live-fixture-v1";
const requiredStepIds = [
  "collect",
  "collection-quality",
  "durable-reader-summary",
  "artifact-quality",
  "quality-dashboard",
  "top-read-ranking",
  "source-quality-trace",
  "clean-day-e2e",
];
const options = parseOptions(process.argv.slice(2));
const expectedDate = requiredOption(options, "--expected-date");
const datedReportPath = requiredOption(options, "--dated-report");
const evidencePath = requiredOption(options, "--evidence-artifact");
const frontendPath = requiredOption(options, "--frontend-artifact");
assertDate(expectedDate);

const datedReportBytes = readFileSync(datedReportPath);
const report = parseJson(datedReportBytes, datedReportPath);
const evidenceBinding = validateReport(
  report,
  expectedDate,
  evidencePath,
  frontendPath,
);

const latestCandidatePath = options.get("--latest-candidate");
if (latestCandidatePath !== undefined) {
  const latestCandidateBytes = readFileSync(latestCandidatePath);
  if (!latestCandidateBytes.equals(datedReportBytes)) {
    fail("latest candidate bytes do not match the exact dated report");
  }
}

const expectedProof = buildProof({
  report,
  reportBytes: datedReportBytes,
  reportFilename: basename(datedReportPath),
  expectedDate,
  evidenceBinding,
});
const proofOutPath = options.get("--proof-out");
const proofPath = options.get("--proof");
if ((proofOutPath === undefined) === (proofPath === undefined)) {
  fail("provide exactly one of --proof-out or --proof");
}

if (proofOutPath !== undefined) {
  writeFileSync(proofOutPath, `${stableJson(expectedProof)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
} else {
  const proof = parseJson(readFileSync(proofPath), proofPath);
  if (stableJson(proof) !== stableJson(expectedProof)) {
    fail(
      "publication proof does not exactly bind the dated report and evidence",
    );
  }
}

console.log(
  `Reader summary production-day publication proof OK (${expectedDate}, ${expectedProof.reportSha256})`,
);

function validateReport(report, expectedDate, evidencePath, frontendPath) {
  assertObject(report, "report");
  const expectedPeriod = utcPeriod(expectedDate);
  if (
    report.schemaVersion !== 1 ||
    report.artifactFormat !== reportArtifactFormat ||
    report.generatedBy !== reportGeneratedBy ||
    report.requestedDate !== expectedDate ||
    report.collectionDate !== expectedDate ||
    report.blockingPassed !== true ||
    report.failure !== null
  ) {
    fail("dated production-day report identity or blocking result is invalid");
  }

  validateInputs(report.inputs, expectedPeriod);
  validateSteps(report.steps);
  const reportContract = validateQualityGates(
    report.qualityGates,
    report.provenance,
    report.model,
    expectedDate,
  );

  const evidenceBytes = readFileSync(evidencePath);
  const frontendBytes = readFileSync(frontendPath);
  const evidence = parseJson(evidenceBytes, evidencePath);
  const frontend = parseJson(frontendBytes, frontendPath);
  const binding = validateEvidence(
    evidence,
    evidenceBytes,
    frontend,
    frontendBytes,
    expectedPeriod,
  );
  validateModel(
    report.model,
    binding.runtimeProvenance,
    report.provenance,
    reportContract,
  );
  validateSummary(report.summary, binding);
  validateReportIdentity(report.reportIdentity, binding, expectedDate);
  validateLiveProvenance(
    report.provenance,
    binding,
    expectedPeriod,
    evidence.provenance.datasetManifest,
  );
  validateRun(report.run, binding.captureExecution);
  return binding;
}

function validateModel(model, runtimeProvenance, provenance, reportContract) {
  assertObject(model, "report.model");
  assertObject(provenance, "report.provenance");
  const executionFlagsMatch =
    (reportContract === "current" &&
      provenance.mode === "live-production" &&
      model.liveCollection === true &&
      model.reusedCollection === false &&
      model.freshSummaryCapture === true) ||
    (reportContract === "legacy-live" &&
      provenance.mode === "live-production" &&
      model.liveCollection === true &&
      model.reusedCollection === undefined &&
      model.freshSummaryCapture === undefined) ||
    (provenance.mode === "historical-regeneration" &&
      model.liveCollection === false &&
      model.reusedCollection === true &&
      model.freshSummaryCapture === true);
  if (
    !executionFlagsMatch ||
    stableJson(runtimeFields(model, runtimeProvenance)) !==
      stableJson(runtimeProvenance) ||
    !validNotExecutedModelFields(model, runtimeProvenance) ||
    !isProductionRuntimeProvenance(runtimeProvenance) ||
    model.writesProductionData !== true ||
    model.allowDegraded !== false ||
    model.allowHistorical !== false ||
    model.rawProviderPayloadPersistedInReport !== false ||
    model.rawPostTextPersistedInReport !== false
  ) {
    fail(
      "dated production-day report subscription-runtime provenance is invalid",
    );
  }
}

function validNotExecutedModelFields(model, provenance) {
  if (provenance.execution !== "not_executed") return true;
  return (
    model.summaryModel === null &&
    model.physicalModel === null &&
    model.provider === null &&
    model.runtime === null &&
    model.runtimeVersion === null &&
    model.reasoningEffort === null &&
    model.launcherSha256 === null &&
    model.summaryContentSha256 === null &&
    model.topicMapSha256 === null &&
    model.attestationSetSha256 === null &&
    model.completedTaskCount === 0 &&
    model.topicLabeler === null
  );
}

function runtimeFields(model, provenance) {
  if (provenance.execution === "not_executed") {
    return {
      execution: model.runtimeExecution,
      reason: model.runtimeExecutionReason,
    };
  }
  return {
    execution: model.runtimeExecution,
    summaryModel: model.summaryModel,
    physicalModel: model.physicalModel,
    provider: model.provider,
    runtime: model.runtime,
    runtimeVersion: model.runtimeVersion,
    reasoningEffort: model.reasoningEffort,
    launcherSha256: model.launcherSha256,
    summaryContentSha256: model.summaryContentSha256,
    topicMapSha256: model.topicMapSha256,
    attestationSetSha256: model.attestationSetSha256,
    completedTaskCount: model.completedTaskCount,
    topicLabeler: model.topicLabeler,
  };
}

function runtimeProvenanceFromExecutorAttestations(evidence) {
  if (!Array.isArray(evidence.executionAttestations)) {
    fail("evidence execution attestations are missing");
  }
  const selected = evidence.result.selectedFeedItemCount;
  const status = evidence.result.status;
  if (selected === 0 && status === "no_signal") {
    if (evidence.executionAttestations.length !== 0) {
      fail("no_signal capture must not contain execution attestations");
    }
    return { execution: "not_executed", reason: "no_signal" };
  }
  if (!Number.isInteger(selected) || selected < 1 || status !== "completed") {
    fail("not_executed is valid only for selected=0 and no_signal");
  }
  const records = evidence.executionAttestations;
  for (const record of records) validateAttestationRecord(record);
  if (
    new Set(records.map((record) => record.attestation.requestId)).size !==
    records.length
  ) {
    fail("duplicate execution attestation request id");
  }
  if (records.filter((record) => record.taskRole === "summary").length !== 1) {
    fail("exactly one final summary attestation is required");
  }
  const topicLabels = records.filter(
    (record) => record.taskRole === "topic_label",
  );
  if (topicLabels.length !== 1) {
    fail("exactly one winning topic label attestation is required");
  }
  const winningTopicAttempt = topicLabels[0].attempt;
  if (
    records.some(
      (record) =>
        ["topic_label", "topic_relation"].includes(record.taskRole) &&
        record.attempt !== winningTopicAttempt,
    )
  ) {
    fail("topic attestations do not belong to one winning attempt");
  }
  if (
    new Set(records.map((record) => `${record.taskRole}\0${record.attempt}`))
      .size !== records.length
  ) {
    fail("duplicate execution task attempt");
  }
  const identities = new Set(
    records.map((record) =>
      [
        record.attestation.provider,
        record.attestation.model,
        record.attestation.reasoningEffort,
        record.attestation.runtimeEngine,
        record.attestation.runtimePackageVersion,
        record.attestation.launcherSha256,
      ].join("\0"),
    ),
  );
  if (identities.size !== 1) {
    fail("observed executor attestations do not agree");
  }
  const identity = records[0].attestation;
  const readback = evidence.durableReadback;
  const attestationSetSha256 = sha256Hex(Buffer.from(stableJson(records)));
  if (
    !isObject(readback) ||
    !isSha256(readback.summaryContentSha256) ||
    !isSha256(readback.topicMapSha256) ||
    readback.executionAttestationSetSha256 !== attestationSetSha256
  ) {
    fail("durable readback hashes are missing or inconsistent");
  }
  return {
    execution: "attested",
    summaryModel: "agent-runtime",
    physicalModel: "gpt-5.6-sol",
    provider: "codex",
    runtime: "subscription-runtime-cli",
    runtimeVersion: identity.runtimePackageVersion,
    reasoningEffort: "xhigh",
    launcherSha256: identity.launcherSha256,
    summaryContentSha256: readback.summaryContentSha256,
    topicMapSha256: readback.topicMapSha256,
    attestationSetSha256,
    completedTaskCount: records.length,
    topicLabeler: {
      mode: "agent-runtime",
      physicalModel: "gpt-5.6-sol",
      provider: "codex",
      runtime: "subscription-runtime-cli",
      runtimeVersion: identity.runtimePackageVersion,
      reasoningEffort: "xhigh",
      launcherSha256: identity.launcherSha256,
    },
  };
}

function validateAttestationRecord(record) {
  assertObject(record, "execution attestation record");
  assertObject(record.attestation, "execution attestation");
  const attestation = record.attestation;
  const purposes = {
    topic_label: "social_monitor.reader_summary.topic_map.label",
    topic_relation: "social_monitor.reader_summary.topic_map.verify_relations",
    story_relation: "social_monitor.reader_summary.verify_story_relations",
  };
  const summaryPurpose =
    record.attempt === "primary"
      ? "social_monitor.reader_summary.generate"
      : record.attempt === "repair"
        ? "social_monitor.reader_summary.repair"
        : undefined;
  const expectedPurpose =
    record.taskRole === "summary" ? summaryPurpose : purposes[record.taskRole];
  if (
    typeof record.attempt !== "string" ||
    record.attempt.length === 0 ||
    !isSha256(record.normalizedOutputSha256) ||
    expectedPurpose === undefined ||
    attestation.schemaVersion !== 1 ||
    typeof attestation.requestId !== "string" ||
    attestation.requestId.length === 0 ||
    attestation.purpose !== expectedPurpose ||
    !isSha256(attestation.canonicalRequestSha256) ||
    attestation.provider !== "codex" ||
    attestation.model !== "gpt-5.6-sol" ||
    attestation.reasoningEffort !== "xhigh" ||
    attestation.runtimeEngine !== "subscription-runtime-cli" ||
    !isConcreteVersion(attestation.runtimePackageVersion) ||
    !isSha256(attestation.launcherSha256) ||
    attestation.selectedOutputKind !== "structured_output" ||
    !isSha256(attestation.selectedOutputSha256)
  ) {
    fail("executor execution attestation is malformed or mismatched");
  }
}

function validateFrontendRuntimeConsistency(frontend, runtimeProvenance) {
  if (runtimeProvenance.execution === "not_executed") return;
  const lineage = frontend.readerSummaryArtifact.lineage;
  const topicMap = frontend.readerSummaryArtifact.content.topicMap;
  if (
    lineage.providerVersion !== runtimeProvenance.summaryModel ||
    lineage.modelVersion !==
      `${runtimeProvenance.provider}:${runtimeProvenance.physicalModel}:${runtimeProvenance.reasoningEffort}` ||
    topicMap.generatedBy !== runtimeProvenance.topicLabeler.mode ||
    sha256Hex(
      Buffer.from(stableJson(frontend.readerSummaryArtifact.content)),
    ) !== runtimeProvenance.summaryContentSha256 ||
    sha256Hex(Buffer.from(stableJson(topicMap))) !==
      runtimeProvenance.topicMapSha256
  ) {
    fail("frontend runtime fields contradict executor attestations");
  }
}

function isProductionRuntimeProvenance(value) {
  if (isObject(value) && value.execution === "not_executed") {
    return value.reason === "no_signal";
  }
  return (
    isObject(value) &&
    isObject(value.topicLabeler) &&
    value.execution === "attested" &&
    value.summaryModel === "agent-runtime" &&
    value.physicalModel === "gpt-5.6-sol" &&
    value.provider === "codex" &&
    value.runtime === "subscription-runtime-cli" &&
    isConcreteVersion(value.runtimeVersion) &&
    value.reasoningEffort === "xhigh" &&
    isSha256(value.launcherSha256) &&
    isSha256(value.summaryContentSha256) &&
    isSha256(value.topicMapSha256) &&
    isSha256(value.attestationSetSha256) &&
    Number.isInteger(value.completedTaskCount) &&
    value.completedTaskCount >= 2 &&
    value.topicLabeler.mode === "agent-runtime" &&
    value.topicLabeler.physicalModel === "gpt-5.6-sol" &&
    value.topicLabeler.provider === "codex" &&
    value.topicLabeler.runtime === "subscription-runtime-cli" &&
    value.topicLabeler.runtimeVersion === value.runtimeVersion &&
    value.topicLabeler.reasoningEffort === "xhigh" &&
    value.topicLabeler.launcherSha256 === value.launcherSha256
  );
}

function validateCaptureTimestamps(
  capture,
  evidenceGeneratedAt,
  frontendGeneratedAt,
) {
  for (const [name, value] of [
    ["capture.startedAt", capture.startedAt],
    ["capture.completedAt", capture.completedAt],
    ["capture.runtimeHealth.checkedAt", capture.runtimeHealth.checkedAt],
    ["evidence.generatedAt", evidenceGeneratedAt],
    ["frontend.generatedAt", frontendGeneratedAt],
  ]) {
    assertIsoTimestamp(value, name);
  }
  const startedAt = Date.parse(capture.startedAt);
  const completedAt = Date.parse(capture.completedAt);
  if (
    startedAt > completedAt ||
    [
      capture.runtimeHealth.checkedAt,
      evidenceGeneratedAt,
      frontendGeneratedAt,
    ].some((value) => {
      const timestamp = Date.parse(value);
      return timestamp < startedAt || timestamp > completedAt;
    })
  ) {
    fail("captured artifacts are not fresh for the bound execution");
  }
}

function validateInputs(inputs, expectedPeriod) {
  assertObject(inputs, "report.inputs");
  if (
    inputs.periodStartedAt !== expectedPeriod.startedAt ||
    inputs.periodEndedAt !== expectedPeriod.endedAt ||
    inputs.timezone !== expectedPeriod.timezone ||
    inputs.periodKey !== expectedPeriod.periodKey ||
    inputs.evidenceArtifactId !== evidenceArtifactId ||
    inputs.frontendArtifactFormat !== frontendArtifactFormat
  ) {
    fail("dated production-day report requested UTC period is invalid");
  }
}

function validateSteps(steps) {
  const acceptedStepIds =
    Array.isArray(steps) && steps.length === requiredStepIds.length + 1
      ? ["migrate", ...requiredStepIds]
      : requiredStepIds;
  if (!Array.isArray(steps) || steps.length !== acceptedStepIds.length) {
    fail(
      "dated production-day report must contain an exact supported step set",
    );
  }
  for (const requiredId of acceptedStepIds) {
    const matches = steps.filter(
      (step) => isObject(step) && step.id === requiredId,
    );
    if (
      matches.length !== 1 ||
      matches[0].status !== "passed" ||
      matches[0].exitCode !== 0 ||
      typeof matches[0].command !== "string" ||
      matches[0].command.length === 0
    ) {
      fail(`${requiredId} must exist exactly once and pass`);
    }
  }
}

function validateQualityGates(qualityGates, provenance, model, expectedDate) {
  const contract = publicationQualityContract({
    qualityGates,
    provenance,
    model,
    expectedDate,
  });
  if (contract === null) {
    fail("dated production-day report has a missing or failed quality gate");
  }
  return contract;
}

function validateEvidence(
  evidence,
  evidenceBytes,
  frontend,
  frontendBytes,
  expectedPeriod,
) {
  assertObject(evidence, "evidence artifact");
  assertObject(evidence.provenance, "evidence.provenance");
  assertObject(evidence.result, "evidence.result");
  assertObject(evidence.captureExecution, "evidence.captureExecution");
  assertObject(
    evidence.captureExecution.runtimeHealth,
    "evidence.captureExecution.runtimeHealth",
  );
  assertObject(
    evidence.captureExecution.frontendArtifact,
    "evidence.captureExecution.frontendArtifact",
  );
  assertObject(frontend, "frontend artifact");
  assertObject(
    frontend.readerSummaryArtifact,
    "frontend.readerSummaryArtifact",
  );
  assertObject(frontend.readerSummaryArtifact.lineage, "frontend lineage");
  assertObject(frontend.readerSummaryArtifact.content, "frontend content");
  assertObject(
    frontend.readerSummaryArtifact.content.topicMap,
    "frontend topic map",
  );
  assertObject(frontend.evidence, "frontend.evidence");
  const capture = evidence.captureExecution;
  const runtimeHealth = capture.runtimeHealth;
  const frontendBinding = capture.frontendArtifact;
  const runtimeProvenance = runtimeProvenanceFromExecutorAttestations(evidence);
  if (evidence.provenance.datasetManifest !== undefined) {
    validateDatasetGuardEvidence(evidence.provenance.datasetManifest);
  }
  validateFrontendRuntimeConsistency(frontend, runtimeProvenance);
  if (
    evidence.schemaVersion !== 1 ||
    evidence.artifactId !== evidenceArtifactId ||
    evidence.format !== evidenceArtifactId ||
    evidence.provenance.runner !==
      "scripts/capture-durable-reader-summary-from-postgres.ts" ||
    evidence.provenance.fixtureOnly !== false ||
    evidence.provenance.database !== "postgres" ||
    evidence.provenance.modelMode !== "agent-runtime" ||
    !["completed", "no_signal"].includes(evidence.result.status) ||
    !periodsEqual(evidence.period, expectedPeriod) ||
    frontend.format !== frontendArtifactFormat ||
    frontend.readerSummaryArtifact.readerSummaryId !==
      evidence.result.readerSummaryId ||
    frontend.evidence.readerSummaryId !== evidence.result.readerSummaryId ||
    frontend.evidence.readerSummaryJobId !==
      evidence.result.readerSummaryJobId ||
    !periodsEqual(frontend.readerSummaryArtifact.period, expectedPeriod) ||
    capture.schemaVersion !== 1 ||
    runtimeHealth.status !== "serving" ||
    runtimeHealth.runtimeEngine !== "subscription-runtime-cli" ||
    !isConcreteVersion(runtimeHealth.runtimeVersion) ||
    !isSha256(runtimeHealth.launcherSha256) ||
    (runtimeProvenance.execution === "attested" &&
      (runtimeHealth.runtimeVersion !== runtimeProvenance.runtimeVersion ||
        runtimeHealth.launcherSha256 !== runtimeProvenance.launcherSha256)) ||
    frontendBinding.format !== frontendArtifactFormat ||
    frontendBinding.sha256 !== sha256Hex(frontendBytes) ||
    frontendBinding.byteLength !== frontendBytes.byteLength ||
    frontendBinding.generatedAt !== frontend.generatedAt ||
    stableJson(capture.runtimeResult) !== stableJson(runtimeProvenance) ||
    !isProductionRuntimeProvenance(runtimeProvenance)
  ) {
    fail("durable evidence artifact provenance or UTC period is invalid");
  }
  assertUuid(
    evidence.result.readerSummaryId,
    "evidence.result.readerSummaryId",
  );
  assertUuid(
    evidence.result.readerSummaryJobId,
    "evidence.result.readerSummaryJobId",
  );
  assertUuid(capture.executionId, "evidence.captureExecution.executionId");
  validateCaptureTimestamps(
    capture,
    evidence.generatedAt,
    frontend.generatedAt,
  );
  return {
    artifactId: evidenceArtifactId,
    sha256: sha256Hex(evidenceBytes),
    byteLength: evidenceBytes.byteLength,
    readerSummaryId: evidence.result.readerSummaryId,
    readerSummaryJobId: evidence.result.readerSummaryJobId,
    requestedUtcPeriod: expectedPeriod,
    captureExecution: {
      executionId: capture.executionId,
      startedAt: capture.startedAt,
      completedAt: capture.completedAt,
      evidenceGeneratedAt: evidence.generatedAt,
      frontendGeneratedAt: frontend.generatedAt,
      frontendArtifactFormat,
      frontendArtifactSha256: sha256Hex(frontendBytes),
      frontendArtifactByteLength: frontendBytes.byteLength,
      runtimeHealthCheckedAt: runtimeHealth.checkedAt,
      runtimeEngine: runtimeHealth.runtimeEngine,
      runtimeVersion: runtimeHealth.runtimeVersion,
      runtimeLauncherSha256: runtimeHealth.launcherSha256,
    },
    runtimeProvenance,
  };
}

function validateSummary(summary, binding) {
  assertObject(summary, "report.summary");
  assertUuid(summary.readerSummaryId, "report.summary.readerSummaryId");
  assertUuid(summary.readerSummaryJobId, "report.summary.readerSummaryJobId");
  if (
    summary.readerSummaryId !== binding.readerSummaryId ||
    summary.readerSummaryJobId !== binding.readerSummaryJobId ||
    summary.evidenceArtifactId !== binding.artifactId ||
    summary.evidenceArtifactSha256 !== binding.sha256 ||
    summary.evidenceArtifactByteLength !== binding.byteLength ||
    !periodsEqual(summary.requestedUtcPeriod, binding.requestedUtcPeriod) ||
    stableJson(summary.captureExecution) !==
      stableJson(binding.captureExecution) ||
    stableJson(summary.runtimeProvenance) !==
      stableJson(binding.runtimeProvenance)
  ) {
    fail(
      "report summary does not exactly bind the persisted evidence artifact",
    );
  }
}

function validateReportIdentity(identity, binding, expectedDate) {
  assertObject(identity, "report.reportIdentity");
  const expectedArtifactId = reportIdentityArtifactId(expectedDate, binding);
  if (
    identity.artifactId !== expectedArtifactId ||
    identity.requestedDate !== expectedDate ||
    identity.readerSummaryId !== binding.readerSummaryId ||
    identity.readerSummaryJobId !== binding.readerSummaryJobId ||
    identity.evidenceArtifactId !== binding.artifactId ||
    identity.evidenceArtifactSha256 !== binding.sha256 ||
    identity.frontendArtifactSha256 !==
      binding.captureExecution.frontendArtifactSha256 ||
    identity.captureExecutionId !== binding.captureExecution.executionId ||
    !periodsEqual(identity.requestedUtcPeriod, binding.requestedUtcPeriod)
  ) {
    fail("report identity does not exactly bind the persisted summary");
  }
}

function validateRun(run, captureExecution) {
  assertObject(run, "report.run");
  assertObject(run.captureExecution, "report.run.captureExecution");
  if (
    run.captureExecution.executionId !== captureExecution.executionId ||
    run.captureExecution.startedAt !== captureExecution.startedAt ||
    run.captureExecution.completedAt !== captureExecution.completedAt
  ) {
    fail("report run does not bind the fresh capture execution");
  }
}

function validateLiveProvenance(
  provenance,
  binding,
  expectedPeriod,
  evidenceDatasetGuard,
) {
  assertObject(provenance, "report.provenance");
  assertObject(provenance.sourceEvidence, "report.provenance.sourceEvidence");
  const standardLiveProvenance =
    provenance.mode === "live-production" && provenance.sourceReport === null;
  const regenerationProvenance =
    provenance.mode === "historical-regeneration" &&
    provenance.priorCollectionProof !== null &&
    typeof provenance.priorCollectionProof === "object" &&
    hashBoundArtifactMatches(
      provenance.priorCollectionProof.sourceAttempt,
      "reader-summary-production-day-run-v1",
    ) &&
    hashBoundArtifactMatches(
      provenance.priorCollectionProof.collectionArtifact,
      "reader-summary-clean-real-day-collection-v1",
    ) &&
    hashBoundArtifactMatches(
      provenance.priorCollectionProof.collectionQualityReport,
      "yesterday-social-collection-quality-report-v1",
    ) &&
    datasetGuardMatchesManifest(
      provenance.datasetGuardEvidence,
      provenance.regenerationInputManifest,
    ) &&
    provenance.freshnessOverride?.mode ===
      "historical_regeneration_current_snapshot" &&
    provenance.freshnessOverride?.generalAllowHistorical === false &&
    provenance.freshnessOverride?.maxManifestAgeSeconds === 1800 &&
    stableJson(provenance.datasetGuardEvidence) ===
      stableJson(evidenceDatasetGuard) &&
    provenance.githubOmission?.mode ===
      "github_projection_unavailable_historical" &&
    typeof provenance.githubOmission?.reason === "string" &&
    provenance.githubOmission.reason.trim().length >= 20;
  if (
    (!standardLiveProvenance && !regenerationProvenance) ||
    provenance.nonLive !== false ||
    !periodsEqual(provenance.requestedUtcPeriod, expectedPeriod) ||
    !periodsEqual(provenance.collectionUtcPeriod, expectedPeriod) ||
    stableJson(provenance.sourceEvidence) !== stableJson(binding)
  ) {
    fail(
      "dated production-day report must carry exact live, non-reused provenance",
    );
  }
}

function validateDatasetGuardEvidence(guard) {
  assertObject(guard, "evidence.provenance.datasetManifest");
  const expectedPhases = [
    "before_evidence_selection",
    "after_evidence_selection",
    "before_publication",
  ];
  if (
    guard.manifestFormat !== "reader-summary-day-dataset-manifest-v1" ||
    !isSha256(guard.manifestFileSha256) ||
    !isSha256(guard.datasetSha256) ||
    typeof guard.manifestGeneratedAt !== "string" ||
    typeof guard.feedRowCount !== "number" ||
    typeof guard.githubEligibilityRowCount !== "number" ||
    guard.providerCounts === null ||
    typeof guard.providerCounts !== "object" ||
    stableJson(guard.completedPhases) !== stableJson(expectedPhases)
  ) {
    fail("dataset manifest guard evidence is incomplete");
  }
}

function datasetGuardMatchesManifest(guard, manifest) {
  if (
    guard === null ||
    typeof guard !== "object" ||
    manifest === null ||
    typeof manifest !== "object"
  ) {
    return false;
  }
  return (
    guard.manifestFormat === manifest.artifactFormat &&
    guard.manifestFileSha256 === manifest.sha256 &&
    guard.manifestGeneratedAt === manifest.generatedAt &&
    guard.datasetSha256 === manifest.datasetSha256 &&
    guard.feedRowCount === manifest.feedRowCount &&
    guard.githubEligibilityRowCount === manifest.githubEligibilityRowCount &&
    stableJson(guard.providerCounts) === stableJson(manifest.providerCounts) &&
    stableJson(guard.completedPhases) ===
      stableJson([
        "before_evidence_selection",
        "after_evidence_selection",
        "before_publication",
      ])
  );
}

function hashBoundArtifactMatches(value, artifactFormat) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.artifactFormat === artifactFormat &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/u.test(value.sha256)
  );
}

function buildProof({
  report,
  reportBytes,
  reportFilename,
  expectedDate,
  evidenceBinding,
}) {
  return {
    schemaVersion: 1,
    artifactFormat: "reader-summary-production-day-publication-proof-v1",
    collectionDate: expectedDate,
    reportFilename,
    reportByteLength: reportBytes.byteLength,
    reportSha256: sha256Hex(reportBytes),
    reportArtifactId: report.reportIdentity.artifactId,
    evidenceArtifactId: evidenceBinding.artifactId,
    evidenceArtifactSha256: evidenceBinding.sha256,
    evidenceArtifactByteLength: evidenceBinding.byteLength,
    frontendArtifactSha256:
      evidenceBinding.captureExecution.frontendArtifactSha256,
    frontendArtifactByteLength:
      evidenceBinding.captureExecution.frontendArtifactByteLength,
    captureExecution: evidenceBinding.captureExecution,
    readerSummaryId: evidenceBinding.readerSummaryId,
    readerSummaryJobId: evidenceBinding.readerSummaryJobId,
    requestedUtcPeriod: evidenceBinding.requestedUtcPeriod,
    model: evidenceBinding.runtimeProvenance,
    qualityGateNames: Object.keys(report.qualityGates).sort(),
    blockingPassed: true,
  };
}

function reportIdentityArtifactId(expectedDate, binding) {
  return [
    reportArtifactFormat,
    expectedDate,
    binding.readerSummaryId,
    binding.readerSummaryJobId,
    binding.artifactId,
    binding.sha256,
    binding.captureExecution.frontendArtifactSha256,
    binding.captureExecution.executionId,
  ].join("/");
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

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseOptions(args) {
  const result = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (name === undefined || value === undefined || !name.startsWith("--")) {
      fail("publication verifier options must be --name value pairs");
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
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${path} is not valid JSON`);
  }
}

function assertDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail("expected date must use YYYY-MM-DD");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    fail("expected date is invalid");
  }
}

function assertUuid(value, name) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    fail(`${name} must be a UUID`);
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

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isConcreteVersion(value) {
  return (
    typeof value === "string" &&
    value !== "unknown" &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value)
  );
}

function assertObject(value, name) {
  if (!isObject(value)) {
    fail(`${name} must be an object`);
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message) {
  throw new Error(message);
}
