import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  readerSummaryProductionDayAttemptIdentity,
  readerSummaryProductionDayIdempotencyKey,
} from "./lib/reader-summary-production-day-attempt-identity.ts";
import {
  ReaderSummaryDbPublicationRecoveryStore,
  RecoverableReaderSummaryPublication,
} from "./lib/reader-summary-db-publication-reconciliation.ts";

const identity = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000002",
  periodKey:
    "daily:2026-08-13T00:00:00.000Z:2026-08-14T00:00:00.000Z:UTC",
  readerSummaryJobId: "30000000-0000-4000-8000-000000000003",
  readerSummaryArtifactId: "40000000-0000-4000-8000-000000000004",
};

test("natural day identity is deterministic while regeneration stays explicit", () => {
  const live = {
    tenantId: identity.tenantId,
    workspaceId: identity.workspaceId,
    periodKey: identity.periodKey,
    mode: { kind: "live-production" },
  };
  const first = readerSummaryProductionDayAttemptIdentity(live);
  assert.equal(readerSummaryProductionDayAttemptIdentity(live), first);
  assert.equal(
    readerSummaryProductionDayIdempotencyKey(first),
    `durable-reader-summary-daily:${first}`,
  );
  const regeneration = {
    ...live,
    mode: {
      kind: "historical-regeneration",
      datasetManifestSha256: "a".repeat(64),
      timestampPolicy: "published_at",
    },
  };
  assert.notEqual(
    readerSummaryProductionDayAttemptIdentity(regeneration),
    first,
  );
  assert.equal(
    readerSummaryProductionDayAttemptIdentity(regeneration),
    readerSummaryProductionDayAttemptIdentity(regeneration),
  );
});

test("crash after DB commit recovers the same artifact with zero model calls", async () => {
  const directory = mkdtempSync(join(tmpdir(), "summary-db-publication-"));
  try {
    let durablePublication = null;
    const modelCalls = 0;
    const recovery = new ReaderSummaryDbPublicationRecoveryStore(
      directory,
      "b".repeat(64),
    );
    const publication = new RecoverableReaderSummaryPublication(
      {
        publish: async (value) => {
          durablePublication = {
            jobId: value.finalJob.toSnapshot().id,
            artifactId: value.artifact.toSnapshot().readerSummaryId,
          };
          throw new Error("failpoint: after DB commit before terminal state");
        },
      },
      recovery,
      () => attestations,
    );

    await assert.rejects(publication.publish(command), /failpoint/u);
    assert.deepEqual(durablePublication, {
      jobId: identity.readerSummaryJobId,
      artifactId: identity.readerSummaryArtifactId,
    });
    const recovered = recovery.load(identity);
    assert.deepEqual(recovered, attestations);
    assert.equal(modelCalls, 0);

    assert.throws(
      () =>
        recovery.load({
          ...identity,
          readerSummaryJobId: "50000000-0000-4000-8000-000000000005",
        }),
      /does not match durable identity/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const command = {
  artifact: {
    toSnapshot: () => ({
      tenantId: identity.tenantId,
      workspaceId: identity.workspaceId,
      readerSummaryId: identity.readerSummaryArtifactId,
      period: { periodKey: identity.periodKey },
    }),
  },
  finalJob: {
    toSnapshot: () => ({ id: identity.readerSummaryJobId }),
  },
};

const attestations = [
  {
    taskRole: "summary",
    attempt: "primary",
    normalizedOutputSha256: "c".repeat(64),
    attestation: {
      schemaVersion: 1,
      requestId: "fixture-request",
      purpose: "social_monitor.reader_summary.generate",
      canonicalRequestSha256: "d".repeat(64),
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      runtimeEngine: "subscription-runtime-cli",
      runtimePackageVersion: "fixture-runtime",
      launcherSha256: "e".repeat(64),
      selectedOutputKind: "structured_output",
      selectedOutputSha256: "f".repeat(64),
    },
  },
];
