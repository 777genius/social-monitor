import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  legacyLiveQualityGateNames,
  publicationQualityContract,
} from "./lib/reader-summary-publication-quality-contract.mjs";

const verifierPath = resolve(
  "scripts/verify-reader-summary-production-day-publication.mjs",
);
const collectionDate = "2026-07-20";
const readerSummaryId = "11111111-1111-4111-8111-111111111111";
const readerSummaryJobId = "22222222-2222-4222-8222-222222222222";
const evidenceArtifactId = "durable-reader-summary-postgres-evidence-v1";
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
test("accepts a fully live report with all eight real steps", () => {
  withFixture(({ reportPath, proofPath }) => {
    const created = runVerifier(reportPath, proofPath, "--proof-out");
    assert.equal(created.status, 0, created.stderr);
    const verified = runVerifier(reportPath, proofPath, "--proof");
    assert.equal(verified.status, 0, verified.stderr);

    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    assert.equal(proof.readerSummaryId, readerSummaryId);
    assert.equal(proof.readerSummaryJobId, readerSummaryJobId);
    assert.match(proof.evidenceArtifactSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(proof.model.topicLabeler, {
      mode: "agent-runtime",
      physicalModel: "gpt-5.6-sol",
      provider: "codex",
      runtime: "subscription-runtime-cli",
      runtimeVersion: "0.1.0-main.2",
      reasoningEffort: "high",
      launcherSha256: "b".repeat(64),
    });
  });
});

test("accepts the exact related-topic relation attestation inventory", () => {
  withFixture(({ reportPath, proofPath }) => {
    const result = runVerifier(reportPath, proofPath, "--proof-out");
    assert.equal(result.status, 0, result.stderr);
  }, { relatedTopicRole: "related_topic_relation" });
});

test("accepts provider telemetry bound to the daily job, receipt, and artifact", () => {
  withFixture(({ reportPath, proofPath }) => {
    const result = runVerifier(reportPath, proofPath, "--proof-out");
    assert.equal(result.status, 0, result.stderr);
  }, { dailyTelemetry: true });
});

for (const patch of [
  { usageSource: "ESTIMATED" },
  { durationMs: 0 },
  { inputTokens: null },
]) {
  test(`rejects incomplete daily telemetry ${JSON.stringify(patch)}`, () => {
    withFixture(({ reportPath, proofPath, report }) => {
      Object.assign(report.model.modelExecution, patch);
      writeFileSync(reportPath, `${JSON.stringify(report)}\n`);
      const result = runVerifier(reportPath, proofPath, "--proof-out");
      assert.notEqual(result.status, 0);
    }, { dailyTelemetry: true });
  });
}

test("rejects daily telemetry that disagrees with the runtime attestation", () => {
  withFixture(({ reportPath, proofPath, report, evidence, evidencePath }) => {
    report.model.modelExecution.provider = "claude";
    evidence.provenance.dailySourceAuthority.modelExecution.provider = "claude";
    writeFileSync(evidencePath, `${JSON.stringify(evidence)}\n`);
    writeFileSync(reportPath, `${JSON.stringify(report)}\n`);
    const result = runVerifier(reportPath, proofPath, "--proof-out");
    assert.notEqual(result.status, 0);
  }, { dailyTelemetry: true });
});

test("rejects an unknown relation attestation kind", () => {
  withFixture(({ reportPath, proofPath }) => {
    const result = runVerifier(reportPath, proofPath, "--proof-out");
    assert.notEqual(result.status, 0);
  }, { relatedTopicRole: "unknown_relation" });
});

test("continues to verify immutable reports from the migration-owning runner", () => {
  withFixture(({ reportPath, proofPath, report }) => {
    report.steps.unshift({
      id: "migrate",
      command: "npm run migrate:deploy",
      status: "passed",
      durationMs: 1,
      exitCode: 0,
    });
    writeFileSync(reportPath, `${JSON.stringify(report)}\n`);

    const created = runVerifier(reportPath, proofPath, "--proof-out");
    assert.equal(created.status, 0, created.stderr);
  });
});

test("accepts an in-flight legacy live report with its exact quality contract", () => {
  withFixture(({ reportPath, proofPath, report }) => {
    delete report.model.reusedCollection;
    delete report.model.freshSummaryCapture;
    report.qualityGates = Object.fromEntries(
      legacyLiveQualityGateNames.map((name) => [name, true]),
    );
    writeFileSync(reportPath, `${JSON.stringify(report)}\n`);

    const created = runVerifier(reportPath, proofPath, "--proof-out");
    assert.equal(created.status, 0, created.stderr);
  }, { legacyIdentity: true });
});

test("current live verification rejects a fully self-consistent legacy identity", () => {
  withFixture(({ reportPath, proofPath }) => {
    const result = runVerifier(reportPath, proofPath, "--proof-out");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /attestation|provenance/u);
  }, { legacyIdentity: true });
});

