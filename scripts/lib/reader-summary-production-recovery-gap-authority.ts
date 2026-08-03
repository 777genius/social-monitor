import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import {
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
} from "@social-monitor/summary/domain";
import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import {
  runSerializableReaderSummaryTransaction,
  type PrismaSummaryTransactionOptions,
} from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-transaction";
import {
  readerSummaryProductionRecoveryModelContract,
  type ReaderSummaryProductionRecoveryModelContract,
} from "./reader-summary-production-recovery-model-contract";
export const readerSummaryProductionRecoveryGapDates =
  ["2026-07-29", "2026-07-30", "2026-07-31"] as const;
export const readerSummaryProductionRecoveryGapProviderKeys = [
  "github-trending-page", "hacker-news", "reddit", "rss", "x-twitter",
] as const;
export const readerSummaryProductionRecoveryGapAuthorityCutoffAt =
  "2026-08-01T21:30:00.000Z" as const;
export const readerSummaryProductionRecoveryGapExpectedCounts = Object.freeze({
  "2026-07-29": Object.freeze({
    "github-trending-page": 10, "hacker-news": 0, reddit: 0, rss: 32,
    "x-twitter": 17,
  }),
  "2026-07-30": Object.freeze({
    "github-trending-page": 0, "hacker-news": 0, reddit: 0, rss: 34,
    "x-twitter": 64,
  }),
  "2026-07-31": Object.freeze({
    "github-trending-page": 10, "hacker-news": 0, reddit: 0, rss: 32,
    "x-twitter": 15,
  }),
});
export type ReaderSummaryProductionRecoveryGapDate =
  (typeof readerSummaryProductionRecoveryGapDates)[number];
export type ReaderSummaryProductionRecoveryGapProviderKey =
  (typeof readerSummaryProductionRecoveryGapProviderKeys)[number];
export type ReaderSummaryProductionRecoveryGapEvidenceState =
  | "verified_existing"
  | "missing"
  | "unavailable";
