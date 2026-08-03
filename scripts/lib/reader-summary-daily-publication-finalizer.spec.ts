import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readerSummaryDailyModelJobIdentity } from "@social-monitor/summary/domain/value-objects/reader-summary-daily-model-job";
import type { ReaderSummaryDailyExecutionWork } from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";
import {
  FixedClock,
  tenantId as toTenantId,
  workspaceId as toWorkspaceId,
} from "@social-monitor/shared-kernel";

import {
  CanonicalReaderSummaryDailyPublicationFinalizer,
  createReaderSummaryDailyAuthorityEvidenceSelector,
  createReaderSummaryDailyCaptureContext,
} from "./reader-summary-daily-publication-finalizer";

const tenantId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000002";

describe("CanonicalReaderSummaryDailyPublicationFinalizer", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "daily-publication-finalizer-"));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("installs and verifies canonical public files before returning DB finalization input", async () => {
    const capture = jest.fn(async () => captured());
    const finalizer = new CanonicalReaderSummaryDailyPublicationFinalizer({
      publicDirectory: directory,
      capture,
    });
    const result = await finalizer.publish(input());

    expect(capture).toHaveBeenCalledTimes(1);
    expect(result.publicEvidenceSha256).toBe(hash(captured().evidenceBytes));
    expect(result.publicFrontendSha256).toBe(hash(captured().frontendBytes));
    expect(readFileSync(join(directory,
      "durable-reader-summary-2026-07-31.v1.json"))).toEqual(captured().evidenceBytes);
  });

  it("replays byte-identically and rejects a conflicting public file", async () => {
    const finalizer = new CanonicalReaderSummaryDailyPublicationFinalizer({
      publicDirectory: directory,
      capture: async () => captured(),
    });
    await finalizer.publish(input());
    await expect(finalizer.publish(input())).resolves.toMatchObject({
      publicationId: captured().publicationId,
    });
    const evidencePath = join(
      directory,
      "durable-reader-summary-2026-07-31.v1.json",
    );
    rmSync(evidencePath);
    writeFileSync(evidencePath, "conflict");
    await expect(finalizer.publish(input())).rejects.toThrow(/invalid|bind/u);
  });

  it("keeps the first valid public-file winner across a publication crash", async () => {
    const first = captured("first-operational-time");
    const replay = captured("later-operational-time");
    const capture = jest.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(replay);
    const finalizer = new CanonicalReaderSummaryDailyPublicationFinalizer({
      publicDirectory: directory,
      capture,
    });

    const initial = await finalizer.publish(input());
    const repeated = await finalizer.publish(input());

    expect(repeated.publicEvidenceSha256).toBe(initial.publicEvidenceSha256);
    expect(repeated.publicFrontendSha256).toBe(initial.publicFrontendSha256);
    expect(repeated.publicEvidenceSha256).not.toBe(hash(replay.evidenceBytes));
  });

  it("uses the authority cutoff only for source reads, not operational time", async () => {
    const authorityPath = join(directory, "authority.json");
    const responsePath = join(directory, "response.json");
    const receiptPath = join(directory, "receipt.json");
    const authorityBytes = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      tenantId,
      workspaceId,
      requestedUtcDate: "2026-07-31",
      ingestionCutoff: "2026-08-01T01:00:00.000Z",
      items: [],
    }));
    writeFileSync(authorityPath, authorityBytes);
    writeFileSync(responsePath, "response");
    writeFileSync(receiptPath, "receipt");
    const operationalClock = new FixedClock(
      new Date("2026-08-02T09:30:00.000Z"),
    );

    const context = createReaderSummaryDailyCaptureContext({
      env: {
        DURABLE_READER_SUMMARY_DAILY_RESPONSE_PATH: responsePath,
        DURABLE_READER_SUMMARY_DAILY_RECEIPT_PATH: receiptPath,
        DURABLE_READER_SUMMARY_DAILY_AUTHORITY_PATH: authorityPath,
        DURABLE_READER_SUMMARY_DAILY_MODEL_JOB_IDENTITY: "d".repeat(64),
      },
      operationalClock,
    });

    expect(context.dailyReplay?.ingestionCutoff).toBe(
      "2026-08-01T01:00:00.000Z",
    );
    expect(context.operationalClock.now().toISOString()).toBe(
      "2026-08-02T09:30:00.000Z",
    );
    const select = jest.fn(async () => ({
      rankingPolicyVersion: "fixture-v1",
      sourceWindow: {
        windowId: "fixture-window",
        startedAt: new Date("2026-07-31T00:00:00.000Z"),
        endedAt: new Date("2026-08-01T00:00:00.000Z"),
        selectedFeedItemIds: [],
        storyClusterIds: [],
      },
      clusters: [],
      selectedEvidence: [],
    }));
    const selector = createReaderSummaryDailyAuthorityEvidenceSelector({
      delegate: { select },
      authority: context.dailyReplay!.authority,
    });
    await selector.select({
      tenantId: toTenantId(tenantId),
      workspaceId: toWorkspaceId(workspaceId),
      scope: { type: "workspace" },
      period: {
        cadence: "daily",
        startedAt: new Date("2026-07-31T00:00:00.000Z"),
        endedAt: new Date("2026-08-01T00:00:00.000Z"),
        timezone: "UTC",
        periodKey: "daily:2026-07-31T00:00:00.000Z:2026-08-01T00:00:00.000Z:UTC",
      },
      maxItems: 200,
      observedThrough: operationalClock.now(),
    });
    expect(select).toHaveBeenCalledWith(expect.objectContaining({
      observedThrough: new Date("2026-08-01T01:00:00.000Z"),
    }));
  });
});

