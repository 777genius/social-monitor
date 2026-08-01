import type { ReaderSummaryWeeklyPublicationAuthorization } from "../../../domain/policies/reader-summary-weekly-publication-authorization";
import * as weeklyPayload from "../reader-summary-weekly-publication-payload";
import { PrismaReaderSummaryArtifactRepository } from "./prisma-reader-summary-artifact.repository";
import type { PrismaSummaryClient } from "./prisma-summary-client";

describe("PrismaReaderSummaryArtifactRepository weekly persistence", () => {
  it("uses a retryable SERIALIZABLE DB function and accepts exact replay", async () => {
    const payload = persistencePayload();
    const builder = jest
      .spyOn(weeklyPayload, "buildReaderSummaryWeeklyPublicationPersistencePayload")
      .mockReturnValue(payload);
    const prisma = new AtomicWeeklyPrisma([
      sqlRow(payload, "persisted"),
      sqlRow(payload, "replayed"),
    ]);
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);

    try {
      await repository.saveWeekly(command);
      await repository.saveWeekly(command);

      expect(prisma.requests).toEqual([payload, payload]);
      expect(prisma.transactionOptions).toEqual([
        { isolationLevel: "Serializable" },
        { isolationLevel: "Serializable" },
      ]);
    } finally {
      builder.mockRestore();
    }
  });

  it("fails closed when PostgreSQL returns another identity or proof", async () => {
    const payload = persistencePayload();
    const builder = jest
      .spyOn(weeklyPayload, "buildReaderSummaryWeeklyPublicationPersistencePayload")
      .mockReturnValue(payload);
    const prisma = new AtomicWeeklyPrisma([
      {
        ...sqlRow(payload, "persisted"),
        proof_sha256: "f".repeat(64),
      },
    ]);

    try {
      await expect(
        new PrismaReaderSummaryArtifactRepository(prisma.client).saveWeekly(
          command,
        ),
      ).rejects.toThrow("mismatched proof");
    } finally {
      builder.mockRestore();
    }
  });

  it("propagates a DB divergence without attempting an adapter-side write", async () => {
    const payload = persistencePayload();
    const builder = jest
      .spyOn(weeklyPayload, "buildReaderSummaryWeeklyPublicationPersistencePayload")
      .mockReturnValue(payload);
    const conflict = new Error(
      "weekly artifact persistence replay diverged from immutable sealId or sealSha",
    );
    const prisma = new AtomicWeeklyPrisma([conflict]);

    try {
      await expect(
        new PrismaReaderSummaryArtifactRepository(prisma.client).saveWeekly(
          command,
        ),
      ).rejects.toBe(conflict);
      expect(prisma.requests).toEqual([payload]);
    } finally {
      builder.mockRestore();
    }
  });
});

const command = {
  kind: "weekly" as const,
  artifactId: "33333333-3333-4333-8333-333333333333",
  authorization: Object.freeze(
    {},
  ) as ReaderSummaryWeeklyPublicationAuthorization,
};

const persistencePayload =
  (): weeklyPayload.ReaderSummaryWeeklyPublicationPersistencePayload =>
    ({
      schemaVersion: "reader_summary.weekly_artifact_persistence.v2",
      artifactId: command.artifactId,
      tenantId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      artifactPayloadSha256: "a".repeat(64),
      proof: { sha256: "b".repeat(64) },
    }) as weeklyPayload.ReaderSummaryWeeklyPublicationPersistencePayload;

const sqlRow = (
  payload: weeklyPayload.ReaderSummaryWeeklyPublicationPersistencePayload,
  outcome: "persisted" | "replayed",
): weeklyPayload.ReaderSummaryWeeklyPublicationPersistenceSqlRow => ({
  outcome,
  artifact_id: payload.artifactId,
  artifact_payload_sha256: payload.artifactPayloadSha256,
  proof_sha256: payload.proof.sha256,
});

class AtomicWeeklyPrisma {
  readonly requests: unknown[] = [];
  readonly transactionOptions: unknown[] = [];
  private nextResult = 0;

  constructor(
    private readonly results: readonly (
      | weeklyPayload.ReaderSummaryWeeklyPublicationPersistenceSqlRow
      | Error
    )[],
  ) {}

  readonly client = {
    $queryRaw: async (
      _strings: TemplateStringsArray,
      serialized: unknown,
    ) => {
      this.requests.push(JSON.parse(String(serialized)));
      const result = this.results[this.nextResult++];
      if (result instanceof Error) {
        throw result;
      }
      return result === undefined ? [] : [result];
    },
    $transaction: async (
      operation: (client: PrismaSummaryClient) => Promise<unknown>,
      options: unknown,
    ) => {
      this.transactionOptions.push(options);
      return operation(this.client as unknown as PrismaSummaryClient);
    },
  } as unknown as PrismaSummaryClient;
}
