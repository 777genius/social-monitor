import type {
  ReaderSummaryWeeklyPublicationPersistencePayload,
  ReaderSummaryWeeklyPublicationPersistenceSqlRow,
} from "../reader-summary-weekly-publication-payload";
import type { PrismaReaderSummaryArtifactRecord } from "./prisma-reader-summary-records";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import type { PrismaSummaryStatus } from "./prisma-summary-records";

export class FakeReaderSummaryPrisma {
  private readonly records = new Map<
    string,
    PrismaReaderSummaryArtifactRecord
  >();
  private readonly weeklyPayloadBySlot = new Map<string, string>();
  private nowMs = Date.parse("2026-07-05T10:00:00.000Z");
  private dailyRecoveryVerified: boolean | null = false;
  dailyRecoveryVerificationQueryCount = 0;
  readonly weeklyRequests: ReaderSummaryWeeklyPublicationPersistencePayload[] =
    [];
  readonly weeklyOutcomes: ReaderSummaryWeeklyPublicationPersistenceSqlRow["outcome"][] =
    [];

  readonly client = {
    $queryRaw: async <T>(
      strings: TemplateStringsArray,
      serialized: unknown,
    ): Promise<T> => {
      if (
        strings
          .join("")
          .includes(
            "verify_reader_summary_daily_canonical_recovery_v4_provenance",
          )
      ) {
        this.dailyRecoveryVerificationQueryCount += 1;
        return [{ verified: this.dailyRecoveryVerified }] as unknown as T;
      }
      const payload = JSON.parse(
        String(serialized),
      ) as ReaderSummaryWeeklyPublicationPersistencePayload;
      const slotKey = [
        payload.tenantId,
        payload.workspaceId,
        payload.scopeKey,
        payload.cadence,
        payload.periodStartedAt,
        payload.periodEndedAt,
        payload.periodTimezone,
      ].join(":");
      const canonicalPayload = JSON.stringify(payload);
      const existingPayload = this.weeklyPayloadBySlot.get(slotKey);
      const outcome = existingPayload === undefined ? "persisted" : "replayed";
      this.weeklyRequests.push(payload);

      if (
        existingPayload !== undefined &&
        existingPayload !== canonicalPayload
      ) {
        throw new Error(
          "weekly artifact persistence replay diverged from immutable sealId or sealSha",
        );
      }
      if (outcome === "persisted") {
        this.weeklyPayloadBySlot.set(slotKey, canonicalPayload);
      }
      this.weeklyOutcomes.push(outcome);

      return [
        {
          outcome,
          artifact_id: payload.artifactId,
          artifact_payload_sha256: payload.artifactPayloadSha256,
          proof_sha256: payload.proof.sha256,
        },
      ] as unknown as T;
    },
    readerSummaryArtifact: {
      create: async (args: {
        readonly data: Omit<
          PrismaReaderSummaryArtifactRecord,
          "createdAt" | "updatedAt"
        >;
      }) => {
        if (this.records.has(args.data.id)) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        const now = this.nextDate();
        const record = {
          ...args.data,
          createdAt: now,
          updatedAt: now,
        };
        this.records.set(record.id, record);
        return record;
      },
      upsert: async (args: {
        readonly where: { readonly id: string };
        readonly update: Partial<PrismaReaderSummaryArtifactRecord>;
        readonly create: Omit<
          PrismaReaderSummaryArtifactRecord,
          "createdAt" | "updatedAt"
        >;
      }) => {
        const now = this.nextDate();
        const current = this.records.get(args.where.id);
        const record =
          current === undefined
            ? { ...args.create, createdAt: now, updatedAt: now }
            : { ...current, ...args.update, updatedAt: now };
        this.records.set(args.where.id, record);
        return record;
      },
      updateMany: async (args: {
        readonly where: ReaderSummaryArtifactWhere;
        readonly data: Partial<PrismaReaderSummaryArtifactRecord>;
      }) => {
        let count = 0;
        for (const record of this.records.values()) {
          if (matchesWhere(record, args.where)) {
            this.records.set(record.id, {
              ...record,
              ...args.data,
              updatedAt: this.nextDate(),
            });
            count += 1;
          }
        }
        return { count };
      },
      findMany: async (args: {
        readonly where: ReaderSummaryArtifactWhere;
        readonly skip?: number;
        readonly take?: number;
      }) => {
        const skip = args.skip ?? 0;
        const take = args.take ?? Number.POSITIVE_INFINITY;
        return [...this.records.values()]
          .filter((record) => matchesWhere(record, args.where))
          .sort(compareRecords)
          .slice(skip, skip + take);
      },
      count: async (args: { readonly where: ReaderSummaryArtifactWhere }) =>
        [...this.records.values()].filter((record) =>
          matchesWhere(record, args.where),
        ).length,
      findFirst: async (args: { readonly where: ReaderSummaryArtifactWhere }) =>
        [...this.records.values()]
          .filter((record) => matchesWhere(record, args.where))
          .sort(compareRecords)[0] ?? null,
    },
  } as unknown as PrismaSummaryClient;

  statusFor(id: string): PrismaSummaryStatus | undefined {
    return this.records.get(id)?.status;
  }

  qualitySignalsFor(id: string): unknown {
    return this.records.get(id)?.qualitySignals;
  }

  setDailyRecoveryVerification(verified: boolean | null): void {
    this.dailyRecoveryVerified = verified;
  }

  private nextDate(): Date {
    this.nowMs += 1;
    return new Date(this.nowMs);
  }
}

type ReaderSummaryArtifactWhere = {
  readonly id?: { readonly not?: string } | string;
  readonly tenantId?: string;
  readonly workspaceId?: string;
  readonly scopeKey?: string;
  readonly cadence?: string;
  readonly periodStartedAt?: Date;
  readonly periodEndedAt?: Date;
  readonly periodTimezone?: string;
  readonly status?: { readonly in: readonly PrismaSummaryStatus[] };
};

const matchesWhere = (
  record: PrismaReaderSummaryArtifactRecord,
  where: ReaderSummaryArtifactWhere,
): boolean =>
  matchesId(record, where.id) &&
  matchesValue(record.tenantId, where.tenantId) &&
  matchesValue(record.workspaceId, where.workspaceId) &&
  matchesValue(record.scopeKey, where.scopeKey) &&
  matchesValue(record.cadence, where.cadence) &&
  matchesDate(record.periodStartedAt, where.periodStartedAt) &&
  matchesDate(record.periodEndedAt, where.periodEndedAt) &&
  matchesValue(record.periodTimezone, where.periodTimezone) &&
  (where.status === undefined || where.status.in.includes(record.status));

const matchesId = (
  record: PrismaReaderSummaryArtifactRecord,
  id: ReaderSummaryArtifactWhere["id"],
): boolean => {
  if (id === undefined) {
    return true;
  }
  if (typeof id === "string") {
    return record.id === id;
  }
  return id.not === undefined || record.id !== id.not;
};

const matchesValue = <T>(actual: T, expected: T | undefined): boolean =>
  expected === undefined || actual === expected;

const matchesDate = (actual: Date, expected: Date | undefined): boolean =>
  expected === undefined || actual.getTime() === expected.getTime();

const compareRecords = (
  left: PrismaReaderSummaryArtifactRecord,
  right: PrismaReaderSummaryArtifactRecord,
): number =>
  right.periodStartedAt.getTime() - left.periodStartedAt.getTime() ||
  right.createdAt.getTime() - left.createdAt.getTime() ||
  right.id.localeCompare(left.id);