test("rejects an incomplete legacy live quality contract", () => {
  expectRejected(({ report }) => {
    delete report.model.reusedCollection;
    delete report.model.freshSummaryCapture;
    report.qualityGates = Object.fromEntries(
      legacyLiveQualityGateNames
        .filter((name) => name !== "liveCollectionExecutedAndPassed")
        .map((name) => [name, true]),
    );
  });
});

test("rejects the legacy live contract outside its in-flight date", () => {
  assert.equal(
    publicationQualityContract({
      qualityGates: Object.fromEntries(
        legacyLiveQualityGateNames.map((name) => [name, true]),
      ),
      provenance: { mode: "live-production" },
      model: { liveCollection: true },
      expectedDate: "2026-07-21",
    }),
    null,
  );
});

for (const stepId of requiredStepIds) {
  test(`rejects missing ${stepId}`, () => {
    expectRejected(({ report }) => {
      report.steps = report.steps.filter((step) => step.id !== stepId);
    });
  });

  test(`rejects duplicate ${stepId}`, () => {
    expectRejected(({ report }) => {
      report.steps.push(report.steps.find((step) => step.id === stepId));
    });
  });
}

for (const status of ["skipped", "failed"]) {
  test(`rejects a ${status} required step`, () => {
    expectRejected(({ report }) => {
      const step = report.steps.find(({ id }) => id === "collect");
      step.status = status;
      step.exitCode = status === "failed" ? 1 : null;
    });
  });
}

test("recreates and rejects the Jul 15 skipped-live false green", () => {
  expectRejected(({ report }) => {
    for (const step of report.steps) {
      if (step.id === "collect" || step.id === "clean-day-e2e") {
        step.status = "skipped";
        step.exitCode = null;
      }
    }
    report.model.liveCollection = false;
    report.blockingPassed = true;
  });
});

for (const [field, value] of [
  ["readerSummaryId", "summary-id"],
  ["readerSummaryJobId", "job-id"],
  ["readerSummaryId", readerSummaryJobId],
]) {
  test(`rejects malformed or mismatched ${field}`, () => {
    expectRejected(({ report }) => {
      report.summary[field] = value;
    });
  });
}

test("rejects modified evidence content with unchanged IDs", () => {
  withFixture(({ reportPath, proofPath, evidencePath }) => {
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    evidence.result.headline = "modified with the same identities";
    writeFileSync(evidencePath, `${JSON.stringify(evidence)}\n`);

    const result = runVerifier(reportPath, proofPath, "--proof-out");
    assert.notEqual(result.status, 0);
  });
});

test("rejects a successful report when the fresh frontend artifact is absent", () => {
  withFixture(({ reportPath, proofPath, frontendPath }) => {
    rmSync(frontendPath, { force: true });
    const result = runVerifier(reportPath, proofPath, "--proof-out");
    assert.notEqual(result.status, 0);
  });
});

