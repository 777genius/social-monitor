import {
  causationId,
  correlationId,
  eventId,
} from "@social-monitor/shared-kernel";

import { ReaderSummaryArtifact, ReaderSummaryJob } from "../../../domain";
import {
  evaluateGitHubProjection,
  githubBoardArtifact,
  githubProjectionInput,
} from "../../../domain/policies/reader-summary-github-projection-policy.spec-support";
import type {
  ReaderSummaryPublicationCommand,
  ReaderSummaryRecoveryFinalizationCommand,
  ReaderSummaryRecoveryProvenance,
} from "../../../ports";
import * as publicationProof from "../reader-summary-publication-proof";
import type { ReaderSummaryPublicationPayload } from "../reader-summary-publication-proof";
import { PrismaReaderSummaryPublication } from "./prisma-reader-summary-publication";
import { PrismaReaderSummaryRecoveryFinalization } from "./prisma-reader-summary-recovery-finalization";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import type { PrismaSummaryTransactionOptions } from "./prisma-summary-transaction";

const expectedRecoveryFinalizationTransactionOptions: PrismaSummaryTransactionOptions =
  Object.freeze({
    maxWait: 30_000,
    timeout: 300_000,
    isolationLevel: "Serializable",
  });

describe("PrismaReaderSummaryRecoveryFinalization", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it(
    "transactionally finalizes publication, proof, and receipt on first use",
    async () => {
      const fixture = createFixture();
      mockPublicationPayload(fixture.publicationPayload);
      const queryRaw = jest.fn(async (...args: readonly unknown[]) =>
        sqlOutcome(args, "published"),
      );
      const transaction = recoveryFinalizationTransaction(queryRaw);
      const finalization = new PrismaReaderSummaryRecoveryFinalization(
        prismaClient(transaction, queryRaw),
      );

      await expect(finalization.finalize(fixture.command)).resolves.toBe(
        "published",
      );

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(transaction.mock.calls[0]?.[1]).toEqual(
        expectedRecoveryFinalizationTransactionOptions,
      );
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(String(queryRaw.mock.calls[0]?.[0])).toContain(
        "finalize_reader_summary_recovery",
      );
      expect(JSON.parse(String(queryRaw.mock.calls[0]?.[1]))).toMatchObject({
        readerSummaryJobId: fixture.publicationPayload.readerSummaryJobId,
        proofSha256: fixture.publicationPayload.proofSha256,
      });
      expect(JSON.parse(String(queryRaw.mock.calls[0]?.[2]))).toMatchObject({
        recoveryKind: "SUMMARY_ONLY",
        readerSummaryJobId: fixture.publicationPayload.readerSummaryJobId,
        provenance: fixture.command.provenance,
      });
    },
  );

  it("returns an idempotent replay for identical recovery provenance", async () => {
    const fixture = createFixture();
    mockPublicationPayload(fixture.publicationPayload);
    let invocation = 0;
    const queryRaw = jest.fn(async (...args: readonly unknown[]) => {
      invocation += 1;
      return sqlOutcome(args, invocation === 1 ? "published" : "replayed");
    });
    const finalization = new PrismaReaderSummaryRecoveryFinalization(
      prismaClient(recoveryFinalizationTransaction(queryRaw), queryRaw),
    );

    await expect(finalization.finalize(fixture.command)).resolves.toBe(
      "published",
    );
    await expect(finalization.finalize(fixture.command)).resolves.toBe(
      "replayed",
    );
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(queryRaw.mock.calls[1]?.[2]).toBe(queryRaw.mock.calls[0]?.[2]);
  });

  it("fails closed when PostgreSQL rejects conflicting provenance", async () => {
    const fixture = createFixture();
    mockPublicationPayload(fixture.publicationPayload);
    const queryRaw = jest.fn(async () => {
      throw new Error("reader summary recovery provenance conflict");
    });
    const finalization = new PrismaReaderSummaryRecoveryFinalization(
      prismaClient(recoveryFinalizationTransaction(queryRaw), queryRaw),
    );

    await expect(finalization.finalize(fixture.command)).rejects.toThrow(
      "recovery provenance conflict",
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the durable artifact authority is absent", async () => {
    const fixture = createFixture();
    mockPublicationPayload(fixture.publicationPayload);
    const queryRaw = jest.fn(async () => {
      throw new Error(
        "reader summary publication artifact authority is invalid",
      );
    });
    const finalization = new PrismaReaderSummaryRecoveryFinalization(
      prismaClient(recoveryFinalizationTransaction(queryRaw), queryRaw),
    );

    await expect(finalization.finalize(fixture.command)).rejects.toThrow(
      "publication artifact authority is invalid",
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(String(queryRaw.mock.calls[0]?.[0])).toContain(
      "finalize_reader_summary_recovery",
    );
  });

  it("rolls back publication state when receipt persistence fails", async () => {
    const fixture = createFixture();
    mockPublicationPayload(fixture.publicationPayload);
    const durableState = {
      publications: [] as string[],
      proofs: [] as string[],
      receipts: [] as string[],
    };
    const queryRaw = jest.fn(async () => {
      durableState.publications.push(
        fixture.publicationPayload.readerSummaryArtifactId,
      );
      durableState.proofs.push(fixture.publicationPayload.proofSha256);
      durableState.receipts.push(
        fixture.publicationPayload.readerSummaryArtifactId,
      );
      throw new Error("fixture receipt insert failure");
    });
    const transaction = jest.fn(
      async <TValue>(
        operation: (client: {
          readonly $queryRaw: typeof queryRaw;
        }) => Promise<TValue>,
        options?: PrismaSummaryTransactionOptions,
      ): Promise<TValue> => {
        expect(options).toEqual(
          expectedRecoveryFinalizationTransactionOptions,
        );
        const snapshot = JSON.parse(
          JSON.stringify(durableState),
        ) as typeof durableState;
        try {
          return await operation({ $queryRaw: queryRaw });
        } catch (error) {
          durableState.publications.splice(
            0,
            Infinity,
            ...snapshot.publications,
          );
          durableState.proofs.splice(0, Infinity, ...snapshot.proofs);
          durableState.receipts.splice(0, Infinity, ...snapshot.receipts);
          throw error;
        }
      },
    );
    const finalization = new PrismaReaderSummaryRecoveryFinalization(
      prismaClient(transaction, queryRaw),
    );

    await expect(finalization.finalize(fixture.command)).rejects.toThrow(
      "fixture receipt insert failure",
    );
    expect(durableState).toEqual({
      publications: [],
      proofs: [],
      receipts: [],
    });
  });

  it("preserves the ordinary publication adapter contract", async () => {
    const fixture = createFixture();
    const queryRaw = jest.fn(async (...args: readonly unknown[]) => {
      expect(args[0]).toBeDefined();
      return [
        {
          outcome: "published",
          publication_id: fixture.publicationPayload.readerSummaryArtifactId,
          report_sha256: fixture.publicationPayload.reportSha256,
          proof_sha256: fixture.publicationPayload.proofSha256,
        },
      ];
    });
    const publication = new PrismaReaderSummaryPublication(
      prismaClient(serializableTransaction(queryRaw), queryRaw),
    );

    await expect(
      publication.publish(fixture.command.publication),
    ).resolves.toBe("published");
    expect(String(queryRaw.mock.calls[0]?.[0])).toContain(
      'FROM "publish_reader_summary"',
    );
    expect(String(queryRaw.mock.calls[0]?.[0])).not.toContain(
      "finalize_reader_summary_recovery",
    );
  });
});

const createFixture = (): {
  readonly command: ReaderSummaryRecoveryFinalizationCommand;
  readonly publicationPayload: ReaderSummaryPublicationPayload;
} => {
  const publication = ordinaryPublicationCommand();
  const publicationPayload =
    publicationProof.buildReaderSummaryPublicationPayload(publication);
  const provenance: ReaderSummaryRecoveryProvenance = {
    schemaVersion: "reader_summary.summary_only_recovery_provenance.v1",
    mode: "summary-only",
    collectionUtcPeriod: {
      startedAt: publicationPayload.periodStartedAt,
      endedAt: publicationPayload.periodEndedAt,
      timezone: publicationPayload.periodTimezone,
    },
    priorCollectionProof: {
      sourceAttempt: {
        artifactFormat: "reader-summary-production-day-run-v1",
        sha256: "c".repeat(64),
      },
      collectionArtifact: {
        artifactFormat: "reader-summary-clean-real-day-collection-v1",
        sha256: "d".repeat(64),
      },
      collectionQualityReport: {
        artifactFormat: "yesterday-social-collection-quality-report-v1",
        sha256: "e".repeat(64),
      },
    },
    regenerationInputManifest: {
      artifactFormat: "reader-summary-day-dataset-manifest-v1",
      sha256: "f".repeat(64),
      datasetSha256: "1".repeat(64),
    },
  };
  return {
    publicationPayload,
    command: {
      publication,
      provenance,
    },
  };
};

const ordinaryPublicationCommand = (): ReaderSummaryPublicationCommand => {
  const projectionFixture = githubBoardArtifact();
  const projectionSnapshot = projectionFixture.toSnapshot();
  const storyClusterId = "reader-summary-recovery-editorial-story";
  const artifact = ReaderSummaryArtifact.create({
    ...projectionSnapshot,
    sourceWindow: {
      ...projectionSnapshot.sourceWindow,
      storyClusterIds: [storyClusterId],
    },
    storyClusters: [
      {
        id: storyClusterId,
        storyKey: "url:example.test/editorial-source",
        representativeFeedItemId: "editorial-feed",
        duplicateFeedItemIds: [],
        interestIds: ["interest-developer-tools"],
        providerKeys: ["rss"],
        score: 1,
        observedAtRange: {
          startedAt: new Date("2026-07-10T12:00:00.000Z"),
          endedAt: new Date("2026-07-10T12:05:00.000Z"),
        },
        whyImportant: ["Editorial evidence supports the primary narrative."],
      },
    ],
    topStories: [
      {
        storyClusterId,
        title: "How teams adopt developer tools",
        summary: "Editorial reporting explains adoption patterns.",
        interestIds: ["interest-developer-tools"],
        providerKeys: ["rss"],
        citationIds: ["editorial-citation"],
      },
    ],
    qualityFlags: [],
    noSignalReason: undefined,
  });
  const snapshot = artifact.toSnapshot();
  const jobId = "reader-summary-recovery-ordinary-publication-job";
  const completedAt = new Date("2026-07-11T01:00:00.000Z");
  const finalJob = ReaderSummaryJob.rehydrate({
    id: jobId,
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    scope: snapshot.scope,
    period: snapshot.period,
    status: "completed",
    idempotencyKey: "reader-summary-recovery-ordinary-publication",
    requestedAt: new Date("2026-07-10T10:00:00.000Z"),
    startedAt: new Date("2026-07-10T10:00:00.000Z"),
    completedAt,
    readerSummaryId: snapshot.readerSummaryId,
  });

  return {
    artifact,
    finalJob,
    publicationDecision: {
      status: "published",
      qualityPassed: true,
      canonicalScore: 1,
      shadow: {
        mode: "shadow",
        policyVersion: "reader_summary_publication_shadow_v1",
        riskScore: 0,
        signals: [],
      },
      reasons: [],
    },
    githubProjectionAudit: evaluateGitHubProjection(
      artifact,
      githubProjectionInput(),
    ).audit,
    readyEvent: {
      eventId: eventId("reader-summary-recovery-ordinary-publication-event"),
      eventType: "reader_summary.ready",
      schemaVersion: 1,
      occurredAt: completedAt,
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      correlationId: correlationId(jobId),
      causationId: causationId(jobId),
      payload: {
        readerSummaryJobId: jobId,
        readerSummaryId: snapshot.readerSummaryId,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        scope: snapshot.scope,
        period: snapshot.period,
        status: "completed",
      },
    },
  };
};

const mockPublicationPayload = (
  payload: ReaderSummaryPublicationPayload,
): void => {
  jest
    .spyOn(publicationProof, "buildReaderSummaryPublicationPayload")
    .mockReturnValue(payload);
};

const sqlOutcome = (
  args: readonly unknown[],
  outcome: "published" | "replayed",
) => {
  const publication = JSON.parse(
    String(args[1]),
  ) as ReaderSummaryPublicationPayload;
  const receipt = JSON.parse(String(args[2])) as {
    readonly provenanceSha256: string;
    readonly receiptSha256: string;
  };
  return [
    {
      outcome,
      publication_id: publication.readerSummaryArtifactId,
      receipt_id: publication.readerSummaryArtifactId,
      report_sha256: publication.reportSha256,
      proof_sha256: publication.proofSha256,
      provenance_sha256: receipt.provenanceSha256,
      receipt_sha256: receipt.receiptSha256,
    },
  ];
};

type JestMock = ReturnType<typeof jest.fn>;

const recoveryFinalizationTransaction = (queryRaw: JestMock) =>
  serializableTransaction(
    queryRaw,
    expectedRecoveryFinalizationTransactionOptions,
  );

const serializableTransaction = (
  queryRaw: JestMock,
  expectedOptions: PrismaSummaryTransactionOptions = {
    isolationLevel: "Serializable",
  },
) =>
  jest.fn(
    async <TValue>(
      operation: (client: {
        readonly $queryRaw: typeof queryRaw;
      }) => Promise<TValue>,
      options?: PrismaSummaryTransactionOptions,
    ): Promise<TValue> => {
      expect(options).toEqual(expectedOptions);
      return operation({ $queryRaw: queryRaw });
    },
  );

const prismaClient = (
  transaction: JestMock,
  queryRaw: JestMock,
): PrismaSummaryClient =>
  ({
    $transaction: transaction,
    $queryRaw: queryRaw,
  }) as unknown as PrismaSummaryClient;
