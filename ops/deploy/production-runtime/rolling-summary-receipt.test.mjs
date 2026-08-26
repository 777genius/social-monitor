import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";

const directory = mkdtempSync(join(tmpdir(), "rolling-summary-receipt-"));
const script = new URL("./rolling-summary-receipt.mjs", import.meta.url);
const date = "2026-08-15";
const runId = "20260815T081500000Z";
const collectionPath = join(directory, "collection.json");
const evidencePath = join(directory, "evidence.json");
const receiptPath = join(directory, "receipt.json");
const invalidReceiptPath = join(directory, "invalid-receipt.json");
const priorCollectionPath = join(directory, "collection.2026-08-14.json");

try {
  writeFileSync(collectionPath, JSON.stringify(collectionFixture()));
  writeFileSync(
    evidencePath,
    JSON.stringify({
      result: {
        readerSummaryJobId: "job-id",
        readerSummaryId: "summary-id",
        status: "completed",
      },
      redaction: { secretsIncluded: false },
    }),
  );
  writeFileSync(
    priorCollectionPath,
    JSON.stringify({
      ...collectionFixture(),
      run: { collectionDate: "2026-08-14" },
    }),
  );

  run("validate-collection", collectionPath, date);
  const scopedCollection = collectionFixture();
  scopedCollection.inputs.scope = {
    tenantId: "00000000-0000-7000-8000-000000006101",
    workspaceId: "00000000-0000-7000-8000-000000006102",
  };
  const scopedCollectionPath = join(directory, "collection.scoped.json");
  writeFileSync(scopedCollectionPath, JSON.stringify(scopedCollection));
  run("validate-collection", scopedCollectionPath, date);
  runFailure("validate-collection", priorCollectionPath, date);

  for (const [label, mutate] of [
    ["schema-less", (collection) => delete collection.schemaVersion],
    ["wrong schema", (collection) => (collection.schemaVersion = 2)],
    ["wrong format", (collection) => (collection.artifactFormat = "wrong")],
    ["wrong generator", (collection) => (collection.generatedBy = "wrong")],
    ["wrong database", (collection) => (collection.inputs.database = "wrong")],
    [
      "foreign scope",
      (collection) =>
        (collection.inputs.scope = {
          tenantId: "00000000-0000-7000-8000-000000006101",
          workspaceId: "foreign",
        }),
    ],
    [
      "wrong window",
      (collection) =>
        (collection.inputs.targetPublishedWindow.endExclusive =
          "2026-08-17T00:00:00.000Z"),
    ],
    ["duplicate provider", (collection) => (collection.scans[4].providerKey = "rss")],
    ["unknown provider", (collection) => (collection.scans[4].providerKey = "unknown")],
    ["missing provider", (collection) => collection.scans.pop()],
    [
      "duplicate requested provider",
      (collection) => (collection.inputs.providerKeys[4] = "rss"),
    ],
    ["nonterminal scan", (collection) => (collection.scans[0].status = "running")],
    ["malformed scan", (collection) => delete collection.scans[0].fetched],
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
    passingCollectionPath,
    runId,
    date,
    "2026-08-15T08:15:00.000Z",
    "0",
  );
  run("validate-receipt", receiptPath, runId, date);

  const degradedReceiptPath = join(directory, "degraded-receipt.json");
  run(
    "write-receipt",
    degradedReceiptPath,
    evidencePath,
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
    priorCollectionPath,
    runId,
    date,
    "2026-08-15T08:15:00.000Z",
    "0",
  );

  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  const degradedReceipt = JSON.parse(
    readFileSync(degradedReceiptPath, "utf8"),
  );
  assert.equal(degradedReceipt.collection.commandExitCode, 1);
  assert.equal(degradedReceipt.collection.finalDayQualityGatePassed, false);
  assert.equal(receipt.collection.finalDayQualityGatePassed, true);
  assert.equal(receipt.collection.providers.length, 5);
  assert.equal(receipt.publication.readerSummaryId, "summary-id");

  for (const [label, mutate] of [
    ["collection-less", (value) => delete value.collection],
    ["schema-less", (value) => delete value.schemaVersion],
    ["format-less", (value) => delete value.artifactFormat],
    ["exit-less", (value) => delete value.collection.commandExitCode],
    ["untruthful exit type", (value) => (value.collection.commandExitCode = "1")],
    ["quality-less", (value) => delete value.collection.finalDayQualityGatePassed],
    ["provider-less", (value) => value.collection.providers.pop()],
    ["duplicate provider", (value) => (value.collection.providers[4].providerKey = "rss")],
    ["nonterminal provider", (value) => (value.collection.providers[0].status = "running")],
    ["incomplete provider", (value) => delete value.collection.providers[0].coverageState],
    ["untruthful quality", (value) => (value.collection.finalDayQualityGatePassed = true)],
  ]) {
    const invalid = structuredClone(degradedReceipt);
    mutate(invalid);
    writeFileSync(invalidReceiptPath, JSON.stringify(invalid));
    runFailure("validate-receipt", invalidReceiptPath, runId, date);
  }

  receipt.publication.status = "running";
  writeFileSync(invalidReceiptPath, JSON.stringify(receipt));
  runFailure("validate-receipt", invalidReceiptPath, runId, date);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

function collectionFixture() {
  const providerKeys = [
    "github-trending-page",
    "hacker-news",
    "reddit",
    "rss",
    "x-twitter",
  ];
  return {
    schemaVersion: 1,
    artifactFormat: "reader-summary-clean-real-day-collection-v1",
    generatedBy: "npm run run:reader-summary-clean-real-day-collection",
    model: {
      rawProviderPayloadPersistedInReport: false,
      rawPostTextPersistedInReport: false,
      rawProviderConfigPersistedInReport: false,
    },
    inputs: {
      database: "local-postgres",
      providerKeys,
      targetPublishedWindow: {
        startInclusive: `${date}T00:00:00.000Z`,
        endExclusive: "2026-08-16T00:00:00.000Z",
      },
    },
    run: { collectionDate: date },
    scans: providerKeys.map((providerKey) => ({
      providerKey,
      status: providerKey === "reddit" ? "failed" : "succeeded",
      fetched: providerKey === "reddit" ? 0 : 10,
      inserted: providerKey === "reddit" ? 0 : 5,
      skippedDuplicates: providerKey === "reddit" ? 0 : 5,
      observability: {
        coverageState: providerKey === "reddit" ? "unavailable" : "partial",
      },
    })),
    qualityGates: { noRawSecretFragments: true },
    blockingPassed: false,
  };
}

function assertCollectionRejected(label, mutate) {
  const collection = collectionFixture();
  mutate(collection);
  const path = join(
    directory,
    `collection.invalid.${label.replaceAll(" ", "-")}.json`,
  );
  writeFileSync(path, JSON.stringify(collection));
  runFailure("validate-collection", path, date);
}

function run(...args) {
  const result = spawnSync(process.execPath, [script.pathname, ...args], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}

function runFailure(...args) {
  const result = spawnSync(process.execPath, [script.pathname, ...args], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
}

process.stdout.write("rolling-summary-receipt tests passed\n");