test("rejects modified frontend content with unchanged summary identities", () => {
  withFixture(({ reportPath, proofPath, frontendPath }) => {
    const frontend = JSON.parse(readFileSync(frontendPath, "utf8"));
    frontend.readerSummaryArtifact.lineage.modelVersion =
      "codex:gpt-5.6-sol:xhigh-modified";
    writeFileSync(frontendPath, `${JSON.stringify(frontend)}\n`);
    const result = runVerifier(reportPath, proofPath, "--proof-out");
    assert.notEqual(result.status, 0);
  });
});

test("rejects evidence identity and hash mismatches", () => {
  expectRejected(({ report }) => {
    report.summary.evidenceArtifactId = "different-evidence";
    report.summary.evidenceArtifactSha256 = "0".repeat(64);
  });
});

test("rejects a report/evidence requested UTC period mismatch", () => {
  expectRejected(({ report }) => {
    report.inputs.periodStartedAt = "2026-07-14T00:00:00.000Z";
    report.summary.requestedUtcPeriod.timezone = "America/New_York";
  });
});

test("rejects a source evidence period mismatch", () => {
  expectRejected(({ evidence }) => {
    evidence.period.startedAt = "2026-07-14T00:00:00.000Z";
  });
});

for (const nonLive of [true, undefined, "false"]) {
  test(`rejects live nonLive=${String(nonLive)}`, () => {
    expectRejected(({ report }) => {
      report.provenance.nonLive = nonLive;
    });
  });
}

for (const [field, value] of [
  ["physicalModel", "gpt-5.5"],
  ["provider", "claude"],
  ["runtime", "direct"],
  ["summaryModel", "deterministic"],
]) {
  test(`rejects wrong subscription-runtime ${field}`, () => {
    expectRejected(({ report }) => {
      report.model[field] = value;
    });
  });
}

for (const [field, value] of [
  ["mode", "deterministic"],
  ["provider", "claude"],
  ["runtime", "direct"],
]) {
  test(`rejects wrong topic-labeler ${field}`, () => {
    expectRejected(({ report }) => {
      report.model.topicLabeler[field] = value;
    });
  });
}

test("rejects historical provenance even when blocking is forged true", () => {
  expectRejected(({ report }) => {
    report.provenance.mode = "historical-reuse";
    report.provenance.nonLive = true;
    report.blockingPassed = true;
  });
});

test("accepts hash-bound historical regeneration with a fresh summary", () => {
  withFixture(({ reportPath, proofPath, report, evidence }) => {
    report.provenance = historicalRegenerationProvenance(
      report.provenance.sourceEvidence,
      evidence.provenance.datasetManifest,
    );
    report.model.liveCollection = false;
    report.model.reusedCollection = true;
    writeFileSync(reportPath, `${JSON.stringify(report)}\n`);
    const created = runVerifier(reportPath, proofPath, "--proof-out");
    assert.equal(created.status, 0, created.stderr);
  });
});

test("rejects historical regeneration with an unbound collection hash", () => {
  expectRejected(({ report }) => {
    report.provenance = historicalRegenerationProvenance(
      report.provenance.sourceEvidence,
      datasetGuardEvidence(),
    );
    report.provenance.priorCollectionProof.collectionArtifact.sha256 =
      "not-a-sha256";
    report.model.liveCollection = false;
    report.model.reusedCollection = true;
  });
});

test("rejects historical regeneration whose dataset guard is not evidence-bound", () => {
  expectRejected(({ report, evidence }) => {
    report.provenance = historicalRegenerationProvenance(
      report.provenance.sourceEvidence,
      evidence.provenance.datasetManifest,
    );
    report.provenance.datasetGuardEvidence.datasetSha256 = "f".repeat(64);
    report.model.liveCollection = false;
    report.model.reusedCollection = true;
  });
});

