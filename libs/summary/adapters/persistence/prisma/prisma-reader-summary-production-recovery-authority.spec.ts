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
  it("persists a DB-derived Jul24-Jul27 authority with two hashes per day", async () => {
    const prisma = new FakeProductionRecoveryPrisma();
    const adapter = new PrismaReaderSummaryProductionRecoveryAuthority(
      prisma as unknown as PrismaSummaryClient,
    );

    const result = await adapter.prepare();
    const binding = adapter.readVerifiedBinding(result.authority);

    expect(result.outcome).toBe("prepared");
    expect(binding.requestedUtcDates).toEqual([
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
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
        call.sql.includes('FROM "feed_items" AS feed'),
      ),
    ).toHaveLength(2);
    expect(
      prisma.calls.filter((call) =>
        call.sql.startsWith('INSERT INTO "idempotency_keys"'),
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
        call.sql.startsWith('INSERT INTO "idempotency_keys"'),
      ),
    ).toBe(false);
    expect(
      prisma.calls.some((call) =>
        call.sql.includes('FROM "feed_items" AS feed'),
      ),
    ).toBe(false);
  });

  it("fails closed for unauthorized Jul27 HN87/Reddit99 before persisting", async () => {
    const prisma = new FakeProductionRecoveryPrisma(
      productionRecoveryEvidenceRows({
        jul27HackerNewsCount: 87,
        jul27RedditCount: 99,
      }),
    );
    const adapter = new PrismaReaderSummaryProductionRecoveryAuthority(
      prisma as unknown as PrismaSummaryClient,
    );

    await expect(adapter.prepare()).rejects.toThrow(
      "Jul27 fails closed: Hacker News and Reddit require 100 items each (found 87/99)",
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