export type ReaderSummaryProductionRecoveryGapEvidence = Readonly<{
  providerKey: ReaderSummaryProductionRecoveryGapProviderKey;
  feedItemId: string; sourceItemId: string; sourceBindingId: string;
  interestId: string; providerItemId: string; canonicalUrl: string;
  title: string; bodyPreview: string; sourceText: string;
  authorHandle?: string;
  sourceContentHash: string; sourceProviderContentHash: string | null;
  publishedAt: string; observedAt: string; createdAt: string;
  sourceObservedAt: string; canonicalIngestedAt: string;
  github?: Readonly<{
    resultId: string; scanJobId: string; scanAttemptNumber: number;
    repositoryIdentity: string; rank: number; checkedAt: string;
  }>;
}>;
export type ReaderSummaryProductionRecoveryGapCoverage = Readonly<{
  providerKey: ReaderSummaryProductionRecoveryGapProviderKey;
  evidenceState: ReaderSummaryProductionRecoveryGapEvidenceState;
  count: number;
  evidenceSha256: string;
}>;
export type ReaderSummaryProductionRecoveryGapDayAuthority = Readonly<{
  schemaVersion: "reader_summary.production_recovery_gap_day.v3";
  recoveryId: string; tenantId: string; workspaceId: string; identity: string;
  requestedUtcDate: ReaderSummaryProductionRecoveryGapDate;
  period: Readonly<{
    startedAt: string; endedAt: string; timezone: "UTC";
  }>;
  providerCoverage: readonly ReaderSummaryProductionRecoveryGapCoverage[];
  providerCounts: readonly ReaderSummaryProductionRecoveryGapCoverage[];
  providerEvidence: Readonly<
    Record<
      ReaderSummaryProductionRecoveryGapProviderKey,
      readonly ReaderSummaryProductionRecoveryGapEvidence[]
    >
  >;
  providerEvidenceSha256: string;
  dominance: Readonly<{
    providerKey: ReaderSummaryProductionRecoveryGapProviderKey | null;
    evidenceCount: number; totalEvidenceCount: number;
    ratioBasisPoints: number; maximumRatioBasisPoints: 7000;
    permitted: boolean;
  }>;
  modelEligibility: Readonly<{
    eligible: boolean; reasons: readonly string[];
    evaluatedAgainst: "immutable_db_evidence";
  }>;
  terminalOutcome: Readonly<{
    status: "PARTIAL" | "UNAVAILABLE"; reasons: readonly string[];
  }> | null;
  modelContract: ReaderSummaryProductionRecoveryModelContract;
  githubEvidence: Readonly<{
    schemaVersion: "reader_summary.production_recovery_github_evidence.v3";
    mode: "verified_existing" | "missing" | "unavailable";
    providerKey: "github-trending-page";
    requestedUtcDate: ReaderSummaryProductionRecoveryGapDate;
    evidenceCount: number; evidenceSha256: string;
    scanJobIds: readonly string[];
  }>;
  canonicalSha256: string;
  planSha256s: readonly [string, string];
}>;
export type ReaderSummaryProductionRecoveryGapAuthorityBinding = Readonly<{
  schemaVersion: "reader_summary.production_recovery_gap_authority.v3";
  recoveryId: string; identity: string; tenantId: string; workspaceId: string;
  requestedUtcDates: typeof readerSummaryProductionRecoveryGapDates;
  canonicalSha256: string;
  dryRunCanonicalSha256s: readonly [string, string];
  lease: Readonly<{
    state: "CONSUMED"; issuedAt: string; consumedAt: string;
  }>;
  boundaries: Readonly<{
    stage: "pre_model"; modelCallPerformed: false;
    publicationPerformed: false; recollectionPerformed: false;
    providerWritePerformed: false;
    authorityCutoffAt: typeof readerSummaryProductionRecoveryGapAuthorityCutoffAt;
  }>;
  modelContract: ReaderSummaryProductionRecoveryModelContract;
  days: readonly [
    ReaderSummaryProductionRecoveryGapDayAuthority,
    ReaderSummaryProductionRecoveryGapDayAuthority,
    ReaderSummaryProductionRecoveryGapDayAuthority,
  ];
}>;
export type ReaderSummaryProductionRecoveryGapScope = Readonly<{
  tenantId: string; workspaceId: string;
}>;
export type ReaderSummaryProductionRecoveryGapEvidenceRow = Readonly<{
  requestedUtcDate: string; providerKey: string;
  feedItemId: string; sourceItemId: string; sourceBindingId: string;
  interestId: string; providerItemId: string; canonicalUrl: string;
  title: string; bodyPreview: string; sourceText: string;
  authorHandle: string | null; sourceContentHash: string;
  sourceProviderContentHash: string | null;
  publishedAt: Date; observedAt: Date; createdAt: Date;
  sourceObservedAt: Date; sourceCreatedAt: Date;
  githubResultId: string | null; githubScanJobId: string | null;
  githubAttemptNumber: number | null; githubRepositoryIdentity: string | null;
  githubRank: number | null; githubCheckedAt: Date | null;
}>;
type PersistedGapAuthorityRow = Readonly<{
  requestHash: string;
  responsePayload: unknown;
}>;
type ScopeRow = Readonly<{
  tenantId: string;
  workspaceId: string;
  issuedAt: Date;
}>;
const transactionOptions: PrismaSummaryTransactionOptions = Object.freeze({
  maxWait: 30_000,
  timeout: 300_000,
});
const boundaries = Object.freeze({
  stage: "pre_model" as const,
  modelCallPerformed: false as const,
  publicationPerformed: false as const,
  recollectionPerformed: false as const,
  providerWritePerformed: false as const,
  authorityCutoffAt: readerSummaryProductionRecoveryGapAuthorityCutoffAt,
});
export const prepareReaderSummaryProductionRecoveryGapAuthority = async (
  client: PrismaSummaryClient,
  scope: ReaderSummaryProductionRecoveryGapScope,
): Promise<Readonly<{
  outcome: "prepared" | "replayed";
  binding: ReaderSummaryProductionRecoveryGapAuthorityBinding;
}>> =>
  withPrismaWriteRetry(() =>
    runSerializableReaderSummaryTransaction(
      client,
      async (prisma) => {
        const existing = await readPersistedGapAuthority(prisma, scope);
        if (existing !== undefined) {
          return { outcome: "replayed" as const, binding: existing };
        }
        const scopeRows = await prisma.$queryRaw<readonly ScopeRow[]>`
          SELECT
            current_setting('social_monitor.tenant_id')::TEXT AS "tenantId",
            current_setting('social_monitor.workspace_id')::TEXT AS "workspaceId",
            date_trunc('milliseconds', transaction_timestamp()) AS "issuedAt"
          WHERE current_setting('transaction_isolation') = 'serializable'
            AND current_setting('transaction_read_only') = 'off'
            AND current_setting('social_monitor.system_access') = 'false'
        `;
        const exactScope = scopeRows[0];
        if (
          scopeRows.length !== 1 ||
          exactScope === undefined ||
          exactScope.tenantId !== scope.tenantId ||
          exactScope.workspaceId !== scope.workspaceId
        ) {
          throw gapAuthorityError("requires an exact writable tenant session");
        }
        await lockGapEvidenceRows(prisma);
        const firstRows = await readGapEvidenceRows(prisma);
        const secondRows = await readGapEvidenceRows(prisma);
        const first = buildReaderSummaryProductionRecoveryGapPlan({
          scope: exactScope,
          rows: firstRows,
          producer: "ordered_filter",
        });
        const second = buildReaderSummaryProductionRecoveryGapPlan({
          scope: exactScope,
          rows: secondRows,
          producer: "grouped_reduce",
        });
        const firstCanonical = canonicalizeReaderSummaryWeeklyJson(first);
        const secondCanonical = canonicalizeReaderSummaryWeeklyJson(second);
        if (
          firstCanonical.json !== secondCanonical.json ||
          firstCanonical.sha256 !== secondCanonical.sha256
        ) {
          throw gapAuthorityError(
            "requires two byte-identical independently produced plans",
          );
        }
        const rows = await prisma.$queryRaw<readonly PersistedGapAuthorityRow[]>`
          SELECT
            result."canonicalSha256" AS "requestHash",
            result."binding" AS "responsePayload"
          FROM "persist_reader_summary_production_recovery_gap_v3"(
            ${JSON.stringify(first)}::jsonb,
            ${JSON.stringify(second)}::jsonb
          ) AS result
        `;
        if (rows.length !== 1 || rows[0] === undefined) {
          throw gapAuthorityError("persistence did not return one authority");
        }
        return {
          outcome: "prepared" as const,
          binding: verifyReaderSummaryProductionRecoveryGapAuthority(
            rows[0].responsePayload,
            rows[0].requestHash,
          ),
        };
      },
      transactionOptions,
    ),
  );
