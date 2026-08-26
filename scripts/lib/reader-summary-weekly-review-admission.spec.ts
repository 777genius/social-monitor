import type {
  AgentRuntimeClientPort,
} from "../../libs/summary/ports/agent-runtime-client.port";
import type {
  ReaderSummaryWeeklyReviewManifestPort,
} from "../../libs/summary/ports/reader-summary-weekly-review-manifest.port";
import {
  PrismaReaderSummaryWeeklyReviewManifest,
} from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-review-manifest";
import type {
  PrismaSummaryClient,
} from "../../libs/summary/adapters/persistence/prisma/prisma-summary-client";

import {
  admitReaderSummaryWeeklyReviewManifest,
} from "./reader-summary-weekly-review-admission";
import { ReaderSummaryWeeklySubscriptionRuntimeFailureError } from "./reader-summary-weekly-execution-receipt";
import {
  completeDbState,
  reviewManifestFor,
} from "./reader-summary-weekly-production-test-fixture";

describe("reader summary weekly review admission", () => {
  it("uses only findBySeal during explicit replay", async () => {
    const dbState = completeDbState();
    const manifest = reviewManifestFor(dbState);
    const manifestStore = fakeManifestStore(manifest);
    const runtime = fakeRuntime();

    const admitted = await admitReaderSummaryWeeklyReviewManifest({
      dbState,
      replay: true,
      manifestStore,
      agentRuntime: runtime,
    });

    expect(admitted).toMatchObject({
      status: "complete",
      modelCallPerformed: false,
      writePerformed: false,
    });
    expect(manifestStore.findBySeal).toHaveBeenCalledTimes(1);
    expect(manifestStore.persist).not.toHaveBeenCalled();
    expect(runtime.runTask).not.toHaveBeenCalled();
  });

  it("fails closed on a missing replay manifest without provider or write calls", async () => {
    const manifestStore = fakeManifestStore(null);
    const runtime = fakeRuntime();

    const admitted = await admitReaderSummaryWeeklyReviewManifest({
      dbState: completeDbState(),
      replay: true,
      manifestStore,
      agentRuntime: runtime,
    });

    expect(admitted).toMatchObject({
      status: "partial",
      modelCallPerformed: false,
      writePerformed: false,
    });
    expect(manifestStore.findBySeal).toHaveBeenCalledTimes(1);
    expect(manifestStore.persist).not.toHaveBeenCalled();
    expect(runtime.runTask).not.toHaveBeenCalled();
  });

  it("fails closed on a corrupt replay manifest without provider or write calls", async () => {
    const dbState = completeDbState();
    const manifest = reviewManifestFor(dbState);
    const corrupt = Object.freeze({ ...manifest, canonicalJson: "{}" });
    const manifestStore = fakeManifestStore(corrupt);
    const runtime = fakeRuntime();

    const admitted = await admitReaderSummaryWeeklyReviewManifest({
      dbState,
      replay: true,
      manifestStore,
      agentRuntime: runtime,
    });

    expect(admitted).toMatchObject({
      status: "partial",
      modelCallPerformed: false,
      writePerformed: false,
    });
    expect(manifestStore.findBySeal).toHaveBeenCalledTimes(1);
    expect(manifestStore.persist).not.toHaveBeenCalled();
    expect(runtime.runTask).not.toHaveBeenCalled();
  });

  it("fails closed on an ambiguous canonical row thrown by the Prisma adapter", async () => {
    const queryRaw = jest.fn(async () => [Object.freeze({}), Object.freeze({})]);
    const manifestStore = new PrismaReaderSummaryWeeklyReviewManifest(
      { $queryRaw: queryRaw } as unknown as PrismaSummaryClient,
    );
    const runtime = fakeRuntime();

    const admitted = await admitReaderSummaryWeeklyReviewManifest({
      dbState: completeDbState(),
      replay: true,
      manifestStore,
      agentRuntime: runtime,
    });

    expect(admitted).toEqual({
      status: "partial",
      reasons: ["weekly review manifest is corrupt or does not match sealed DB authority"],
      modelCallPerformed: false,
      writePerformed: false,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(runtime.runTask).not.toHaveBeenCalled();
  });

  it("fails closed on an invalid persisted canonical scope from the Prisma adapter", async () => {
    const dbState = completeDbState();
    const manifest = reviewManifestFor(dbState);
    const queryRaw = jest.fn(async () => [Object.freeze({
      ...persistedManifestRow(manifest),
      canonical_record: Object.freeze({
        ...manifest.canonicalRecord,
        scope: Object.freeze({ type: "unsupported" }),
      }),
    })]);
    const manifestStore = new PrismaReaderSummaryWeeklyReviewManifest(
      { $queryRaw: queryRaw } as unknown as PrismaSummaryClient,
    );
    const runtime = fakeRuntime();

    const admitted = await admitReaderSummaryWeeklyReviewManifest({
      dbState,
      replay: true,
      manifestStore,
      agentRuntime: runtime,
    });

    expect(admitted).toEqual({
      status: "partial",
      reasons: ["weekly review manifest is corrupt or does not match sealed DB authority"],
      modelCallPerformed: false,
      writePerformed: false,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(runtime.runTask).not.toHaveBeenCalled();
  });

  it("reuses an authorized normal manifest without invoking its provider", async () => {
    const dbState = completeDbState();
    const manifestStore = fakeManifestStore(reviewManifestFor(dbState));
    const runtime = fakeRuntime();

    const admitted = await admitReaderSummaryWeeklyReviewManifest({
      dbState,
      replay: false,
      manifestStore,
      agentRuntime: runtime,
    });

    expect(admitted).toMatchObject({
      status: "complete",
      modelCallPerformed: false,
      writePerformed: false,
    });
    expect(manifestStore.findBySeal).toHaveBeenCalledTimes(1);
    expect(manifestStore.persist).not.toHaveBeenCalled();
    expect(runtime.runTask).not.toHaveBeenCalled();
  });

  it("fails closed on an authority-mismatched manifest without producer writes", async () => {
    const dbState = completeDbState();
    const manifest = reviewManifestFor(dbState);
    const mismatched = Object.freeze({ ...manifest, tenantId: "other-tenant" });
    const manifestStore = fakeManifestStore(mismatched);
    const runtime = fakeRuntime();

    const admitted = await admitReaderSummaryWeeklyReviewManifest({
      dbState,
      replay: false,
      manifestStore,
      agentRuntime: runtime,
    });

    expect(admitted).toMatchObject({
      status: "partial",
      modelCallPerformed: false,
      writePerformed: false,
    });
    expect(manifestStore.persist).not.toHaveBeenCalled();
    expect(runtime.runTask).not.toHaveBeenCalled();
  });

  it("rethrows a runtime failure whose safe message matches former corruption text", async () => {
    const runtime = fakeRuntime();
    const failure = new ReaderSummaryWeeklySubscriptionRuntimeFailureError(
      {
        retryable: true,
        code: "runtime_unavailable",
        causeCategory: "transport",
        reconnectRequired: true,
      },
      "Reader summary weekly review manifest lookup is ambiguous",
    );
    runtime.runTask.mockRejectedValue(failure);

    await expect(admitReaderSummaryWeeklyReviewManifest({
      dbState: completeDbState(),
      replay: false,
      manifestStore: fakeManifestStore(null),
      agentRuntime: runtime,
    })).rejects.toBe(failure);
  });

  it("rethrows PostgreSQL and transport manifest adapter errors unchanged", async () => {
    const errors = [
      Object.assign(new Error("serialization failure"), { code: "40001" }),
      Object.assign(new Error("connection reset"), { code: "ECONNRESET" }),
    ];

    for (const error of errors) {
      const manifestStore = new PrismaReaderSummaryWeeklyReviewManifest(
        {
          $queryRaw: jest.fn(async () => {
            throw error;
          }),
        } as unknown as PrismaSummaryClient,
      );

      await expect(admitReaderSummaryWeeklyReviewManifest({
        dbState: completeDbState(),
        replay: true,
        manifestStore,
        agentRuntime: fakeRuntime(),
      })).rejects.toBe(error);
    }
  });
});

const fakeManifestStore = (
  manifest: ReturnType<typeof reviewManifestFor> | null,
): jest.Mocked<ReaderSummaryWeeklyReviewManifestPort> => ({
  findBySeal: jest.fn(async () => manifest),
  persist: jest.fn(async () => {
    throw new Error("review admission attempted a manifest write");
  }),
});

const persistedManifestRow = (manifest: ReturnType<typeof reviewManifestFor>) => ({
  manifest_id: manifest.manifestId,
  manifest_sha256: manifest.manifestSha256,
  tenant_id: manifest.tenantId,
  workspace_id: manifest.workspaceId,
  scope_type: manifest.scope.type,
  scope_key: manifest.scopeKey,
  week_started_on: manifest.weekStartedOn,
  week_ended_on: manifest.weekEndedOn,
  seal_id: manifest.sealId,
  seal_sha256: manifest.sealSha256,
  review_authority: manifest.reviewAuthority,
  review_authority_sha256: manifest.reviewAuthoritySha256,
  observations: manifest.observations,
  citations: manifest.citations,
  model_response_sha256: manifest.modelResponseSha256,
  execution_attestation: manifest.executionAttestation,
  execution_attestation_sha256: manifest.executionAttestationSha256,
  canonical_record: manifest.canonicalRecord,
  canonical_bytes: manifest.toBytes(),
});

const fakeRuntime = (): jest.Mocked<AgentRuntimeClientPort> => ({
  runTask: jest.fn(async () => {
    throw new Error("review admission attempted a provider call");
  }),
  checkHealth: jest.fn(async () => ({
    status: "serving",
    runtimeEngine: "fixture",
    runtimeVersion: "fixture",
    warnings: [],
  })),
});
