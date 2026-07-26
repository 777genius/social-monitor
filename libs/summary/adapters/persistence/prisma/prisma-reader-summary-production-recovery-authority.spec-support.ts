import {
  canonicalizeReaderSummaryWeeklyJson,
} from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryProductionRecoveryProviderKeys,
  type ReaderSummaryProductionRecoveryProviderKey,
} from "../../../ports/reader-summary-production-recovery-authority.port";

type RawQueryCall = Readonly<{
  sql: string;
  values: readonly unknown[];
}>;

export class FakeProductionRecoveryPrisma {
  readonly calls: RawQueryCall[] = [];
  readonly transactionOptions: unknown[] = [];
  private queryAttempts = 0;

  constructor(
    private readonly rows: readonly Record<string, unknown>[],
    private readonly conflictsBeforeSuccess = 0,
  ) {}

  readonly $queryRaw = async <T>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T> => {
    this.calls.push({ sql: strings.join("?"), values });
    this.queryAttempts += 1;
    if (this.queryAttempts <= this.conflictsBeforeSuccess) {
      throw Object.assign(new Error("serialization conflict"), {
        code: "40001",
      });
    }
    return this.rows as T;
  };

  readonly $transaction = async <T>(
    operation: (client: this) => Promise<T>,
    options?: unknown,
  ): Promise<T> => {
    this.transactionOptions.push(options);
    return operation(this);
  };
}

export const productionRecoverySqlRow = (
  outcome: "prepared" | "replayed" = "prepared",
): Record<string, unknown> => {
  const tenantId = fixtureUuid(7_001, "1");
  const workspaceId = fixtureUuid(7_002, "2");
  const identityCanonical = canonicalizeReaderSummaryWeeklyJson({
    schemaVersion: "reader_summary.production_recovery_identity.v1",
    tenantId,
    workspaceId,
    requestedUtcDates: ["2026-07-23", "2026-07-24"],
  });
  const recoveryId = recoveryUuid(identityCanonical.sha256);
  const identity =
    `reader_summary.production_recovery.v1:${identityCanonical.sha256}`;
  const day23 = fixtureDay({
    recoveryId,
    tenantId,
    workspaceId,
    date: "2026-07-23",
    counts: [0, 100, 100, 75, 67],
    idOffset: 0,
  });
  const day24 = fixtureDay({
    recoveryId,
    tenantId,
    workspaceId,
    date: "2026-07-24",
    counts: [10, 100, 100, 67, 73],
    idOffset: 1_000,
  });
  const canonicalRecord = {
    schemaVersion: "reader_summary.production_recovery_authority.v1",
    recoveryId,
    identity,
    tenantId,
    workspaceId,
    requestedUtcDates: ["2026-07-23", "2026-07-24"],
    boundaries: {
      stage: "pre_model",
      modelCallPerformed: false,
      publicationPerformed: false,
      recollectionPerformed: false,
    },
    days: [planDay(day23), planDay(day24)],
  };
  const canonical = canonicalizeReaderSummaryWeeklyJson(canonicalRecord);
  return {
    outcome,
    recoveryId,
    tenantId,
    workspaceId,
    identity,
    canonicalRecord,
    canonicalBytes: canonical.toBytes(),
    canonicalSha256: canonical.sha256,
    leaseState: "CONSUMED",
    issuedAt: new Date("2026-07-26T12:00:00.000Z"),
    consumedAt: new Date("2026-07-26T12:00:00.001Z"),
    dryRuns: [
      { ordinal: 1, canonicalSha256: canonical.sha256 },
      { ordinal: 2, canonicalSha256: canonical.sha256 },
    ],
    days: [day23, day24],
  };
};

