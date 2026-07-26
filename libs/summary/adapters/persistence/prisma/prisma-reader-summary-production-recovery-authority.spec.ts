import type {
  ReaderSummaryProductionRecoveryAuthorityHandle,
  ReaderSummaryProductionRecoveryAuthorityPort,
} from "../../../ports/reader-summary-production-recovery-authority.port";
import { PrismaReaderSummaryProductionRecoveryAuthority } from "./prisma-reader-summary-production-recovery-authority";
import {
  FakeProductionRecoveryPrisma,
  productionRecoverySqlRow,
} from "./prisma-reader-summary-production-recovery-authority.spec-support";
import type { PrismaSummaryClient } from "./prisma-summary-client";

describe("PrismaReaderSummaryProductionRecoveryAuthority", () => {
  it("loads exact database-derived days only after two equal dry runs", async () => {
    const prisma = new FakeProductionRecoveryPrisma([
      productionRecoverySqlRow(),
    ]);
    const adapter = authorityAdapter(prisma);

    const result = await adapter.prepare();
    const binding = adapter.readVerifiedBinding(result.authority);

    expect(result.outcome).toBe("prepared");
    expect(binding.requestedUtcDates).toEqual([
      "2026-07-23",
      "2026-07-24",
    ]);
    expect(binding.dryRunCanonicalSha256s).toEqual([
      binding.canonicalSha256,
      binding.canonicalSha256,
    ]);
    expect(binding.lease.state).toBe("CONSUMED");
    expect(binding.boundaries).toEqual({
      stage: "pre_model",
      modelCallPerformed: false,
      publicationPerformed: false,
      recollectionPerformed: false,
    });
    expect(binding.days.map((day) => day.providerCounts)).toEqual([
      [
        { providerKey: "github-trending-page", count: 0 },
        { providerKey: "hacker-news", count: 100 },
        { providerKey: "reddit", count: 100 },
        { providerKey: "rss", count: 75 },
        { providerKey: "x-twitter", count: 67 },
      ],
      [
        { providerKey: "github-trending-page", count: 10 },
        { providerKey: "hacker-news", count: 100 },
        { providerKey: "reddit", count: 100 },
        { providerKey: "rss", count: 67 },
        { providerKey: "x-twitter", count: 73 },
      ],
    ]);
    expect(binding.days[0].githubEvidence.mode).toBe(
      "historical_unavailable",
    );
    expect(binding.days[1].githubEvidence.mode).toBe(
      "verified_existing",
    );
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(binding.days[1].providerEvidence)).toBe(true);
    expect(prisma.calls[0]).toMatchObject({ values: [] });
    expect(prisma.calls[0]?.sql).toContain(
      'FROM "prepare_reader_summary_production_recovery"()',
    );
    expect(prisma.transactionOptions).toEqual([
      { isolationLevel: "Serializable" },
    ]);
  });

  it("accepts replay only after re-verifying the persisted authority", async () => {
    const row = productionRecoverySqlRow("replayed");
    const adapter = authorityAdapter(
      new FakeProductionRecoveryPrisma([row]),
    );

    const result = await adapter.prepare();
    const binding = adapter.readVerifiedBinding(result.authority);

    expect(result.outcome).toBe("replayed");
    expect(binding.recoveryId).toBe(row.recoveryId);
    expect(binding.identity).toBe(row.identity);
  });

  it("retries a SERIALIZABLE conflict and returns one verified handle", async () => {
    const prisma = new FakeProductionRecoveryPrisma(
      [productionRecoverySqlRow()],
      1,
    );

    const result = await authorityAdapter(prisma).prepare();

    expect(result.outcome).toBe("prepared");
    expect(prisma.calls).toHaveLength(2);
    expect(prisma.transactionOptions).toEqual([
      { isolationLevel: "Serializable" },
      { isolationLevel: "Serializable" },
    ]);
  });

  it("keeps authority construction private and rejects forged handles", async () => {
    const adapter = authorityAdapter(
      new FakeProductionRecoveryPrisma([productionRecoverySqlRow()]),
    );
    const authority = (await adapter.prepare()).authority;
    const prototype = Object.getPrototypeOf(authority) as object;

    expect(() =>
      adapter.readVerifiedBinding(
        {} as ReaderSummaryProductionRecoveryAuthorityHandle,
      ),
    ).toThrow("was not loaded by verified Prisma evidence");
    expect(() =>
      adapter.readVerifiedBinding(
        Object.create(
          prototype,
        ) as ReaderSummaryProductionRecoveryAuthorityHandle,
      ),
    ).toThrow("was not loaded by verified Prisma evidence");
  });

  it.each([
    [
      "canonical bytes",
      (row: Record<string, unknown>) => {
        row.canonicalBytes = Buffer.from("{}", "utf8");
      },
      "canonical authority diverged",
    ],
    [
      "canonical hash",
      (row: Record<string, unknown>) => {
        row.canonicalSha256 = "f".repeat(64);
      },
      "canonical authority diverged",
    ],
    [
      "tenant",
      (row: Record<string, unknown>) => {
        row.tenantId = "10000000-0000-4000-8000-000000000099";
      },
      "canonical authority diverged",
    ],
    [
      "deterministic recovery id",
      (row: Record<string, unknown>) => {
        row.recoveryId = "10000000-0000-4000-8000-000000000099";
      },
      "canonical authority diverged",
    ],
    [
      "lease state",
      (row: Record<string, unknown>) => {
        row.leaseState = "ISSUED";
      },
      "pre-model lease was not consumed",
    ],
    [
      "dry-run hash",
      (row: Record<string, unknown>) => {
        const dryRuns = row.dryRuns as Record<string, unknown>[];
        dryRuns[1]!.canonicalSha256 = "f".repeat(64);
      },
      "dry-run hashes diverged",
    ],
    [
      "daily count",
      (row: Record<string, unknown>) => {
        const days = row.days as Record<string, unknown>[];
        const counts = days[0]!.providerCounts as Record<string, unknown>[];
        counts[3]!.count = 74;
      },
      "provider counts diverged",
    ],
    [
      "daily evidence",
      (row: Record<string, unknown>) => {
        const days = row.days as Record<string, unknown>[];
        const evidence = days[1]!.providerEvidence as Record<
          string,
          Record<string, unknown>[]
        >;
        evidence["github-trending-page"]![0]!.sourceContentHash =
          "f".repeat(64);
      },
      "provider evidence seal diverged",
    ],
    [
      "provider payload field",
      (row: Record<string, unknown>) => {
        const days = row.days as Record<string, unknown>[];
        const evidence = days[0]!.providerEvidence as Record<
          string,
          Record<string, unknown>[]
        >;
        evidence["hacker-news"]![0]!.rawProviderPayload = {
          untrusted: true,
        };
      },
      "must contain exactly",
    ],
  ])("fails closed for diverged %s", async (_label, mutate, message) => {
    const row = productionRecoverySqlRow();
    mutate(row);

    await expect(
      authorityAdapter(new FakeProductionRecoveryPrisma([row])).prepare(),
    ).rejects.toThrow(message);
  });

  it("rejects duplicate database evidence even when counts remain exact", async () => {
    const row = productionRecoverySqlRow();
    const days = row.days as Record<string, unknown>[];
    const evidence = days[0]!.providerEvidence as Record<
      string,
      Record<string, unknown>[]
    >;
    evidence.reddit![0]!.feedItemId =
      evidence["hacker-news"]![0]!.feedItemId;

    await expect(
      authorityAdapter(new FakeProductionRecoveryPrisma([row])).prepare(),
    ).rejects.toThrow("evidence is duplicated");
  });

  it("allows concurrent callers to converge on one deterministic binding", async () => {
    const prepared = authorityAdapter(
      new FakeProductionRecoveryPrisma([
        productionRecoverySqlRow("prepared"),
      ]),
    );
    const replayed = authorityAdapter(
      new FakeProductionRecoveryPrisma([
        productionRecoverySqlRow("replayed"),
      ]),
    );

    const [first, second] = await Promise.all([
      prepared.prepare(),
      replayed.prepare(),
    ]);
    const firstBinding = prepared.readVerifiedBinding(first.authority);
    const secondBinding = replayed.readVerifiedBinding(second.authority);

    expect([first.outcome, second.outcome].sort()).toEqual([
      "prepared",
      "replayed",
    ]);
    expect(secondBinding).toEqual(firstBinding);
  });
});

const authorityAdapter = (
  prisma: FakeProductionRecoveryPrisma,
): ReaderSummaryProductionRecoveryAuthorityPort =>
  new PrismaReaderSummaryProductionRecoveryAuthority(
    prisma as unknown as PrismaSummaryClient,
  );