export const buildReaderSummaryProductionRecoveryGapPlan = (params: {
  scope: ScopeRow;
  rows: readonly ReaderSummaryProductionRecoveryGapEvidenceRow[];
  producer: "ordered_filter" | "grouped_reduce";
}): Readonly<Record<string, unknown>> => {
  assertUuid(params.scope.tenantId, "tenant id");
  assertUuid(params.scope.workspaceId, "workspace id");
  const issuedAt = canonicalTimestamp(params.scope.issuedAt);
  const identity = `reader_summary.production_recovery_gap_authority.v3:${sha256(
    `${params.scope.tenantId}:${params.scope.workspaceId}:${readerSummaryProductionRecoveryGapDates.join(
      ",",
    )}`,
  )}`;
  const recoveryId = deterministicUuid(identity);
  const grouped =
    params.producer === "ordered_filter"
      ? undefined
      : groupRows(params.rows);
  const seenFeedIds = new Set<string>();
  const seenSourceIds = new Set<string>();
  const days = readerSummaryProductionRecoveryGapDates.map((date) =>
    buildGapDay({
      recoveryId,
      tenantId: params.scope.tenantId,
      workspaceId: params.scope.workspaceId,
      date,
      rows:
        grouped?.get(date) ??
        params.rows.filter((row) => row.requestedUtcDate === date),
      seenFeedIds,
      seenSourceIds,
    }),
  );
  if (
    params.rows.length !==
    days.reduce(
      (total, day) =>
        total +
        day.providerCoverage.reduce(
          (dayTotal, provider) => dayTotal + provider.count,
          0,
        ),
      0,
    ) + params.rows.filter((row) =>
      row.providerKey === "github-trending-page" && params.rows.some(
        (candidate) => candidate.requestedUtcDate === row.requestedUtcDate &&
          candidate.providerKey === row.providerKey &&
          !hasCompleteGithubProof(candidate),
      ),
    ).length
  ) {
    throw gapAuthorityError("contains evidence outside Jul29-Jul31 UTC");
  }
  return deepFreezeReaderSummaryWeekly({
    schemaVersion: "reader_summary.production_recovery_gap_authority.v3",
    recoveryId,
    identity,
    tenantId: params.scope.tenantId,
    workspaceId: params.scope.workspaceId,
    requestedUtcDates: readerSummaryProductionRecoveryGapDates,
    issuedAt,
    boundaries,
    modelContract: { ...readerSummaryProductionRecoveryModelContract },
    days,
  });
};
export const verifyReaderSummaryProductionRecoveryGapAuthority = (
  input: unknown,
  expectedSha256: string,
): ReaderSummaryProductionRecoveryGapAuthorityBinding => {
  if (!isRecord(input)) {
    throw gapAuthorityError("persisted binding is not an object");
  }
  const binding = input as unknown as ReaderSummaryProductionRecoveryGapAuthorityBinding;
  if (
    binding.schemaVersion !==
      "reader_summary.production_recovery_gap_authority.v3" ||
    binding.canonicalSha256 !== expectedSha256 ||
    !isSha256(expectedSha256) ||
    binding.lease?.state !== "CONSUMED" ||
    binding.lease.issuedAt !== binding.lease.consumedAt ||
    binding.boundaries?.stage !== "pre_model" ||
    binding.boundaries.modelCallPerformed !== false ||
    binding.boundaries.publicationPerformed !== false ||
    binding.boundaries.recollectionPerformed !== false ||
    binding.boundaries.providerWritePerformed !== false ||
    binding.boundaries.authorityCutoffAt !==
      readerSummaryProductionRecoveryGapAuthorityCutoffAt ||
    !isDeepStrictEqual(
      binding.modelContract,
      readerSummaryProductionRecoveryModelContract,
    ) ||
    JSON.stringify(binding.requestedUtcDates) !==
      JSON.stringify(readerSummaryProductionRecoveryGapDates) ||
    binding.dryRunCanonicalSha256s?.length !== 2 ||
    binding.dryRunCanonicalSha256s.some(
      (hash) => hash !== binding.canonicalSha256,
    ) ||
    binding.days?.length !== 3
  ) {
    throw gapAuthorityError("persisted binding diverged");
  }
  for (const [index, date] of readerSummaryProductionRecoveryGapDates.entries()) {
    const day = binding.days[index];
    if (
      day?.requestedUtcDate !== date ||
      day.schemaVersion !== "reader_summary.production_recovery_gap_day.v3" ||
      day.planSha256s.some((hash) => hash !== day.canonicalSha256) ||
      day.providerCoverage.length !==
        readerSummaryProductionRecoveryGapProviderKeys.length ||
      day.providerCoverage.some(
        (coverage, providerIndex) =>
          coverage.providerKey !==
            readerSummaryProductionRecoveryGapProviderKeys[providerIndex] ||
          coverage.count !==
            day.providerEvidence[coverage.providerKey].length ||
          coverage.evidenceSha256 !== canonicalizeReaderSummaryWeeklyJson(
            day.providerEvidence[coverage.providerKey],
          ).sha256 ||
          (coverage.evidenceState !== "verified_existing" &&
            day.modelEligibility.eligible),
      ) ||
      (!day.dominance.permitted && day.modelEligibility.eligible) ||
      !verifyGapDaySeal(binding, day)
    ) {
      throw gapAuthorityError(`${date} persisted day diverged`);
    }
  }
  const persistedPlan = {
    schemaVersion: binding.schemaVersion,
    recoveryId: binding.recoveryId,
    identity: binding.identity,
    tenantId: binding.tenantId,
    workspaceId: binding.workspaceId,
    requestedUtcDates: binding.requestedUtcDates,
    issuedAt: binding.lease.issuedAt,
    boundaries: binding.boundaries,
    modelContract: binding.modelContract,
    days: binding.days.map((day) => ({
      identity: day.identity,
      requestedUtcDate: day.requestedUtcDate,
      canonicalSha256: day.canonicalSha256,
      providerEvidenceSha256: day.providerEvidenceSha256,
      planSha256s: day.planSha256s,
    })),
  };
  if (canonicalizeReaderSummaryWeeklyJson(persistedPlan).sha256 !== expectedSha256) {
    throw gapAuthorityError("persisted canonical plan seal diverged");
  }
  return deepFreezeReaderSummaryWeekly(binding);
};
const verifyGapDaySeal = (
  binding: ReaderSummaryProductionRecoveryGapAuthorityBinding,
  day: ReaderSummaryProductionRecoveryGapDayAuthority,
): boolean => {
  const total = day.providerCoverage.reduce((sum, coverage) => sum + coverage.count, 0);
  const dominant = day.providerCoverage.reduce<
    ReaderSummaryProductionRecoveryGapCoverage | undefined
  >((current, value) => current === undefined || value.count > current.count
    ? value
    : current, undefined);
  const ratio = total === 0 || dominant === undefined
    ? 0
    : Math.floor((dominant.count * 10_000) / total);
  const permitted = total > 0 && ratio <= 7000;
  const reasons = [
    ...day.providerCoverage
      .filter((coverage) => coverage.evidenceState !== "verified_existing")
      .map((coverage) =>
        `provider_${coverage.providerKey}_${coverage.evidenceState}`),
    ...(permitted ? [] : ["provider_dominance_unresolved"]),
  ].sort();
  const evidenceSha = canonicalizeReaderSummaryWeeklyJson(
    day.providerCoverage.map(({ providerKey, count, evidenceSha256 }) => ({
      providerKey, count, sha256: evidenceSha256,
    })),
  ).sha256;
  assertExactGapCoverage(day.requestedUtcDate, day.providerCoverage);
  const record = {
    schemaVersion: day.schemaVersion,
    recoveryId: binding.recoveryId,
    tenantId: binding.tenantId,
    workspaceId: binding.workspaceId,
    requestedUtcDate: day.requestedUtcDate,
    period: day.period,
    providerCoverage: day.providerCoverage,
    providerEvidenceSha256: day.providerEvidenceSha256,
    dominance: day.dominance,
    modelEligibility: day.modelEligibility,
    terminalOutcome: day.terminalOutcome,
    modelContract: day.modelContract,
    githubEvidence: day.githubEvidence,
  };
  return day.providerEvidenceSha256 === evidenceSha &&
    day.dominance.providerKey === (dominant?.providerKey ?? null) &&
    day.dominance.evidenceCount === (dominant?.count ?? 0) &&
    day.dominance.totalEvidenceCount === total &&
    day.dominance.ratioBasisPoints === ratio &&
    day.dominance.maximumRatioBasisPoints === 7000 &&
    day.dominance.permitted === permitted &&
    day.modelEligibility.eligible === (reasons.length === 0) &&
    JSON.stringify(day.modelEligibility.reasons) === JSON.stringify(reasons) &&
    day.modelEligibility.evaluatedAgainst === "immutable_db_evidence" &&
    isDeepStrictEqual(
      day.terminalOutcome,
      terminalOutcomeFor(reasons, permitted),
    ) &&
    isDeepStrictEqual(
      day.modelContract,
      readerSummaryProductionRecoveryModelContract,
    ) &&
    canonicalizeReaderSummaryWeeklyJson(record).sha256 === day.canonicalSha256 &&
    day.identity ===
      `reader_summary.production_recovery_gap_day.v3:${day.canonicalSha256}`;
};
const buildGapDay = (params: {
  recoveryId: string;
  tenantId: string;
  workspaceId: string;
  date: ReaderSummaryProductionRecoveryGapDate;
  rows: readonly ReaderSummaryProductionRecoveryGapEvidenceRow[];
  seenFeedIds: Set<string>;
  seenSourceIds: Set<string>;
}): ReaderSummaryProductionRecoveryGapDayAuthority => {
  const unavailableProviders = new Set<ReaderSummaryProductionRecoveryGapProviderKey>();
  const providerEvidence = Object.fromEntries(
    readerSummaryProductionRecoveryGapProviderKeys.map((providerKey) => {
      const rows = params.rows.filter((row) => row.providerKey === providerKey);
      if (
        providerKey === "github-trending-page" &&
        rows.some((row) => !hasCompleteGithubProof(row))
      ) {
        unavailableProviders.add(providerKey);
        rows.forEach((row) => recordUnavailableEvidenceIdentity(row, params));
        return [providerKey, []] as const;
      }
      return [
        providerKey,
        rows.map((row) => exactGapEvidence(row, providerKey, params)),
      ] as const;
    }),
  ) as Record<
    ReaderSummaryProductionRecoveryGapProviderKey,
    readonly ReaderSummaryProductionRecoveryGapEvidence[]
  >;
  const providerCoverage = readerSummaryProductionRecoveryGapProviderKeys.map(
    (providerKey) => {
      const evidence = providerEvidence[providerKey];
      return {
        providerKey,
        evidenceState:
          unavailableProviders.has(providerKey)
            ? ("unavailable" as const)
            : evidence.length === 0
            ? ("missing" as const)
            : ("verified_existing" as const),
        count: evidence.length,
        evidenceSha256: canonicalizeReaderSummaryWeeklyJson(evidence).sha256,
      };
    },
  );
  const providerEvidenceSha256 = canonicalizeReaderSummaryWeeklyJson(
    providerCoverage.map(({ providerKey, count, evidenceSha256 }) => ({
      providerKey,
      count,
      sha256: evidenceSha256,
    })),
  ).sha256;
  assertExactGapCoverage(params.date, providerCoverage, params.rows);
  const totalEvidenceCount = providerCoverage.reduce(
    (total, coverage) => total + coverage.count,
    0,
  );
  const dominant = providerCoverage.reduce<
    ReaderSummaryProductionRecoveryGapCoverage | undefined
  >(
    (current, candidate) =>
      current === undefined || candidate.count > current.count
        ? candidate
        : current,
    undefined,
  );
  const ratioBasisPoints =
    totalEvidenceCount === 0 || dominant === undefined
      ? 0
      : Math.floor((dominant.count * 10_000) / totalEvidenceCount);
  const dominance = {
    providerKey: dominant?.providerKey ?? null,
    evidenceCount: dominant?.count ?? 0,
    totalEvidenceCount,
    ratioBasisPoints,
    maximumRatioBasisPoints: 7000 as const,
    permitted: totalEvidenceCount > 0 && ratioBasisPoints <= 7000,
  };
  const reasons = [
    ...providerCoverage
      .filter((coverage) => coverage.evidenceState !== "verified_existing")
      .map(
        (coverage) =>
          `provider_${coverage.providerKey}_${coverage.evidenceState}`,
      ),
    ...(dominance.permitted ? [] : ["provider_dominance_unresolved"]),
  ].sort();
  const modelEligibility = {
    eligible: reasons.length === 0,
    reasons,
    evaluatedAgainst: "immutable_db_evidence" as const,
  };
  const terminalOutcome = terminalOutcomeFor(reasons, dominance.permitted);
  const githubCoverage = providerCoverage[0]!;
  const githubRows = providerEvidence["github-trending-page"];
  const githubEvidence = {
    schemaVersion:
      "reader_summary.production_recovery_github_evidence.v3" as const,
    mode: githubCoverage.evidenceState,
    providerKey: "github-trending-page" as const,
    requestedUtcDate: params.date,
    evidenceCount: githubRows.length,
    evidenceSha256: githubCoverage.evidenceSha256,
    scanJobIds: [
      ...new Set(
        githubRows.flatMap((row) =>
          row.github === undefined ? [] : [row.github.scanJobId],
        ),
      ),
    ].sort(),
  };
  const period = {
    startedAt: `${params.date}T00:00:00.000Z`,
    endedAt: new Date(
      Date.parse(`${params.date}T00:00:00.000Z`) + 86_400_000,
    ).toISOString(),
    timezone: "UTC" as const,
  };
  const canonicalRecord = {
    schemaVersion: "reader_summary.production_recovery_gap_day.v3" as const,
    recoveryId: params.recoveryId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    requestedUtcDate: params.date,
    period,
    providerCoverage,
    providerEvidenceSha256,
    dominance,
    modelEligibility,
    terminalOutcome,
    modelContract: readerSummaryProductionRecoveryModelContract,
    githubEvidence,
  };
  const canonicalSha256 =
    canonicalizeReaderSummaryWeeklyJson(canonicalRecord).sha256;
  return deepFreezeReaderSummaryWeekly({
    schemaVersion: "reader_summary.production_recovery_gap_day.v3" as const,
    recoveryId: params.recoveryId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    identity: `reader_summary.production_recovery_gap_day.v3:${canonicalSha256}`,
    requestedUtcDate: params.date,
    period,
    providerCoverage,
    providerCounts: providerCoverage.map((coverage) => ({ ...coverage })),
    providerEvidence,
    providerEvidenceSha256,
    dominance,
    modelEligibility,
    terminalOutcome,
    modelContract: { ...readerSummaryProductionRecoveryModelContract },
    githubEvidence,
    canonicalSha256,
    planSha256s: [canonicalSha256, canonicalSha256] as const,
  });
};
const assertExactGapCoverage = (
  date: ReaderSummaryProductionRecoveryGapDate,
  coverage: readonly ReaderSummaryProductionRecoveryGapCoverage[],
  rows?: readonly ReaderSummaryProductionRecoveryGapEvidenceRow[],
): void => {
  const expected = readerSummaryProductionRecoveryGapExpectedCounts[date];
  if (
    coverage.length !== readerSummaryProductionRecoveryGapProviderKeys.length ||
    coverage.some((entry, index) => {
      const providerKey = readerSummaryProductionRecoveryGapProviderKeys[index];
      const expectedCount = providerKey === undefined ? undefined : expected[providerKey];
      const rawCount = providerKey === undefined || rows === undefined
        ? 0
        : rows.filter((row) => row.providerKey === providerKey).length;
      if (
        providerKey === "github-trending-page" &&
        entry.evidenceState === "unavailable"
      ) {
        return entry.providerKey !== providerKey || entry.count !== 0 ||
          expectedCount === 0 ||
          (rows !== undefined && rawCount !== expectedCount);
      }
      return entry.providerKey !== providerKey ||
        entry.count !== expectedCount ||
        entry.evidenceState !==
          (expectedCount === 0 ? "missing" : "verified_existing");
    })
  ) {
    const actual = coverage.map(({ providerKey, count, evidenceState }) =>
      ({ providerKey, count, evidenceState }));
    throw gapAuthorityError(`${date} immutable provider counts diverged ${
      JSON.stringify({ date, actual })}`);
  }
};
const terminalOutcomeFor = (
  reasons: readonly string[],
  dominancePermitted: boolean,
): ReaderSummaryProductionRecoveryGapDayAuthority["terminalOutcome"] =>
  reasons.length === 0
    ? null
    : {
        status: dominancePermitted ? "PARTIAL" : "UNAVAILABLE",
        reasons: [...reasons],
      };