const input = () => ({
  work: work(),
  responseBytes: Buffer.from("response"),
  receiptBytes: Buffer.from("receipt"),
});

const captured = (operationalMarker = "current-operational-time") => {
  const readerSummaryJobId = "30000000-0000-4000-8000-000000000003";
  const readerSummaryArtifactId = "40000000-0000-4000-8000-000000000004";
  return {
    readerSummaryJobId,
    readerSummaryArtifactId,
    publicationId: readerSummaryArtifactId,
    reportSha256: "a".repeat(64),
    proofSha256: "b".repeat(64),
    weeklyEvidenceSha256: "c".repeat(64),
    evidenceBytes: Buffer.from(JSON.stringify({
      operationalMarker,
      provenance: { dailySourceAuthority: {
        canonicalSha256: work().sourceAuthority.canonicalSha256,
        modelJobIdentity: work().modelJob.value,
      } },
      scope: { tenantId, workspaceId },
      result: { readerSummaryJobId, readerSummaryId: readerSummaryArtifactId },
    })),
    frontendBytes: Buffer.from(JSON.stringify({
      tenantId,
      workspaceId,
      operationalMarker,
      readerSummaryArtifact: { readerSummaryId: readerSummaryArtifactId },
    })),
  };
};

const work = (): ReaderSummaryDailyExecutionWork => {
  const sourceBytes = Buffer.from(JSON.stringify({
    schemaVersion: 1, tenantId, workspaceId,
    requestedUtcDate: "2026-07-31",
    ingestionCutoff: "2026-08-01T01:00:00.000Z", items: [],
  }));
  const sourceSha = hash(sourceBytes);
  return {
    tenantId, workspaceId, requestedUtcDate: "2026-07-31",
    eligibleThrough: "2026-07-31",
    sourceAuthority: {
      requestedUtcDate: "2026-07-31",
      ingestionCutoff: "2026-08-01T01:00:00.000Z",
      canonicalBytes: sourceBytes, canonicalSha256: sourceSha,
    },
    modelJob: readerSummaryDailyModelJobIdentity({
      tenantId, workspaceId, requestedUtcDate: "2026-07-31",
      sourceAuthoritySha256: sourceSha,
    }),
    modelJobState: "COMPLETED",
    lease: {
      owner: "worker", fencingToken: 1n,
      leasedAt: "2026-08-01T01:00:00.000Z",
      expiresAt: "2026-08-01T01:20:00.000Z",
      absoluteExpiresAt: "2026-08-01T08:00:00.000Z",
    },
  };
};

const hash = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");
