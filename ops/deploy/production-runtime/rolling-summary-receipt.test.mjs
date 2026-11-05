import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";

const directory = mkdtempSync(join(tmpdir(), "rolling-summary-receipt-"));
const script = new URL("./rolling-summary-receipt.mjs", import.meta.url);
const fixtureWriter = new URL(
  "./test-fixtures/rolling-run-fake-artifact.mjs",
  import.meta.url,
);
const date = "2026-08-15";
const runId = "20260815T081500000Z";
const collectionPath = join(directory, "collection.json");
const evidencePath = join(directory, "evidence.json");
const frontendPath = join(directory, "frontend.json");
const receiptPath = join(directory, "receipt.json");
const invalidReceiptPath = join(directory, "invalid-receipt.json");
const priorCollectionPath = join(directory, "collection.2026-08-14.json");
const fixtureCollectionPath = join(directory, "collection.fixture.json");
let canonicalCollection;

try {
  runFixture("collection", fixtureCollectionPath, runId, date, "false");
  runFixture("evidence", evidencePath, runId, date, frontendPath);
  canonicalCollection = JSON.parse(readFileSync(fixtureCollectionPath, "utf8"));
  runFixture("collection", collectionPath, runId, date, "true");
  writeFileSync(
    priorCollectionPath,
    JSON.stringify({
      ...collectionFixture(),
      run: { collectionDate: "2026-08-14" },
    }),
  );

  run("validate-collection", collectionPath, date);
  run("validate-collection-result", collectionPath, date, "1");
  runFailure("validate-collection-result", collectionPath, date, "0");
  runFailure("validate-collection-result", collectionPath, date, "2");
  runFailure(
    "validate-collection-result",
    fixtureCollectionPath,
    date,
    "1",
  );
  runFailure("validate-collection", priorCollectionPath, date);

  const accumulatedCollectionPath = join(
    directory,
    "collection.accumulated.json",
  );
  const accumulatedCollection = collectionFixture();
  accumulatedCollection.scans[0].observability.slo.evaluatedItemCount = 25;
  accumulatedCollection.targetWindow.providerCounts["github-trending-page"] =
    25;
  accumulatedCollection.targetWindow.feedItemCount += 15;
  writeFileSync(
    accumulatedCollectionPath,
    JSON.stringify(accumulatedCollection),
  );
  run("validate-collection", accumulatedCollectionPath, date);

  const deduplicatedCollectionPath = join(
    directory,
    "collection.deduplicated.json",
  );
  const deduplicatedCollection = collectionFixture();
  deduplicatedCollection.scans[0].observability.slo.evaluatedItemCount = 5;
  deduplicatedCollection.scans[0].observability.slo.coverageRatio = 0.5;
  deduplicatedCollection.scans[0].observability.slo.met = false;
  deduplicatedCollection.scans[0].observability.slo.reasons = [
    "target_shortfall",
  ];
  deduplicatedCollection.scans[0].observability.slo.retryDisposition =
    "immediate";
  deduplicatedCollection.targetWindow.providerCounts["github-trending-page"] =
    5;
  deduplicatedCollection.targetWindow.feedItemCount -= 5;
  writeFileSync(
    deduplicatedCollectionPath,
    JSON.stringify(deduplicatedCollection),
  );
  run("validate-collection", deduplicatedCollectionPath, date);

  for (const [label, mutate] of [
    ["schema-less", (collection) => delete collection.schemaVersion],
    ["wrong schema", (collection) => (collection.schemaVersion = 2)],
    ["wrong format", (collection) => (collection.artifactFormat = "wrong")],
    ["wrong generator", (collection) => (collection.generatedBy = "wrong")],
    ["wrong database", (collection) => (collection.inputs.database = "wrong")],
    ["missing scope", (collection) => delete collection.inputs.scope],
    [
      "foreign scope",
      (collection) =>
        (collection.inputs.scope = {
          tenantId: "00000000-0000-7000-8000-000000006101",
          workspaceId: "00000000-0000-7000-8000-000000006103",
        }),
    ],
    ["null scope", (collection) => (collection.inputs.scope = null)],
    [
      "wrong window",
      (collection) =>
        (collection.inputs.targetPublishedWindow.endExclusive =
          "2026-08-17T00:00:00.000Z"),
    ],
    [
      "duplicate provider",
      (collection) => (collection.scans[4].providerKey = "rss"),
    ],
    [
      "unknown provider",
      (collection) => (collection.scans[4].providerKey = "unknown"),
    ],
    ["missing provider", (collection) => collection.scans.pop()],
    [
      "duplicate requested provider",
      (collection) => (collection.inputs.providerKeys[4] = "rss"),
    ],
    [
      "nonterminal scan",
      (collection) => (collection.scans[0].status = "running"),
    ],
    ["malformed scan", (collection) => delete collection.scans[0].fetched],
    [
      "projected-less scan",
      (collection) => delete collection.scans[0].projected,
    ],
    [
      "warning-less scan",
      (collection) => delete collection.scans[0].warningCount,
    ],
    [
      "attempt-less scan",
      (collection) => delete collection.scans[0].attemptCount,
    ],
    [
      "mode-less scan",
      (collection) => delete collection.scans[0].acquisitionMode,
    ],
    [
      "mismatched binding",
      (collection) =>
        (collection.scans[0].bindingFingerprint = "other-binding"),
    ],
    [
      "mismatched acquisition partition",
      (collection) => {
        collection.model.liveNetworkProviderKeys = providerKeysWithoutGithub();
        collection.model.durableSnapshotReuseProviderKeys = [
          "github-trending-page",
        ];
      },
    ],
    [
      "missing SLO target",
      (collection) =>
        delete collection.scans[0].observability.slo.targetItemCount,
    ],
    [
      "missing SLO coverage",
      (collection) =>
        delete collection.scans[0].observability.slo.coverageRatio,
    ],
    [
      "unknown SLO reason",
      (collection) =>
        (collection.scans[0].observability.slo.reasons = ["unknown_reason"]),
    ],
    [
      "unknown retry disposition",
      (collection) =>
        (collection.scans[0].observability.slo.retryDisposition = "blocked"),
    ],
    [
      "unknown pagination stop",
      (collection) =>
        (collection.scans[0].observability.paginationStopReason = "unknown"),
    ],
    [
      "missing successful freshness lag",
      (collection) =>
        delete collection.scans[0].observability.slo.freshnessLagSeconds,
    ],
    [
      "missing successful freshness proof",
      (collection) => (collection.scans[0].observability.freshness = {}),
    ],
    [
      "contradictory retry disposition",
      (collection) =>
        (collection.scans[0].observability.slo.retryDisposition = "immediate"),
    ],
    [
      "contradictory window total",
      (collection) => (collection.targetWindow.feedItemCount = 123),
    ],
    [
      "foreign window provider",
      (collection) => (collection.targetWindow.providerCounts.foreign = 0),
    ],
    ["target-less", (collection) => collection.targets.pop()],
    ["fresh-window-less", (collection) => delete collection.freshWindow],
    [
      "unsafe payload privacy",
      (collection) =>
        (collection.model.rawProviderPayloadPersistedInReport = true),
    ],
    [
      "unsafe text privacy",
      (collection) => (collection.model.rawPostTextPersistedInReport = true),
    ],
    [
      "unsafe config privacy",
      (collection) =>
        (collection.model.rawProviderConfigPersistedInReport = true),
    ],
    [
      "unsafe secret gate",
      (collection) => (collection.qualityGates.noRawSecretFragments = false),
    ],
    [
      "untruthful blocking result",
      (collection) => (collection.blockingPassed = false),
    ],
    [
      "unknown quality gate",
      (collection) => (collection.qualityGates.unknownGate = true),
    ],
    [
      "freshness lag contradiction",
      (collection) => {
        collection.scans[0].observability.slo.freshnessLagSeconds = 99999;
        collection.scans[0].observability.freshness.lagToWindowEndSeconds = 99999;
      },
    ],
    [
      "forged recent freshness timestamp",
      (collection) => {
        const observation = collection.scans[0].observability;
        observation.freshness.oldestAcceptedPublishedAt =
          "2026-08-15T00:00:00.000Z";
        observation.freshness.newestAcceptedPublishedAt =
          "2026-08-15T00:01:00.000Z";
        observation.freshness.lagToWindowEndSeconds = 60;
        observation.slo.freshnessLagSeconds = 60;
      },
    ],
    [
      "out-of-window freshness timestamp",
      (collection) => {
        const observation = collection.scans[0].observability;
        observation.freshness.oldestAcceptedPublishedAt =
          "2026-08-14T23:59:00.000Z";
      },
    ],
    [
      "empty target window contradiction",
      (collection) => {
        collection.targetWindow = {
          ...collection.targetWindow,
          feedItemCount: 0,
          providerCounts: {},
          newestItemAtByProvider: {},
          sourceQueryLaneCoverageByProvider: {},
          distinctSourceQueryLaneCountByProvider: {},
        };
      },
    ],
  ]) {
    assertCollectionRejected(label, mutate);
  }

  const passingCollectionPath = join(directory, "collection.passing.json");
  const passingCollection = collectionFixture();
  passingCollection.blockingPassed = true;
  passingCollection.scans[2].status = "succeeded";
  passingCollection.scans[2].observability.coverageState = "complete";
  writeFileSync(passingCollectionPath, JSON.stringify(passingCollection));
  run(
    "write-receipt",
    receiptPath,
    evidencePath,
    frontendPath,
    passingCollectionPath,
    runId,
    date,
    "2026-08-15T08:15:00.000Z",
    "0",
  );
  run("validate-receipt", receiptPath, runId, date);
  writeFileSync(`${receiptPath}.next`, "stale\n", { mode: 0o600 });
  chmodSync(`${receiptPath}.next`, 0o444);
  run(
    "write-receipt",
    receiptPath,
    evidencePath,
    frontendPath,
    passingCollectionPath,
    runId,
    date,
    "2026-08-15T08:15:00.000Z",
    "0",
  );
  run("validate-receipt", receiptPath, runId, date);

  const validEvidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const validFrontend = JSON.parse(readFileSync(frontendPath, "utf8"));
  for (const [label, artifact, mutate] of [
    ["wrong evidence schema", "evidence", (value) => (value.schemaVersion = 999)],
    [
      "fixture evidence provenance",
      "evidence",
      (value) => (value.provenance.fixtureOnly = true),
    ],
    [
      "foreign evidence scope",
      "evidence",
      (value) => (value.scope.workspaceId = "foreign-workspace"),
    ],
    [
      "stale evidence period",
      "evidence",
      (value) => (value.period.startedAt = "2026-08-14T00:00:00.000Z"),
    ],
    [
      "unbound durable readback",
      "evidence",
      (value) => (value.durableReadback.summaryContentSha256 = "f".repeat(64)),
    ],
    ["empty frontend", "frontend", (value) => Object.keys(value).forEach((key) => delete value[key])],
    [
      "foreign frontend scope",
      "frontend",
      (value) => (value.workspaceId = "foreign-workspace"),
    ],
    [
      "mutated frontend content",
      "frontend",
      (value) => (value.readerSummaryArtifact.content.narrative = "mutated"),
    ],
  ]) {
    const evidence = JSON.parse(JSON.stringify(validEvidence));
    const frontend = JSON.parse(JSON.stringify(validFrontend));
    mutate(artifact === "evidence" ? evidence : frontend);
    writeFileSync(evidencePath, JSON.stringify(evidence));
    writeFileSync(frontendPath, JSON.stringify(frontend));
    runFailure(
      "write-receipt",
      join(directory, `invalid-${label.replaceAll(" ", "-")}.json`),
      evidencePath,
      frontendPath,
      passingCollectionPath,
      runId,
      date,
      "2026-08-15T08:15:00.000Z",
      "0",
    );
  }
  writeFileSync(evidencePath, JSON.stringify(validEvidence));
  writeFileSync(frontendPath, JSON.stringify(validFrontend));

  const noSignalEvidencePath = join(directory, "no-signal-evidence.json");
  const noSignalFrontendPath = join(directory, "no-signal-frontend.json");
  const noSignalReceiptPath = join(directory, "no-signal-receipt.json");
  runFixture(
    "no-signal-evidence",
    noSignalEvidencePath,
    runId,
    date,
    noSignalFrontendPath,
  );
  run(
    "write-receipt",
    noSignalReceiptPath,
    noSignalEvidencePath,
    noSignalFrontendPath,
    collectionPath,
    runId,
    date,
    "2026-08-15T00:15:00.000Z",
    "1",
  );
  run("validate-receipt", noSignalReceiptPath, runId, date);
  const noSignalReceipt = JSON.parse(
    readFileSync(noSignalReceiptPath, "utf8"),
  );
  assert.equal(noSignalReceipt.summary.status, "no_signal");
  assert.equal(noSignalReceipt.summary.selectedFeedItemCount, 0);
  for (const [label, mutate] of [
    ["no-signal-citations", (value) => (value.summary.citationCount = 1)],
    ["no-signal-provider", (value) => (value.summary.providerCount = 1)],
    ["no-signal-flag", (value) => (value.summary.qualityFlags = [])],
  ]) {
    const invalid = JSON.parse(JSON.stringify(noSignalReceipt));
    mutate(invalid);
    const invalidPath = join(directory, `${label}.json`);
    writeFileSync(invalidPath, JSON.stringify(invalid));
    runFailure("validate-receipt", invalidPath, runId, date);
  }

  const invalidNoSignalFrontend = JSON.parse(
    readFileSync(noSignalFrontendPath, "utf8"),
  );
  invalidNoSignalFrontend.readerSummaryArtifact.lineage.modelVersion =
    "codex:gpt-5.6-sol:xhigh";
  writeFileSync(
    noSignalFrontendPath,
    JSON.stringify(invalidNoSignalFrontend),
  );
  runFailure(
    "write-receipt",
    join(directory, "invalid-no-signal-lineage.json"),
    noSignalEvidencePath,
    noSignalFrontendPath,
    collectionPath,
    runId,
    date,
    "2026-08-15T00:15:00.000Z",
    "1",
  );

  const degradedReceiptPath = join(directory, "degraded-receipt.json");
  run(
    "write-receipt",
    degradedReceiptPath,
    evidencePath,
    frontendPath,
    collectionPath,
    runId,
    date,
    "2026-08-15T12:15:00.000Z",
    "1",
  );
  run("validate-receipt", degradedReceiptPath, runId, date);
  runFailure(
    "write-receipt",
    join(directory, "contradictory-receipt.json"),
    evidencePath,
    frontendPath,
    collectionPath,
    runId,
    date,
    "2026-08-15T12:15:00.000Z",
    "0",
  );
  runFailure(
    "write-receipt",
    join(directory, "stale-receipt.json"),
    evidencePath,
    frontendPath,
    priorCollectionPath,
    runId,
    date,
    "2026-08-15T08:15:00.000Z",
    "0",
  );

  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  const degradedReceipt = JSON.parse(readFileSync(degradedReceiptPath, "utf8"));
  assert.equal(degradedReceipt.collection.commandExitCode, 1);
  assert.equal(degradedReceipt.collection.finalDayQualityGatePassed, false);
  assert.equal(receipt.collection.finalDayQualityGatePassed, true);
  assert.equal(receipt.collection.providers.length, 5);
  assert.equal(
    receipt.publication.readerSummaryId,
    "22222222-2222-4222-8222-222222222222",
  );

  for (const [, mutate] of [
    ["collection-less", (value) => delete value.collection],
    ["schema-less", (value) => delete value.schemaVersion],
    ["format-less", (value) => delete value.artifactFormat],
    ["exit-less", (value) => delete value.collection.commandExitCode],
    [
      "untruthful exit type",
      (value) => (value.collection.commandExitCode = "1"),
    ],
    [
      "quality-less",
      (value) => delete value.collection.finalDayQualityGatePassed,
    ],
    ["provider-less", (value) => value.collection.providers.pop()],
    [
      "duplicate provider",
      (value) => (value.collection.providers[4].providerKey = "rss"),
    ],
    [
      "nonterminal provider",
      (value) => (value.collection.providers[0].status = "running"),
    ],
    [
      "incomplete provider",
      (value) => delete value.collection.providers[0].coverageState,
    ],
    [
      "untruthful quality",
      (value) => (value.collection.finalDayQualityGatePassed = true),
    ],
    ["period-less", (value) => delete value.period],
    ["summary-less", (value) => delete value.summary],
    [
      "empty publication id",
      (value) => (value.publication.readerSummaryId = ""),
    ],
    ["unsafe redaction", (value) => (value.redaction.secretsIncluded = true)],
    [
      "unsafe provider payload redaction",
      (value) => (value.redaction.rawProviderPayloadIncluded = true),
    ],
    [
      "unsafe token redaction",
      (value) => (value.redaction.tokenValuesIncluded = true),
    ],
  ]) {
    const invalid = JSON.parse(JSON.stringify(degradedReceipt));
    mutate(invalid);
    writeFileSync(invalidReceiptPath, JSON.stringify(invalid));
    runFailure("validate-receipt", invalidReceiptPath, runId, date);
  }

  receipt.publication.status = "running";
  writeFileSync(invalidReceiptPath, JSON.stringify(receipt));
  runFailure("validate-receipt", invalidReceiptPath, runId, date);
  writeFileSync(invalidReceiptPath, "null\n");
  runFailure("validate-receipt", invalidReceiptPath, runId, date);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

function collectionFixture() {
  return JSON.parse(JSON.stringify(canonicalCollection));
}

function providerKeysWithoutGithub() {
  return ["hacker-news", "reddit", "rss", "x-twitter"];
}

function assertCollectionRejected(label, mutate) {
  const collection = collectionFixture();
  mutate(collection);
  const path = join(
    directory,
    `collection.invalid.${label.replaceAll(" ", "-")}.json`,
  );
  writeFileSync(path, JSON.stringify(collection));
  runFailureWithLabel(label, "validate-collection", path, date);
}

function run(...args) {
  const result = spawnSync(process.execPath, [script.pathname, ...args], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}

function runFixture(...args) {
  const result = spawnSync(
    process.execPath,
    [fixtureWriter.pathname, ...args],
    {
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
}

function runFailure(...args) {
  const result = spawnSync(process.execPath, [script.pathname, ...args], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
}

function runFailureWithLabel(label, ...args) {
  const result = spawnSync(process.execPath, [script.pathname, ...args], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, label);
}

process.stdout.write("rolling-summary-receipt tests passed\n");