const exactGapEvidence = (
  row: ReaderSummaryProductionRecoveryGapEvidenceRow,
  providerKey: ReaderSummaryProductionRecoveryGapProviderKey,
  state: Pick<
    Parameters<typeof buildGapDay>[0],
    "date" | "seenFeedIds" | "seenSourceIds"
  >,
): ReaderSummaryProductionRecoveryGapEvidence => {
  if (
    row.requestedUtcDate !== state.date ||
    row.providerKey !== providerKey ||
    !readerSummaryProductionRecoveryGapProviderKeys.includes(providerKey)
  ) {
    throw gapAuthorityError(`${state.date} evidence scope diverged`);
  }
  assertUuid(row.feedItemId, "feed item id");
  assertUuid(row.sourceItemId, "source item id");
  assertUuid(row.sourceBindingId, "source binding id");
  assertUuid(row.interestId, "interest id");
  if (
    state.seenFeedIds.has(row.feedItemId) ||
    state.seenSourceIds.has(row.sourceItemId)
  ) {
    throw gapAuthorityError("evidence identities are duplicated");
  }
  state.seenFeedIds.add(row.feedItemId);
  state.seenSourceIds.add(row.sourceItemId);
  if (!isSha256(row.sourceContentHash)) {
    throw gapAuthorityError("source content hash is invalid");
  }
  if (
    row.sourceProviderContentHash !== null &&
    !isSha256(row.sourceProviderContentHash)
  ) {
    throw gapAuthorityError("provider content hash is invalid");
  }
  const github = providerKey === "github-trending-page"
    ? exactGithubProof(row)
    : undefined;
  return {
    providerKey,
    feedItemId: row.feedItemId,
    sourceItemId: row.sourceItemId,
    sourceBindingId: row.sourceBindingId,
    interestId: row.interestId,
    providerItemId: exactText(row.providerItemId, "provider item id"),
    canonicalUrl: exactText(row.canonicalUrl, "canonical URL"),
    title: exactText(row.title, "title"),
    bodyPreview: exactHistoricalBody(row.bodyPreview, "body preview", 4096),
    sourceText: exactHistoricalBody(row.sourceText, "source text", 4096),
    ...(row.authorHandle === null
      ? {}
      : { authorHandle: exactText(row.authorHandle, "author handle") }),
    sourceContentHash: row.sourceContentHash,
    sourceProviderContentHash: row.sourceProviderContentHash,
    publishedAt: canonicalTimestamp(row.publishedAt),
    observedAt: cutoffTimestamp(row.observedAt, "feed observed_at"),
    createdAt: cutoffTimestamp(row.createdAt, "feed created_at"),
    sourceObservedAt: cutoffTimestamp(
      row.sourceObservedAt,
      "source observed_at",
    ),
    canonicalIngestedAt: cutoffTimestamp(
      row.sourceCreatedAt,
      "canonical ingestion time",
    ),
    ...(github === undefined ? {} : { github }),
  };
};

