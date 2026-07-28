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
  it("persists a DB-derived Jul23-Jul26 authority with two hashes per day", async () => {
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
  });

  it("replays with reads only after all four final receipts exist", async () => {
    const prisma = new FakeProductionRecoveryPrisma(
      productionRecoveryEvidenceRows(),
      4,
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
      issuedAt: "2026-07-28T12:00:00.000Z",
      consumedAt: "2026-07-28T12:00:00.000Z",
    });
    expect(
      prisma.calls.some(
        (call) =>
          call.sql.includes("date_trunc( 'milliseconds'") &&
          call.sql.includes('AS "issuedAt"'),
      ),
    ).toBe(true);
  });

  it("fails closed for the rejected Jul24 RSS68 count before persisting", async () => {
    const prisma = new FakeProductionRecoveryPrisma(
      productionRecoveryEvidenceRows({
        jul24RssCount: 68,
      }),
    );
    const adapter = new PrismaReaderSummaryProductionRecoveryAuthority(
      prisma as unknown as PrismaSummaryClient,
    );

    await expect(adapter.prepare()).rejects.toThrow(
      "2026-07-24 rss requires 67 DB rows (found 68)",
    );
    expect(prisma.persisted).toBeUndefined();
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
