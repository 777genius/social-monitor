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
      const transaction = serializableTransaction(queryRaw);
      const finalization = new PrismaReaderSummaryRecoveryFinalization(
        prismaClient(transaction, queryRaw),
      );

      await expect(finalization.finalize(fixture.command)).resolves.toBe(
        "published",
      );

      expect(transaction).toHaveBeenCalledTimes(1);
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
      prismaClient(serializableTransaction(queryRaw), queryRaw),
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
      prismaClient(serializableTransaction(queryRaw), queryRaw),
    );

    await expect(finalization.finalize(fixture.command)).rejects.toThrow(
      "recovery provenance conflict",
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
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
        options?: { readonly isolationLevel?: "Serializable" },
      ): Promise<TValue> => {
        expect(options).toEqual({ isolationLevel: "Serializable" });
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
    mockPublicationPayload(fixture.publicationPayload);
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
  const publicationPayload = {
    tenantId: "00000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000002",
    periodStartedAt: "2026-07-09T00:00:00.000Z",
    periodEndedAt: "2026-07-10T00:00:00.000Z",
    periodTimezone: "UTC",
    readerSummaryJobId: "00000000-0000-4000-8000-000000000003",
    readerSummaryArtifactId: "00000000-0000-4000-8000-000000000004",
    reportSha256: "a".repeat(64),
    proofSha256: "b".repeat(64),
    publishedAt: "2026-07-10T01:00:00.000Z",
  } as ReaderSummaryPublicationPayload;
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
      publication: {} as ReaderSummaryPublicationCommand,
      provenance,
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

const serializableTransaction = (queryRaw: JestMock) =>
  jest.fn(
    async <TValue>(
      operation: (client: {
        readonly $queryRaw: typeof queryRaw;
      }) => Promise<TValue>,
      options?: { readonly isolationLevel?: "Serializable" },
    ): Promise<TValue> => {
      expect(options).toEqual({ isolationLevel: "Serializable" });
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