const exactGithubProof = (
  row: ReaderSummaryProductionRecoveryGapEvidenceRow,
): NonNullable<ReaderSummaryProductionRecoveryGapEvidence["github"]> => {
  if (!hasCompleteGithubProof(row)) {
    throw gapAuthorityError("GitHub DB evidence lacks completed scan proof");
  }
  assertUuid(row.githubResultId, "GitHub result id");
  assertUuid(row.githubScanJobId, "GitHub scan job id");
  if (row.githubAttemptNumber < 1 || row.githubRank < 1) {
    throw gapAuthorityError("GitHub scan proof is invalid");
  }
  return {
    resultId: row.githubResultId,
    scanJobId: row.githubScanJobId,
    scanAttemptNumber: row.githubAttemptNumber,
    repositoryIdentity: exactText(
      row.githubRepositoryIdentity,
      "GitHub repository identity",
    ),
    rank: row.githubRank,
    checkedAt: cutoffTimestamp(row.githubCheckedAt, "GitHub checked_at"),
  };
};

const hasCompleteGithubProof = (
  row: ReaderSummaryProductionRecoveryGapEvidenceRow,
): row is ReaderSummaryProductionRecoveryGapEvidenceRow & Readonly<{
  githubResultId: string;
  githubScanJobId: string;
  githubAttemptNumber: number;
  githubRepositoryIdentity: string;
  githubRank: number;
  githubCheckedAt: Date;
}> => row.githubResultId !== null && row.githubScanJobId !== null &&
  row.githubAttemptNumber !== null && row.githubRepositoryIdentity !== null &&
  row.githubRank !== null && row.githubCheckedAt !== null;

