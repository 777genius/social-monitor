import {
  buildProductionRecoveryAuthorityBinding,
  type ProductionRecoveryEvidenceRow,
  type ProductionRecoveryScopeRow,
} from "./prisma-reader-summary-production-recovery-authority-row";
import {
  readerSummaryProductionRecoveryTenantId,
  readerSummaryProductionRecoveryWorkspaceId,
} from "../../../ports/reader-summary-production-recovery-authority.port";

export const fixtureScope: ProductionRecoveryScopeRow = {
  tenantId: readerSummaryProductionRecoveryTenantId,
  workspaceId: readerSummaryProductionRecoveryWorkspaceId,
  issuedAt: new Date("2026-07-29T12:00:00.000Z"),
};

export const productionRecoveryEvidenceRows = (params?: {
  readonly jul28RedditCount?: number;
}): readonly ProductionRecoveryEvidenceRow[] => {
  let ordinal = 0;
  return Object.entries(productionRecoveryFixtureCounts).flatMap(
    ([date, providerCounts]) =>
      Object.entries(providerCounts).flatMap(([providerKey, fixtureCount]) => {
        const count =
          date === "2026-07-28" && providerKey === "reddit"
            ? (params?.jul28RedditCount ?? fixtureCount)
            : fixtureCount;
        return Array.from({ length: count }, (_, index) => {
          ordinal += 1;
          return evidenceRow({
            ordinal,
            date,
            providerKey: String(providerKey),
            providerIndex: index,
          });
        });
      }),
  );
};

const productionRecoveryFixtureCounts = Object.freeze({
  "2026-07-23": Object.freeze({
    "github-trending-page": 0,
    "hacker-news": 100,
    reddit: 100,
    rss: 78,
    "x-twitter": 67,
  }),
  "2026-07-24": Object.freeze({
    "github-trending-page": 10,
    "hacker-news": 100,
    reddit: 100,
    rss: 68,
    "x-twitter": 73,
  }),
  "2026-07-25": Object.freeze({
    "github-trending-page": 10,
    "hacker-news": 100,
    reddit: 100,
    rss: 63,
    "x-twitter": 96,
  }),
  "2026-07-26": Object.freeze({
    "github-trending-page": 10,
    "hacker-news": 78,
    reddit: 100,
    rss: 62,
    "x-twitter": 94,
  }),
  "2026-07-27": Object.freeze({
    "github-trending-page": 10,
    "hacker-news": 87,
    reddit: 99,
    rss: 47,
    "x-twitter": 58,
  }),
  "2026-07-28": Object.freeze({
    "github-trending-page": 0,
    "hacker-news": 0,
    reddit: 0,
    rss: 29,
    "x-twitter": 27,
  }),
});

export const productionRecoveryBinding = () =>
  buildProductionRecoveryAuthorityBinding({
    scope: fixtureScope,
    rows: productionRecoveryEvidenceRows(),
  });

export class FakeProductionRecoveryPrisma {
  readonly calls: Array<{ readonly sql: string; readonly values: readonly unknown[] }> = [];
  readonly transactionOptions: unknown[] = [];
  persisted:
    | { readonly requestHash: string; readonly responsePayload: unknown }
    | undefined;

  constructor(
    readonly evidenceRows = productionRecoveryEvidenceRows(),
    readonly finalizedCount = 0,
    persisted = false,
  ) {
    if (persisted) {
      const binding = productionRecoveryBinding();
      this.persisted = {
        requestHash: binding.canonicalSha256,
        responsePayload: jsonbRoundTrip(binding),
      };
    }
  }

  readonly $queryRaw = async <T>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T> => {
    const sql = strings.join("?").replace(/\s+/gu, " ").trim();
    this.calls.push({ sql, values });
    if (
      sql.includes('FROM "reader_summary_production_recovery_leases"') &&
      sql.includes('"responsePayload"')
    ) {
      return (this.persisted === undefined ? [] : [this.persisted]) as T;
    }
    if (
      sql.includes("transaction_timestamp()") &&
      sql.includes('AS "issuedAt"')
    ) {
      return [fixtureScope] as T;
    }
    if (sql.includes('FROM "tenants" AS tenant')) {
      return [{ id: fixtureScope.tenantId }] as T;
    }
    if (sql.endsWith("FOR SHARE")) {
      return [] as T;
    }
    if (sql.includes('FROM "feed_items" AS feed')) {
      return this.evidenceRows as T;
    }
    if (sql.includes('"persist_reader_summary_production_recovery_v2"')) {
      const binding = JSON.parse(String(values[0])) as {
        readonly canonicalSha256: string;
      };
      this.persisted = {
        requestHash: binding.canonicalSha256,
        responsePayload: binding,
      };
      return [{ persisted: true }] as T;
    }
    if (sql.includes('FROM jsonb_to_recordset')) {
      return [{ finalizedCount: this.finalizedCount }] as T;
    }
    throw new Error(`Unexpected fake recovery SQL: ${sql}`);
  };

  readonly $transaction = async <T>(
    operation: (client: this) => Promise<T>,
    options?: unknown,
  ): Promise<T> => {
    this.transactionOptions.push(options);
    return operation(this);
  };
}

const evidenceRow = (params: {
  readonly ordinal: number;
  readonly date: string;
  readonly providerKey: string;
  readonly providerIndex: number;
}): ProductionRecoveryEvidenceRow => {
  const suffix = params.ordinal.toString().padStart(12, "0");
  const github = params.providerKey === "github-trending-page";
  return {
    requestedUtcDate: params.date,
    providerKey: params.providerKey,
    feedItemId: `10000000-0000-4000-8000-${suffix}`,
    sourceItemId: `20000000-0000-4000-8000-${suffix}`,
    sourceBindingId:
      `30000000-0000-4000-8000-${(params.providerKey.length + 1)
        .toString()
        .padStart(12, "0")}`,
    interestId: "60000000-0000-4000-8000-000000000001",
    providerItemId: `${params.providerKey}:${params.ordinal}`,
    canonicalUrl: `https://evidence.invalid/${params.ordinal}`,
    title: `Evidence ${params.ordinal}`,
    bodyPreview: `Preview ${params.ordinal}`,
    sourceText: `Immutable source text ${params.ordinal}`,
    authorHandle: null,
    sourceContentHash: params.ordinal.toString(16).padStart(64, "0"),
    sourceProviderContentHash: github
      ? (params.ordinal + 1).toString(16).padStart(64, "0")
      : null,
    publishedAt: new Date(`${params.date}T12:00:00.000Z`),
    observedAt: new Date(`${params.date}T12:01:00.000Z`),
    githubResultId: github
      ? `40000000-0000-4000-8000-${suffix}`
      : null,
    githubScanJobId: github
      ? `50000000-0000-4000-8000-${params.date
          .replaceAll("-", "")
          .padStart(12, "0")}`
      : null,
    githubAttemptNumber: github ? 1 : null,
    githubRepositoryIdentity: github
      ? `fixture/repository-${params.providerIndex + 1}`
      : null,
    githubRank: github ? params.providerIndex + 1 : null,
    githubCheckedAt: github
      ? new Date(`${params.date}T11:59:00.000Z`)
      : null,
  };
};

const jsonbRoundTrip = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    return input.map(jsonbRoundTrip);
  }
  if (typeof input !== "object" || input === null) {
    return input;
  }
  return Object.fromEntries(
    Object.entries(input)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, jsonbRoundTrip(value)]),
  );
};