for (const options of [
  { modelVersion: "claude:gpt-5.6-sol:high" },
  { modelVersion: "codex:gpt-5.5:high" },
  { modelVersion: "codex:gpt-5.6-sol:xhigh" },
  { attestationOutputKind: "output_text" },
  { attestationRuntimeEngine: "direct" },
  { topicGeneratedBy: "deterministic" },
]) {
  test(`rejects hash-bound misconfigured runtime ${JSON.stringify(options)}`, () => {
    withFixture(({ reportPath, proofPath }) => {
      const result = runVerifier(reportPath, proofPath, "--proof-out");
      assert.notEqual(result.status, 0);
    }, options);
  });
}

function expectRejected(mutate) {
  withFixture(({ reportPath, proofPath, report, evidence, evidencePath }) => {
    mutate({ report, evidence });
    writeFileSync(evidencePath, `${JSON.stringify(evidence)}\n`);
    writeFileSync(reportPath, `${JSON.stringify(report)}\n`);
    const result = runVerifier(reportPath, proofPath, "--proof-out");
    assert.notEqual(result.status, 0, "false-green report was accepted");
  });
}

function withFixture(assertion, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "publication-verifier-"));
  try {
    const evidencePath = join(directory, "evidence.json");
    const frontendPath = join(directory, "frontend.json");
    const reportPath = join(
      directory,
      `reader-summary-production-day-run.${collectionDate}.v1.json`,
    );
    const proofPath = join(directory, "proof.json");
    const frontend = buildFrontend(options);
    const frontendBytes = `${JSON.stringify(frontend)}\n`;
    writeFileSync(frontendPath, frontendBytes);
    const evidence = buildEvidence(frontend, frontendBytes, options);
    const evidenceBytes = `${JSON.stringify(evidence)}\n`;
    writeFileSync(evidencePath, evidenceBytes);
    const report = buildReport(evidenceBytes, frontendBytes, evidence);
    writeFileSync(reportPath, `${JSON.stringify(report)}\n`);
    assertion({
      directory,
      evidence,
      evidencePath,
      frontend,
      frontendPath,
      proofPath,
      report,
      reportPath,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runVerifier(reportPath, proofPath, proofOption) {
  const directory = dirname(reportPath);
  return spawnSync(
    process.execPath,
    [
      verifierPath,
      "--dated-report",
      reportPath,
      "--expected-date",
      collectionDate,
      "--evidence-artifact",
      join(directory, "evidence.json"),
      "--frontend-artifact",
      join(directory, "frontend.json"),
      proofOption,
      proofPath,
    ],
    { encoding: "utf8" },
  );
}

function buildFrontend(options) {
  return {
    schemaVersion: 1,
    format: "frontend-reader-summary-live-fixture-v1",
    generatedAt: "2026-07-16T01:00:11.000Z",
    readerSummaryArtifact: {
      readerSummaryId,
      period: utcPeriod(),
      lineage: {
        modelVersion: options.modelVersion ??
          (options.legacyIdentity
            ? "codex:gpt-5.6-sol:xhigh"
            : "codex:gpt-5.6-sol:high"),
        providerVersion: options.providerVersion ?? "agent-runtime",
      },
      ...(options.dailyTelemetry
        ? { usage: { inputTokens: 120, outputTokens: 30, estimatedCostUsd: 0 } }
        : {}),
      content: {
        reliabilityReport: {
          risks: [],
          riskScore: 0,
        },
        topReads: [],
        topicMap: {
          generatedBy: options.topicGeneratedBy ?? "agent-runtime",
        },
      },
    },
    evidence: { readerSummaryId, readerSummaryJobId },
  };
}

function buildEvidence(frontend, frontendBytes, options) {
  const executionAttestations = buildExecutionAttestations(options);
  const runtimeProvenance = deriveRuntimeProvenance(
    executionAttestations,
    frontend,
  );
  return {
    schemaVersion: 1,
    artifactId: evidenceArtifactId,
    format: evidenceArtifactId,
    generatedAt: "2026-07-16T01:00:10.000Z",
    provenance: {
      runner: "scripts/capture-durable-reader-summary-from-postgres.ts",
      fixtureOnly: false,
      database: "postgres",
      modelMode: "agent-runtime",
      datasetManifest: datasetGuardEvidence(),
      ...(options.dailyTelemetry
        ? { dailySourceAuthority: dailySourceAuthority() }
        : {}),
    },
    period: utcPeriod(),
    result: {
      readerSummaryId,
      readerSummaryJobId,
      status: "completed",
      headline: "Canonical persisted summary",
      selectedFeedItemCount: 5,
      topReadCount: 3,
    },
    executionAttestations,
    durableReadback: {
      summaryContentSha256: runtimeProvenance.summaryContentSha256,
      topicMapSha256: runtimeProvenance.topicMapSha256,
      executionAttestationSetSha256: runtimeProvenance.attestationSetSha256,
    },
    captureExecution: {
      schemaVersion: 1,
      executionId: "55555555-5555-4555-8555-555555555555",
      startedAt: "2026-07-16T01:00:00.000Z",
      completedAt: "2026-07-16T01:01:00.000Z",
      runtimeHealth: {
        status: "serving",
        runtimeEngine: options.runtimeEngine ?? "subscription-runtime-cli",
        runtimeVersion: "0.1.0-main.2",
        launcherSha256: "b".repeat(64),
        checkedAt: "2026-07-16T01:00:30.000Z",
      },
      frontendArtifact: {
        format: frontend.format,
        sha256: createHash("sha256").update(frontendBytes).digest("hex"),
        byteLength: Buffer.byteLength(frontendBytes),
        generatedAt: frontend.generatedAt,
      },
      runtimeResult: runtimeProvenance,
    },
  };
}

function buildReport(evidenceBytes, frontendBytes, evidence) {
  const period = utcPeriod();
  const sha256 = createHash("sha256").update(evidenceBytes).digest("hex");
  const frontendSha256 = createHash("sha256")
    .update(frontendBytes)
    .digest("hex");
  const runtimeProvenance = evidence.captureExecution.runtimeResult;
  const captureExecution = {
    executionId: evidence.captureExecution.executionId,
    startedAt: evidence.captureExecution.startedAt,
    completedAt: evidence.captureExecution.completedAt,
    evidenceGeneratedAt: evidence.generatedAt,
    frontendGeneratedAt: evidence.captureExecution.frontendArtifact.generatedAt,
    frontendArtifactFormat: evidence.captureExecution.frontendArtifact.format,
    frontendArtifactSha256: frontendSha256,
    frontendArtifactByteLength: Buffer.byteLength(frontendBytes),
    runtimeHealthCheckedAt: evidence.captureExecution.runtimeHealth.checkedAt,
    runtimeEngine: evidence.captureExecution.runtimeHealth.runtimeEngine,
    runtimeVersion: evidence.captureExecution.runtimeHealth.runtimeVersion,
    runtimeLauncherSha256:
      evidence.captureExecution.runtimeHealth.launcherSha256,
  };
  const binding = {
    artifactId: evidenceArtifactId,
    sha256,
    byteLength: Buffer.byteLength(evidenceBytes),
    readerSummaryId,
    readerSummaryJobId,
    requestedUtcPeriod: period,
    captureExecution,
    runtimeProvenance,
  };
  return {
    schemaVersion: 1,
    artifactFormat: "reader-summary-production-day-run-v1",
    generatedBy: "npm run run:reader-summary-production-day",
    requestedDate: collectionDate,
    collectionDate,
    reportIdentity: {
      artifactId: [
        "reader-summary-production-day-run-v1",
        collectionDate,
        readerSummaryId,
        readerSummaryJobId,
        evidenceArtifactId,
        sha256,
        frontendSha256,
        captureExecution.executionId,
      ].join("/"),
      requestedDate: collectionDate,
      readerSummaryId,
      readerSummaryJobId,
      evidenceArtifactId,
      evidenceArtifactSha256: sha256,
      frontendArtifactSha256: frontendSha256,
      captureExecutionId: captureExecution.executionId,
      requestedUtcPeriod: period,
    },
    provenance: {
      mode: "live-production",
      nonLive: false,
      requestedUtcPeriod: period,
      collectionUtcPeriod: period,
      sourceReport: null,
      sourceEvidence: binding,
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
      modelExecution: evidence.provenance.dailySourceAuthority === undefined
        ? null
        : {
            ...evidence.provenance.dailySourceAuthority.modelExecution,
            modelJobIdentity:
              evidence.provenance.dailySourceAuthority.modelJobIdentity,
            receiptSha256:
              evidence.provenance.dailySourceAuthority.receiptSha256,
            readerSummaryJobId,
            readerSummaryArtifactId: readerSummaryId,
          },
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
      frontendArtifactFormat: "frontend-reader-summary-live-fixture-v1",
    },
    run: {
      startedAt: `${collectionDate}T01:00:00.000Z`,
      completedAt: `${collectionDate}T01:01:00.000Z`,
      captureExecution: {
        executionId: captureExecution.executionId,
        startedAt: captureExecution.startedAt,
        completedAt: captureExecution.completedAt,
      },
    },
    failure: null,
    summary: {
      evidenceArtifactId,
      evidenceArtifactSha256: sha256,
      evidenceArtifactByteLength: binding.byteLength,
      requestedUtcPeriod: period,
      readerSummaryId,
      readerSummaryJobId,
      captureExecution,
      runtimeProvenance,
      headline: "Canonical persisted summary",
    },
    steps: requiredStepIds.map((id) => ({
      id,
      command: `npm run real:${id}`,
      status: "passed",
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
    },
    blockingPassed: true,
  };
}

function dailySourceAuthority() {
  return {
    canonicalSha256: "7".repeat(64),
    modelJobIdentity: "8".repeat(64),
    receiptSha256: "9".repeat(64),
    modelExecution: {
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      usageSource: "PROVIDER_REPORTED",
      durationMs: 250,
    },
  };
}

function historicalRegenerationProvenance(sourceEvidence, datasetGuard) {
  const period = utcPeriod();
  return {
    mode: "historical-regeneration",
    nonLive: false,
    requestedUtcPeriod: period,
    collectionUtcPeriod: period,
    priorCollectionProof: {
      sourceAttempt: {
        artifactFormat: "reader-summary-production-day-run-v1",
        sha256: "a".repeat(64),
      },
      collectionArtifact: {
        artifactFormat: "reader-summary-clean-real-day-collection-v1",
        sha256: "b".repeat(64),
      },
      collectionQualityReport: {
        artifactFormat: "yesterday-social-collection-quality-report-v1",
        sha256: "c".repeat(64),
      },
    },
    regenerationInputManifest: regenerationManifest(),
    datasetGuardEvidence: datasetGuard,
    githubOmission: {
      mode: "github_projection_unavailable_historical",
      reason:
        "The exact end-of-day GitHub projection is unavailable for this completed UTC day.",
    },
    freshnessOverride: {
      mode: "historical_regeneration_current_snapshot",
      generalAllowHistorical: false,
      maxManifestAgeSeconds: 1800,
    },
    sourceEvidence,
  };
}

function regenerationManifest() {
  return {
    artifactFormat: "reader-summary-day-dataset-manifest-v1",
    sha256: "d".repeat(64),
    generatedAt: "2026-07-16T00:59:00.000Z",
    datasetSha256: "e".repeat(64),
    feedRowCount: 10,
    githubEligibilityRowCount: 1,
    providerCounts: { reddit: 10 },
  };
}

function datasetGuardEvidence() {
  const manifest = regenerationManifest();
  return {
    manifestFormat: manifest.artifactFormat,
    manifestFileSha256: manifest.sha256,
    manifestGeneratedAt: manifest.generatedAt,
    datasetSha256: manifest.datasetSha256,
    feedRowCount: manifest.feedRowCount,
    githubEligibilityRowCount: manifest.githubEligibilityRowCount,
    providerCounts: manifest.providerCounts,
    completedPhases: [
      "before_evidence_selection",
      "after_evidence_selection",
      "before_publication",
    ],
  };
}

function deriveRuntimeProvenance(executionAttestations, frontend) {
  const identity = executionAttestations[0].attestation;
  return {
    execution: "attested",
    summaryModel: "agent-runtime",
    physicalModel: identity.model,
    provider: identity.provider,
    runtime: identity.runtimeEngine,
    runtimeVersion: identity.runtimePackageVersion,
    reasoningEffort: identity.reasoningEffort,
    launcherSha256: identity.launcherSha256,
    summaryContentSha256: canonicalJsonSha256(
      frontend.readerSummaryArtifact.content,
    ),
    topicMapSha256: canonicalJsonSha256(
      frontend.readerSummaryArtifact.content.topicMap,
    ),
    attestationSetSha256: canonicalJsonSha256(executionAttestations),
    completedTaskCount: executionAttestations.length,
    topicLabeler: {
      mode: "agent-runtime",
      physicalModel: identity.model,
      provider: identity.provider,
      runtime: identity.runtimeEngine,
      runtimeVersion: identity.runtimePackageVersion,
      reasoningEffort: identity.reasoningEffort,
      launcherSha256: identity.launcherSha256,
    },
  };
}

function buildExecutionAttestations(options) {
  const common = {
    schemaVersion: 1,
    canonicalRequestSha256: "a".repeat(64),
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort: options.legacyIdentity ? "xhigh" : "high",
    runtimeEngine:
      options.attestationRuntimeEngine ?? "subscription-runtime-cli",
    runtimePackageVersion: "0.1.0-main.2",
    launcherSha256: "b".repeat(64),
    selectedOutputKind:
      options.attestationOutputKind ?? "structured_output",
    selectedOutputSha256: "c".repeat(64),
  };
  return [
    {
      taskRole: "summary",
      attempt: "primary",
      normalizedOutputSha256: "d".repeat(64),
      attestation: {
        ...common,
        requestId: "summary-request",
        purpose: options.legacyIdentity
          ? "social_monitor.reader_summary.generate"
          : "social_monitor.reader_summary.generate.v2",
      },
    },
    {
      taskRole: "topic_label",
      attempt: "1",
      normalizedOutputSha256: "e".repeat(64),
      attestation: {
        ...common,
        requestId: "topic-label-request",
        purpose: options.legacyIdentity
          ? "social_monitor.reader_summary.topic_map.label"
          : "social_monitor.reader_summary.topic_map.label.v2",
      },
    },
    ...(options.relatedTopicRole === undefined
      ? []
      : [{
          taskRole: options.relatedTopicRole,
          attempt: "related-topic",
          normalizedOutputSha256: "f".repeat(64),
          attestation: {
            ...common,
            requestId: "related-topic-relation-request",
            purpose: options.legacyIdentity
              ? "social_monitor.reader_summary.verify_related_topic_relations"
              : "social_monitor.reader_summary.verify_related_topic_relations.v2",
          },
        }]),
  ];
}

function canonicalJsonSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJsonValue(value)))
    .digest("hex");
}

function canonicalJsonValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalJsonValue(item)]),
  );
}

function utcPeriod() {
  const startedAt = `${collectionDate}T00:00:00.000Z`;
  const endedAt = new Date(
    Date.parse(startedAt) + 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    cadence: "daily",
    startedAt,
    endedAt,
    timezone: "UTC",
    periodKey: `daily:${startedAt}:${endedAt}:UTC`,
  };
}