const recordUnavailableEvidenceIdentity = (
  row: ReaderSummaryProductionRecoveryGapEvidenceRow,
  state: Pick<Parameters<typeof buildGapDay>[0], "seenFeedIds" | "seenSourceIds">,
): void => {
  assertUuid(row.feedItemId, "unavailable feed item id");
  assertUuid(row.sourceItemId, "unavailable source item id");
  if (state.seenFeedIds.has(row.feedItemId) || state.seenSourceIds.has(row.sourceItemId)) {
    throw gapAuthorityError("evidence identities are duplicated");
  }
  state.seenFeedIds.add(row.feedItemId);
  state.seenSourceIds.add(row.sourceItemId);
};

const readPersistedGapAuthority = async (
  prisma: Pick<PrismaSummaryClient, "$queryRaw">,
  scope: ReaderSummaryProductionRecoveryGapScope,
): Promise<ReaderSummaryProductionRecoveryGapAuthorityBinding | undefined> => {
  const rows = await prisma.$queryRaw<readonly PersistedGapAuthorityRow[]>`
    SELECT
      result."canonicalSha256" AS "requestHash",
      result."binding" AS "responsePayload"
    FROM "read_reader_summary_production_recovery_gap_v3"(
      ${scope.tenantId}::uuid,
      ${scope.workspaceId}::uuid
    ) AS result
  `;
  if (rows.length > 1) {
    throw gapAuthorityError("persisted authority is ambiguous");
  }
  return rows[0] === undefined
    ? undefined
    : verifyReaderSummaryProductionRecoveryGapAuthority(
        rows[0].responsePayload,
        rows[0].requestHash,
      );
};

