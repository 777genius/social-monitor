import type { PrismaSummaryClient } from "./prisma-summary-client";
import { PrismaReaderSummaryWeeklyCertificationSealAuthority } from "./prisma-reader-summary-weekly-certification-seal-authority";
import type { ReaderSummaryWeeklyCertificationSealHandle } from "../../../ports/reader-summary-weekly-certification-seal-authority.port";
import { canonicalizeReaderSummaryWeeklyJson } from "../../../domain/value-objects/reader-summary-weekly-canonical-json";

const query = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  scope: { type: "workspace" as const },
  weekStartedOn: "2026-07-20",
};

describe("Prisma weekly certification seal authority", () => {
  it("issues an instance-private handle only after verifying the complete row", async () => {
    const record = sealRecord();
    const prisma = {
      $queryRaw: jest.fn(async () => [sealRow(record)]),
    } as unknown as PrismaSummaryClient;
    const authority = new PrismaReaderSummaryWeeklyCertificationSealAuthority(prisma);
    const other = new PrismaReaderSummaryWeeklyCertificationSealAuthority(prisma);

    const handle = await authority.load(query);

    expect(handle).not.toBeNull();
    expect(authority.readVerifiedBinding(handle!)).toEqual(record);
    expect(() => other.readVerifiedBinding(handle!)).toThrow(
      /this verified Prisma authority/u,
    );
  });

  it("returns null without issuing authority when the exact scoped row is absent", async () => {
    const prisma = { $queryRaw: jest.fn(async () => []) } as unknown as PrismaSummaryClient;
    const authority = new PrismaReaderSummaryWeeklyCertificationSealAuthority(prisma);
    await expect(authority.load(query)).resolves.toBeNull();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects forged opaque handles", () => {
    const prisma = { $queryRaw: jest.fn() } as unknown as PrismaSummaryClient;
    const first = new PrismaReaderSummaryWeeklyCertificationSealAuthority(prisma);
    const second = new PrismaReaderSummaryWeeklyCertificationSealAuthority(prisma);
    const forged = Object.freeze({}) as ReaderSummaryWeeklyCertificationSealHandle;
    expect(() => first.readVerifiedBinding(forged)).toThrow(/this verified Prisma authority/u);
    expect(() => second.readVerifiedBinding(forged)).toThrow(/this verified Prisma authority/u);
  });

  it("rejects non-Monday lookup before querying Prisma", async () => {
    const prisma = { $queryRaw: jest.fn(async () => []) } as unknown as PrismaSummaryClient;
    const authority = new PrismaReaderSummaryWeeklyCertificationSealAuthority(prisma);
    await expect(authority.load({ ...query, weekStartedOn: "2026-07-21" }))
      .rejects.toThrow(/start Monday/u);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("rejects canonical bytes that are stale or divergent from the DB record", async () => {
    const record = sealRecord();
    const prisma = {
      $queryRaw: jest.fn(async () => [{
        ...sealRow(record),
        canonicalBytes: Buffer.from("{}"),
      }]),
    } as unknown as PrismaSummaryClient;
    const authority = new PrismaReaderSummaryWeeklyCertificationSealAuthority(prisma);

    await expect(authority.load(query)).rejects.toThrow(/canonical bytes/u);
  });
});

const sealRecord = () => {
  const startedAt = Date.parse("2026-07-20T00:00:00.000Z");
  const body = {
    schemaVersion: "reader_summary.weekly_certification_seal.v1" as const,
    tenantId: query.tenantId,
    workspaceId: query.workspaceId,
    scopeType: "workspace" as const,
    scopeKey: "workspace",
    weekStartedOn: query.weekStartedOn,
    weekEndedOn: "2026-07-26",
    days: Array.from({ length: 7 }, (_, index) => {
      const requestedUtcDate = new Date(startedAt + index * 86_400_000)
        .toISOString().slice(0, 10);
      const publicationEvidenceSha256 = canonicalizeReaderSummaryWeeklyJson({
        requestedUtcDate,
      }).sha256;
      return {
        requestedUtcDate,
        publicationId: `publication:${requestedUtcDate}`,
        artifactId: `artifact:${requestedUtcDate}`,
        jobId: `job:${requestedUtcDate}`,
        semanticStatus: "COMPLETED" as const,
        publicationEvidenceIdentity:
          `reader_summary.weekly_publication_evidence.v1:${publicationEvidenceSha256}`,
        publicationEvidenceSha256,
      };
    }),
  };
  const sealSha = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  return {
    ...body,
    sealId: `reader_summary.weekly_certification_seal.v1:${sealSha}`,
    sealSha,
  };
};

const sealRow = (record: ReturnType<typeof sealRecord>) => {
  const body = {
    schemaVersion: record.schemaVersion,
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    scopeType: record.scopeType,
    scopeKey: record.scopeKey,
    weekStartedOn: record.weekStartedOn,
    weekEndedOn: record.weekEndedOn,
    days: record.days,
  };
  return {
    sealId: record.sealId,
    sealSha: record.sealSha,
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    scopeType: record.scopeType,
    scopeKey: record.scopeKey,
    weekStartedOn: new Date(`${record.weekStartedOn}T00:00:00.000Z`),
    weekEndedOn: new Date(`${record.weekEndedOn}T00:00:00.000Z`),
    days: record.days,
    canonicalRecord: record,
    canonicalBytes: canonicalizeReaderSummaryWeeklyJson(body).toBytes(),
    recordedAt: new Date("2026-07-27T01:00:00.000Z"),
  };
};