const fixtureDay = (params: Readonly<{
  recoveryId: string;
  tenantId: string;
  workspaceId: string;
  date: "2026-07-23" | "2026-07-24";
  counts: readonly [number, number, number, number, number];
  idOffset: number;
}>): Record<string, unknown> => {
  let itemNumber = params.idOffset;
  const providerCounts = readerSummaryProductionRecoveryProviderKeys.map(
    (providerKey, index) => ({
      providerKey,
      count: params.counts[index]!,
    }),
  );
  const providerEvidence = Object.fromEntries(
    providerCounts.map(({ providerKey, count }) => [
      providerKey,
      Array.from({ length: count }, (_, index) => {
        itemNumber += 1;
        return fixtureEvidence({
          date: params.date,
          providerKey,
          index,
          itemNumber,
        });
      }),
    ]),
  ) as Record<ReaderSummaryProductionRecoveryProviderKey, unknown[]>;
  const providerEvidenceDigests =
    readerSummaryProductionRecoveryProviderKeys.map((providerKey) => ({
      providerKey,
      count: providerEvidence[providerKey].length,
      sha256: canonicalizeReaderSummaryWeeklyJson(
        providerEvidence[providerKey],
      ).sha256,
    }));
  const providerEvidenceSha256 = canonicalizeReaderSummaryWeeklyJson(
    providerEvidenceDigests,
  ).sha256;
  const githubEvidence =
    params.date === "2026-07-23"
      ? {
          schemaVersion:
            "reader_summary.production_recovery_github_evidence.v1",
          mode: "historical_unavailable",
          providerKey: "github-trending-page",
          requestedUtcDate: params.date,
          evidenceCount: 0,
          authorization: {
            authorizationId:
              "reader_summary.production_recovery.github.2026-07-23.v1",
            authorizedAt: "2026-07-26T12:00:00.000Z",
            reason:
              "Historical GitHub trending evidence was not collected for this UTC day; this one reviewed recovery authorizes an explicit unavailable marker and no substitute data.",
          },
        }
      : {
          schemaVersion:
            "reader_summary.production_recovery_github_evidence.v1",
          mode: "verified_existing",
          providerKey: "github-trending-page",
          requestedUtcDate: params.date,
          evidenceCount: 10,
          evidenceSha256: providerEvidenceDigests[0]!.sha256,
          scanJobIds: [fixtureUuid(9_001, "5")],
        };
  const period = {
    startedAt: `${params.date}T00:00:00.000Z`,
    endedAt:
      params.date === "2026-07-23"
        ? "2026-07-24T00:00:00.000Z"
        : "2026-07-25T00:00:00.000Z",
    timezone: "UTC",
  };
  const canonicalRecord = {
    schemaVersion: "reader_summary.production_recovery_day.v1",
    recoveryId: params.recoveryId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    requestedUtcDate: params.date,
    period,
    providerCounts,
    providerEvidenceDigests,
    providerEvidenceSha256,
    githubEvidence,
  };
  const canonical = canonicalizeReaderSummaryWeeklyJson(canonicalRecord);
  return {
    schemaVersion: "reader_summary.production_recovery_day.v1",
    identity:
      `reader_summary.production_recovery_day.v1:${canonical.sha256}`,
    requestedUtcDate: params.date,
    period,
    providerCounts,
    providerEvidence,
    providerEvidenceSha256,
    githubEvidence,
    canonicalSha256: canonical.sha256,
  };
};

const fixtureEvidence = (params: Readonly<{
  date: string;
  providerKey: ReaderSummaryProductionRecoveryProviderKey;
  index: number;
  itemNumber: number;
}>): Record<string, unknown> => {
  const evidence: Record<string, unknown> = {
    providerKey: params.providerKey,
    feedItemId: fixtureUuid(params.itemNumber, "1"),
    sourceItemId: fixtureUuid(params.itemNumber, "2"),
    sourceBindingId: fixtureUuid(
      readerSummaryProductionRecoveryProviderKeys.indexOf(
        params.providerKey,
      ) + 1,
      "3",
    ),
    providerItemId: `${params.providerKey}:${params.itemNumber}`,
    canonicalUrl:
      `https://evidence.invalid/${params.providerKey}/${params.itemNumber}`,
    sourceContentHash: `${params.itemNumber}`.padStart(64, "a").slice(-64),
    sourceProviderContentHash:
      params.providerKey === "github-trending-page"
        ? `${params.itemNumber}`.padStart(64, "b").slice(-64)
        : null,
    publishedAt: `${params.date}T12:00:00.000Z`,
    observedAt: `${params.date}T12:01:00.000Z`,
  };
  if (params.providerKey === "github-trending-page") {
    evidence.github = {
      resultId: fixtureUuid(params.itemNumber, "4"),
      scanJobId: fixtureUuid(9_001, "5"),
      scanAttemptNumber: 1,
      repositoryIdentity: `fixture/repository-${params.index + 1}`,
      rank: params.index + 1,
      checkedAt: `${params.date}T11:59:00.000Z`,
    };
  }
  return evidence;
};

const planDay = (day: Record<string, unknown>): Record<string, unknown> => ({
  identity: day.identity,
  requestedUtcDate: day.requestedUtcDate,
  canonicalSha256: day.canonicalSha256,
  providerEvidenceSha256: day.providerEvidenceSha256,
});

const fixtureUuid = (value: number, prefix: string): string =>
  `${prefix}0000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

const recoveryUuid = (sha256: string): string =>
  `${sha256.slice(0, 8)}-${sha256.slice(8, 12)}-5${sha256.slice(
    13,
    16,
  )}-8${sha256.slice(17, 20)}-${sha256.slice(20, 32)}`;