const lockGapEvidenceRows = async (
  prisma: Pick<PrismaSummaryClient, "$queryRaw">,
): Promise<void> => {
  await prisma.$queryRaw`
    SELECT feed."id"
    FROM "feed_items" AS feed
    JOIN "source_items" AS source
      ON source."id" = feed."source_item_id"
      AND source."tenant_id" = feed."tenant_id" AND source."workspace_id" = feed."workspace_id"
    JOIN "source_bindings" AS binding
      ON binding."id" = source."source_binding_id"
      AND binding."tenant_id" = source."tenant_id" AND binding."workspace_id" = source."workspace_id"
    JOIN "source_catalog_entries" AS catalog
      ON catalog."id" = binding."source_catalog_entry_id"
    JOIN "interests" AS interest
      ON interest."id" = binding."interest_id"
      AND interest."tenant_id" = binding."tenant_id" AND interest."workspace_id" = binding."workspace_id"
    WHERE feed."tenant_id" = current_setting('social_monitor.tenant_id')::uuid
      AND feed."workspace_id" = current_setting('social_monitor.workspace_id')::uuid
      AND feed."published_at" >= TIMESTAMPTZ '2026-07-29T00:00:00Z'
      AND feed."published_at" < TIMESTAMPTZ '2026-08-01T00:00:00Z'
      AND feed."observed_at" <= ${readerSummaryProductionRecoveryGapAuthorityCutoffAt}::timestamptz
      AND feed."created_at" <= ${readerSummaryProductionRecoveryGapAuthorityCutoffAt}::timestamptz
      AND source."observed_at" <= ${readerSummaryProductionRecoveryGapAuthorityCutoffAt}::timestamptz
      AND source."created_at" <= ${readerSummaryProductionRecoveryGapAuthorityCutoffAt}::timestamptz
      AND feed."provider_key" = ANY(ARRAY[
        'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
      ])
    ORDER BY feed."published_at", feed."provider_key", feed."id"
    FOR SHARE OF feed, source, binding, catalog, interest
  `;
};

