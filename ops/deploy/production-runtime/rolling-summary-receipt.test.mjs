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
  writeFileSync(
    collectionPath,
    JSON.stringify({
      run: { collectionDate: date },
      blockingPassed: false,
      scans: [
        "github-trending-page",
        "hacker-news",
        "reddit",
        "rss",
        "x-twitter",
      ].map((providerKey) => ({
        providerKey,
        status: "succeeded",
        fetched: 10,
        inserted: 5,
        skippedDuplicates: 5,
        observability: { coverageState: "partial" },
      })),
    }),
  );
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
      ...JSON.parse(readFileSync(collectionPath, "utf8")),
      run: { collectionDate: "2026-08-14" },
    }),
  );

  run("validate-collection", collectionPath, date);
  runFailure("validate-collection", priorCollectionPath, date);
  const nonterminalCollection = JSON.parse(
    readFileSync(collectionPath, "utf8"),
  );
  nonterminalCollection.scans[0].status = "running";
  const nonterminalCollectionPath = join(directory, "collection.running.json");
  writeFileSync(
    nonterminalCollectionPath,
    JSON.stringify(nonterminalCollection),
  );
  runFailure("validate-collection", nonterminalCollectionPath, date);
  run(
    "write-receipt",
    receiptPath,
    evidencePath,
    collectionPath,
    runId,
    date,
    "2026-08-15T08:15:00.000Z",
    "1",
  );
  run("validate-receipt", receiptPath, runId, date);
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
  assert.equal(receipt.collection.finalDayQualityGatePassed, false);
  assert.equal(receipt.collection.providers.length, 5);
  assert.equal(receipt.publication.readerSummaryId, "summary-id");

  receipt.publication.status = "running";
  writeFileSync(invalidReceiptPath, JSON.stringify(receipt));
  runFailure("validate-receipt", invalidReceiptPath, runId, date);
} finally {
  rmSync(directory, { recursive: true, force: true });
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
