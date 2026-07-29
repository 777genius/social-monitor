import type {
  ReaderSummaryProductionRecoveryAuthorityHandle,
} from "../../../ports/reader-summary-production-recovery-authority.port";
import {
  buildProductionRecoveryAuthorityBinding,
  verifyPersistedProductionRecoveryAuthority,
} from "./prisma-reader-summary-production-recovery-authority-row";
import { PrismaReaderSummaryProductionRecoveryAuthority } from "./prisma-reader-summary-production-recovery-authority";
import {
  FakeProductionRecoveryPrisma,
  fixtureScope,
  productionRecoveryBinding,
  productionRecoveryEvidenceRows,
} from "./prisma-reader-summary-production-recovery-authority.spec-support";
import type { PrismaSummaryClient } from "./prisma-summary-client";

describe("PrismaReaderSummaryProductionRecoveryAuthority", () => {
  it("persists a DB-derived Jul23-Jul28 authority with two hashes per day", async () => {
    const prisma = new FakeProductionRecoveryPrisma();
    const adapter = new PrismaReaderSummaryProductionRecoveryAuthority(
      prisma as unknown as PrismaSummaryClient,
    );

    const result = await adapter.prepare();
    const binding = adapter.readVerifiedBinding(result.authority);

    expect(result.outcome).toBe("prepared");
    expect(binding.requestedUtcDates).toEqual([
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
    ]);
    expect(
      binding.days.every(
        (day) =>
          day.planSha256s[0] === day.canonicalSha256 &&
          day.planSha256s[1] === day.canonicalSha256,
      ),
    ).toBe(true);
    expect(
      prisma.calls.filter((call) =>
        call.sql.includes('AS "requestedUtcDate"'),
      ),
    ).toHaveLength(2);
    expect(
      prisma.calls.filter((call) =>
        call.sql.includes(
          '"persist_reader_summary_production_recovery_v2"',
        ),
      ),
    ).toHaveLength(1);
    expect(
      prisma.calls.some((call) => /\bLOCK\s+TABLE\b/iu.test(call.sql)),
    ).toBe(false);
  });

  it("bounds recovery source context from DB preview/body fallback", async () => {
    const prisma = new FakeProductionRecoveryPrisma();
    const adapter = new PrismaReaderSummaryProductionRecoveryAuthority(
      prisma as unknown as PrismaSummaryClient,
    );

    await adapter.prepare();

    const evidenceRead = prisma.calls.find(
      (call) =>
        call.sql.includes('FROM "feed_items" AS feed') &&
        call.sql.includes('AS "sourceText"'),
    );
    expect(evidenceRead?.sql).toContain(
      'LEFT( COALESCE(NULLIF(feed."body_preview", \'\'), source."body"), 4096 ) AS "sourceText"',
    );
    expect(evidenceRead?.sql).not.toContain(
      'source."body" AS "sourceText"',
    );
  });

  it("replays with reads only after all six final receipts exist", async () => {
    const prisma = new FakeProductionRecoveryPrisma(
      productionRecoveryEvidenceRows(),
      6,
      true,
    );
    const adapter = new PrismaReaderSummaryProductionRecoveryAuthority(
      prisma as unknown as PrismaSummaryClient,
    );

    await expect(adapter.prepare()).resolves.toMatchObject({
      outcome: "replayed",
    });
    expect(
      prisma.calls.some((call) =>
        call.sql.includes(
          '"persist_reader_summary_production_recovery_v2"',
        ),
      ),
    ).toBe(false);
    expect(
      prisma.calls.some((call) =>
        call.sql.includes('FROM "feed_items" AS feed'),
      ),
    ).toBe(false);
    const authorityRead = prisma.calls.find(
      (call) =>
        call.sql.includes(
          'FROM "reader_summary_production_recovery_leases"',
        ) && call.sql.includes('"responsePayload"'),
    );
    expect(authorityRead?.sql).toBeDefined();
    expect(authorityRead?.sql).not.toContain("FOR SHARE");
  });

  it("uses one millisecond-canonical lease timestamp for issue and consumption", async () => {
    const prisma = new FakeProductionRecoveryPrisma();
    const adapter = new PrismaReaderSummaryProductionRecoveryAuthority(
      prisma as unknown as PrismaSummaryClient,
    );

    const result = await adapter.prepare();
    const binding = adapter.readVerifiedBinding(result.authority);

    expect(binding.lease).toEqual({
      state: "CONSUMED",
      issuedAt: "2026-07-29T12:00:00.000Z",
      consumedAt: "2026-07-29T12:00:00.000Z",
    });
    expect(
      prisma.calls.some(
        (call) =>
          call.sql.includes("date_trunc( 'milliseconds'") &&
          call.sql.includes('AS "issuedAt"'),
      ),
    ).toBe(true);
  });

  it("fails closed when unavailable Jul28 Reddit has DB evidence", async () => {
    const prisma = new FakeProductionRecoveryPrisma(
      productionRecoveryEvidenceRows({
        jul28RedditCount: 1,
      }),
    );
    const adapter = new PrismaReaderSummaryProductionRecoveryAuthority(
      prisma as unknown as PrismaSummaryClient,
    );

    await expect(adapter.prepare()).rejects.toThrow(
      "2026-07-28 reddit DB evidence diverged from historical_unavailable",
    );
    expect(prisma.persisted).toBeUndefined();
  });

  it("fails closed when tenant/workspace authority diverges", () => {
    expect(() =>
      buildProductionRecoveryAuthorityBinding({
        scope: {
          ...fixtureScope,
          workspaceId: "00000000-0000-7000-8000-000000000002",
        },
        rows: productionRecoveryEvidenceRows(),
      }),
    ).toThrow("tenant/workspace authority diverged");
  });

  it("rejects duplicate evidence and a tampered persisted seal", () => {
    const rows = [...productionRecoveryEvidenceRows()];
    rows[1] = { ...rows[1]!, feedItemId: rows[0]!.feedItemId };
    expect(() =>
      buildProductionRecoveryAuthorityBinding({
        scope: fixtureScope,
        rows,
      }),
    ).toThrow("evidence is duplicated");

    const binding = productionRecoveryBinding();
    expect(() =>
      verifyPersistedProductionRecoveryAuthority(
        { ...binding, recoveryId: fixtureScope.tenantId },
        binding.canonicalSha256,
      ),
    ).toThrow("persisted authority seal diverged");
  });

  it("rejects forged opaque handles", async () => {
    const adapter = new PrismaReaderSummaryProductionRecoveryAuthority(
      new FakeProductionRecoveryPrisma() as unknown as PrismaSummaryClient,
    );
    await adapter.prepare();
    expect(() =>
      adapter.readVerifiedBinding(
        {} as ReaderSummaryProductionRecoveryAuthorityHandle,
      ),
    ).toThrow("was not loaded by verified Prisma evidence");
  });
});