const readGapEvidenceRows = (
  prisma: Pick<PrismaSummaryClient, "$queryRaw">,
): Promise<readonly ReaderSummaryProductionRecoveryGapEvidenceRow[]> =>
  prisma.$queryRaw<readonly ReaderSummaryProductionRecoveryGapEvidenceRow[]>`
    SELECT
      to_char(feed."published_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "requestedUtcDate",
      feed."provider_key" AS "providerKey", feed."id"::TEXT AS "feedItemId",
      source."id"::TEXT AS "sourceItemId",
      source."source_binding_id"::TEXT AS "sourceBindingId",
      feed."interest_id"::TEXT AS "interestId",
      source."provider_item_id" AS "providerItemId",
      source."canonical_url" AS "canonicalUrl", feed."title" AS "title",
      feed."body_preview" AS "bodyPreview",
      LEFT(COALESCE(NULLIF(feed."body_preview", ''), source."body"), 4096) AS "sourceText",
      feed."author_handle" AS "authorHandle", source."content_hash" AS "sourceContentHash",
      source."provider_content_hash" AS "sourceProviderContentHash",
      feed."published_at" AS "publishedAt", feed."observed_at" AS "observedAt",
      feed."created_at" AS "createdAt", source."observed_at" AS "sourceObservedAt",
      source."created_at" AS "sourceCreatedAt", github."result_id"::TEXT AS "githubResultId",
      github."scan_job_id"::TEXT AS "githubScanJobId", github."attempt_number" AS "githubAttemptNumber",
      github."repository_identity" AS "githubRepositoryIdentity",
      github."rank" AS "githubRank", github."checked_at" AS "githubCheckedAt"
    FROM "feed_items" AS feed
    JOIN "source_items" AS source
      ON source."id" = feed."source_item_id"
      AND source."tenant_id" = feed."tenant_id" AND source."workspace_id" = feed."workspace_id"
      AND source."source_binding_id" = feed."source_binding_id"
      AND source."provider_key" = feed."provider_key" AND source."canonical_url" = feed."canonical_url"
    JOIN "source_bindings" AS binding
      ON binding."id" = source."source_binding_id"
      AND binding."tenant_id" = source."tenant_id" AND binding."workspace_id" = source."workspace_id"
      AND binding."interest_id" = feed."interest_id" AND binding."status" = 'ENABLED'
      AND binding."deleted_at" IS NULL
    JOIN "source_catalog_entries" AS catalog
      ON catalog."id" = binding."source_catalog_entry_id"
      AND catalog."provider_key" = feed."provider_key"
    JOIN "interests" AS interest
      ON interest."id" = binding."interest_id"
      AND interest."tenant_id" = binding."tenant_id" AND interest."workspace_id" = binding."workspace_id"
      AND interest."status" = 'ENABLED' AND interest."deleted_at" IS NULL
    LEFT JOIN LATERAL (
      SELECT result."id" AS "result_id", result."scan_job_id",
        attempt."attempt_number",
        result."repository_full_name" AS "repository_identity",
        result."rank", result."checked_at"
      FROM "github_repository_trend_results" AS result
      JOIN "scan_jobs" AS scan
        ON scan."id" = result."scan_job_id" AND scan."tenant_id" = result."tenant_id"
        AND scan."workspace_id" = result."workspace_id"
        AND scan."source_binding_id" = result."source_binding_id" AND scan."status" = 'SUCCEEDED'
      JOIN LATERAL (
        SELECT completed."attempt_number"
        FROM "scan_attempts" AS completed
        WHERE completed."scan_job_id" = scan."id"
          AND completed."tenant_id" = scan."tenant_id" AND completed."workspace_id" = scan."workspace_id"
          AND completed."source_binding_id" = scan."source_binding_id"
          AND completed."status" = 'SUCCEEDED' AND completed."finished_at" IS NOT NULL
          AND completed."finished_at" <=
            ${readerSummaryProductionRecoveryGapAuthorityCutoffAt}::timestamptz
        ORDER BY completed."attempt_number" DESC
        LIMIT 1
      ) AS attempt ON TRUE
      WHERE feed."provider_key" = 'github-trending-page'
        AND result."source_item_id" = source."id" AND result."tenant_id" = source."tenant_id"
        AND result."workspace_id" = source."workspace_id"
        AND result."source_binding_id" = source."source_binding_id"
        AND result."repository_url" = source."canonical_url"
        AND result."primary_window" IN ('daily', 'today')
        AND result."checked_at" <=
          ${readerSummaryProductionRecoveryGapAuthorityCutoffAt}::timestamptz
      ORDER BY result."checked_at" DESC, result."id"
      LIMIT 1
    ) AS github ON TRUE
    WHERE feed."tenant_id" = current_setting('social_monitor.tenant_id')::uuid
      AND feed."workspace_id" = current_setting('social_monitor.workspace_id')::uuid
      AND feed."status" = 'VISIBLE'
      AND feed."provider_key" = ANY(ARRAY[
        'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
      ])
      AND feed."published_at" >= TIMESTAMPTZ '2026-07-29T00:00:00Z'
      AND feed."published_at" < TIMESTAMPTZ '2026-08-01T00:00:00Z'
      AND feed."observed_at" <= ${readerSummaryProductionRecoveryGapAuthorityCutoffAt}::timestamptz
      AND feed."created_at" <= ${readerSummaryProductionRecoveryGapAuthorityCutoffAt}::timestamptz
      AND source."observed_at" <= ${readerSummaryProductionRecoveryGapAuthorityCutoffAt}::timestamptz
      AND source."created_at" <= ${readerSummaryProductionRecoveryGapAuthorityCutoffAt}::timestamptz
      AND source."content_hash" ~ '^[0-9a-f]{64}$'
      AND (source."provider_content_hash" IS NULL
        OR source."provider_content_hash" ~ '^[0-9a-f]{64}$')
    ORDER BY "requestedUtcDate",
      array_position(ARRAY[
        'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
      ], feed."provider_key"),
      feed."id"
  `;

const groupRows = (
  rows: readonly ReaderSummaryProductionRecoveryGapEvidenceRow[],
): ReadonlyMap<ReaderSummaryProductionRecoveryGapDate,
  readonly ReaderSummaryProductionRecoveryGapEvidenceRow[]> => {
  const grouped = new Map<
    ReaderSummaryProductionRecoveryGapDate,
    ReaderSummaryProductionRecoveryGapEvidenceRow[]
  >();
  for (const date of readerSummaryProductionRecoveryGapDates) grouped.set(date, []);
  for (const row of rows) {
    if (!readerSummaryProductionRecoveryGapDates.includes(row.requestedUtcDate as ReaderSummaryProductionRecoveryGapDate)) {
      throw gapAuthorityError("contains evidence outside Jul29-Jul31 UTC");
    }
    grouped.get(row.requestedUtcDate as ReaderSummaryProductionRecoveryGapDate)!.push(row);
  }
  return grouped;
};

const canonicalTimestamp = (value: Date): string => {
  if (!Number.isFinite(value.getTime())) {
    throw gapAuthorityError("timestamp is invalid");
  }
  return value.toISOString();
};

const cutoffTimestamp = (value: Date, label: string): string => {
  const timestamp = canonicalTimestamp(value);
  if (timestamp > readerSummaryProductionRecoveryGapAuthorityCutoffAt) {
    throw gapAuthorityError(`${label} exceeds immutable authority cutoff`);
  }
  return timestamp;
};

const exactText = (value: string, label: string): string =>
  exactBoundedText(value, label, 2048);

const exactBoundedText = (
  value: string,
  label: string,
  maximumLength: number,
): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value !== value.trim() ||
    /[\u0000]/u.test(value)
  ) {
    throw gapAuthorityError(`${label} is invalid`);
  }
  return value;
};

// The database seal compares historical body fields byte-for-byte. Preserve
// transport whitespace here while retaining the strict size and NUL bounds.
const exactHistoricalBody = (
  value: string,
  label: string,
  maximumLength: number,
): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    /[\u0000]/u.test(value)
  ) {
    throw gapAuthorityError(`${label} is invalid`);
  }
  return value;
};

const assertUuid = (value: string, label: string): void => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)) {
    throw gapAuthorityError(`${label} is invalid`);
  }
};

const deterministicUuid = (value: string): string => {
  const bytes = Buffer.from(createHash("sha256").update(value).digest()).subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const gapAuthorityError = (reason: string): Error =>
  new Error(`Reader summary production recovery gap authority ${reason}`);
