import {
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
} from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryProductionRecoveryProviderKeys,
  readerSummaryProductionRecoveryRequestedUtcDates,
  type ReaderSummaryProductionRecoveryAuthorityBinding,
  type ReaderSummaryProductionRecoveryDayAuthority,
  type ReaderSummaryProductionRecoveryEvidence,
  type ReaderSummaryProductionRecoveryProviderKey,
  type ReaderSummaryProductionRecoveryRequestedUtcDate,
} from "../../../ports/reader-summary-production-recovery-authority.port";

export type ProductionRecoveryScopeRow = Readonly<{
  tenantId: string;
  workspaceId: string;
  issuedAt: Date;
}>;

export type ProductionRecoveryEvidenceRow = Readonly<{
  requestedUtcDate: string;
  providerKey: string;
  feedItemId: string;
  sourceItemId: string;
  sourceBindingId: string;
  interestId: string;
  providerItemId: string;
  canonicalUrl: string;
  title: string;
  bodyPreview: string;
  sourceText: string;
  authorHandle: string | null;
  sourceContentHash: string;
  sourceProviderContentHash: string | null;
  publishedAt: Date;
  observedAt: Date;
  githubResultId: string | null;
  githubScanJobId: string | null;
  githubAttemptNumber: number | null;
  githubRepositoryIdentity: string | null;
  githubRank: number | null;
  githubCheckedAt: Date | null;
}>;

const boundaries = Object.freeze({
  stage: "pre_model" as const,
  modelCallPerformed: false as const,
  publicationPerformed: false as const,
  recollectionPerformed: false as const,
});

export const buildProductionRecoveryAuthorityBinding = (params: {
  readonly scope: ProductionRecoveryScopeRow;
  readonly rows: readonly ProductionRecoveryEvidenceRow[];
}): ReaderSummaryProductionRecoveryAuthorityBinding => {
  const tenantId = exactUuid(params.scope.tenantId, "tenant id");
  const workspaceId = exactUuid(params.scope.workspaceId, "workspace id");
  const issuedAt = exactDate(params.scope.issuedAt, "authority timestamp");
  const identityRecord = {
    schemaVersion: "reader_summary.production_recovery_identity.v2",
    tenantId,
    workspaceId,
    requestedUtcDates: readerSummaryProductionRecoveryRequestedUtcDates,
  };
  const identitySha256 =
    canonicalizeReaderSummaryWeeklyJson(identityRecord).sha256;
  const recoveryId = recoveryUuid(identitySha256);
  const identity =
    `reader_summary.production_recovery.v2:${identitySha256}`;
  const seenFeedIds = new Set<string>();
  const seenSourceIds = new Set<string>();
  const days = readerSummaryProductionRecoveryRequestedUtcDates.map((date) =>
    buildDay({
      recoveryId,
      tenantId,
      workspaceId,
      date,
      rows: params.rows.filter((row) => row.requestedUtcDate === date),
      seenFeedIds,
      seenSourceIds,
    }),
  ) as unknown as ReaderSummaryProductionRecoveryAuthorityBinding["days"];
  if (
    params.rows.length !==
    days.reduce(
      (count, day) =>
        count +
        day.providerCounts.reduce(
          (providerCount, provider) => providerCount + provider.count,
          0,
        ),
      0,
    )
  ) {
    fail("contains evidence outside the exact Jul24-Jul27 scope");
  }
  const canonicalRecord = {
    schemaVersion: "reader_summary.production_recovery_authority.v2",
    recoveryId,
    identity,
    tenantId,
    workspaceId,
    requestedUtcDates: readerSummaryProductionRecoveryRequestedUtcDates,
    boundaries,
    days: days.map((day) => ({
      identity: day.identity,
      requestedUtcDate: day.requestedUtcDate,
      canonicalSha256: day.canonicalSha256,
      providerEvidenceSha256: day.providerEvidenceSha256,
      planSha256s: day.planSha256s,
    })),
  };
  const canonicalSha256 =
    canonicalizeReaderSummaryWeeklyJson(canonicalRecord).sha256;
  return deepFreezeReaderSummaryWeekly({
    schemaVersion: "reader_summary.production_recovery_authority.v2",
    recoveryId,
    identity,
    tenantId,
    workspaceId,
    requestedUtcDates: readerSummaryProductionRecoveryRequestedUtcDates,
    canonicalSha256,
    dryRunCanonicalSha256s: [canonicalSha256, canonicalSha256],
    lease: {
      state: "CONSUMED",
      issuedAt,
      consumedAt: issuedAt,
    },
    boundaries,
    days,
  });
};

export const verifyPersistedProductionRecoveryAuthority = (
  input: unknown,
  expectedSha256: string,
): ReaderSummaryProductionRecoveryAuthorityBinding => {
  const binding = exactRecord(input, "persisted authority") as
    unknown as ReaderSummaryProductionRecoveryAuthorityBinding;
  if (
    binding.schemaVersion !==
      "reader_summary.production_recovery_authority.v2" ||
    binding.canonicalSha256 !== exactSha256(expectedSha256, "authority hash") ||
    binding.dryRunCanonicalSha256s?.length !== 2 ||
    binding.dryRunCanonicalSha256s[0] !== binding.canonicalSha256 ||
    binding.dryRunCanonicalSha256s[1] !== binding.canonicalSha256 ||
    binding.lease?.state !== "CONSUMED" ||
    binding.lease.consumedAt !== binding.lease.issuedAt ||
    binding.boundaries?.stage !== "pre_model" ||
    binding.boundaries.modelCallPerformed !== false ||
    binding.boundaries.publicationPerformed !== false ||
    binding.boundaries.recollectionPerformed !== false ||
    JSON.stringify(binding.requestedUtcDates) !==
      JSON.stringify(readerSummaryProductionRecoveryRequestedUtcDates) ||
    binding.days?.length !== 4
  ) {
    fail("persisted authority diverged");
  }
  const rebuilt = buildProductionRecoveryAuthorityBinding({
    scope: {
      tenantId: binding.tenantId,
      workspaceId: binding.workspaceId,
      issuedAt: new Date(binding.lease.issuedAt),
    },
    rows: binding.days.flatMap((day) =>
      readerSummaryProductionRecoveryProviderKeys.flatMap((providerKey) =>
        day.providerEvidence[providerKey].map((evidence) =>
          evidenceToRow(day.requestedUtcDate, evidence),
        ),
      ),
    ),
  });
  if (!persistedAuthoritySealMatches(rebuilt, binding)) {
    fail("persisted authority seal diverged");
  }
  return rebuilt;
};

const persistedAuthoritySealMatches = (
  rebuilt: ReaderSummaryProductionRecoveryAuthorityBinding,
  persisted: ReaderSummaryProductionRecoveryAuthorityBinding,
): boolean => {
  try {
    const { days: rebuiltDays, ...rebuiltAuthority } = rebuilt;
    const { days: persistedDays, ...persistedAuthority } = persisted;
    if (
      canonicalJson(rebuiltAuthority) !== canonicalJson(persistedAuthority) ||
      rebuiltDays.length !== persistedDays.length
    ) {
      return false;
    }
    return rebuiltDays.every((rebuiltDay, index) => {
      const persistedDay = persistedDays[index];
      if (persistedDay === undefined) {
        return false;
      }
      const {
        providerEvidence: rebuiltEvidence,
        ...rebuiltDayAuthority
      } = rebuiltDay;
      const {
        providerEvidence: persistedEvidence,
        ...persistedDayAuthority
      } = persistedDay;
      if (
        canonicalJson(rebuiltDayAuthority) !==
          canonicalJson(persistedDayAuthority) ||
        canonicalJson(Object.keys(rebuiltEvidence).sort()) !==
          canonicalJson(Object.keys(persistedEvidence).sort())
      ) {
        return false;
      }
      return readerSummaryProductionRecoveryProviderKeys.every(
        (providerKey) =>
          canonicalJson(rebuiltEvidence[providerKey]) ===
          canonicalJson(persistedEvidence[providerKey]),
      );
    });
  } catch {
    return false;
  }
};

const canonicalJson = (input: unknown): string =>
  canonicalizeReaderSummaryWeeklyJson(input).json;

const buildDay = (params: {
  readonly recoveryId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly date: ReaderSummaryProductionRecoveryRequestedUtcDate;
  readonly rows: readonly ProductionRecoveryEvidenceRow[];
  readonly seenFeedIds: Set<string>;
  readonly seenSourceIds: Set<string>;
}): ReaderSummaryProductionRecoveryDayAuthority => {
  const providerEvidence = Object.fromEntries(
    readerSummaryProductionRecoveryProviderKeys.map((providerKey) => [
      providerKey,
      params.rows
        .filter((row) => row.providerKey === providerKey)
        .map((row) => exactEvidence(row, providerKey, params)),
    ]),
  ) as unknown as Record<
    ReaderSummaryProductionRecoveryProviderKey,
    readonly ReaderSummaryProductionRecoveryEvidence[]
  >;
  const providerCounts = readerSummaryProductionRecoveryProviderKeys.map(
    (providerKey) => ({
      providerKey,
      count: providerEvidence[providerKey].length,
    }),
  );
  for (const provider of providerCounts) {
    if (provider.count === 0) {
      fail(`${params.date} ${provider.providerKey} collection is unavailable`);
    }
  }
  const hackerNewsCount = providerEvidence["hacker-news"].length;
  const redditCount = providerEvidence.reddit.length;
  if (hackerNewsCount !== 100 || redditCount !== 100) {
    const prefix =
      params.date === "2026-07-27"
        ? "Jul27 fails closed:"
        : `${params.date} is incomplete:`;
    fail(
      `${prefix} Hacker News and Reddit require 100 items each (found ${hackerNewsCount}/${redditCount})`,
    );
  }
  const evidenceDigests = readerSummaryProductionRecoveryProviderKeys.map(
    (providerKey) => ({
      providerKey,
      count: providerEvidence[providerKey].length,
      sha256: canonicalizeReaderSummaryWeeklyJson(
        providerEvidence[providerKey],
      ).sha256,
    }),
  );
  const providerEvidenceSha256 =
    canonicalizeReaderSummaryWeeklyJson(evidenceDigests).sha256;
  const githubRows = providerEvidence["github-trending-page"];
  const githubEvidence = {
    schemaVersion:
      "reader_summary.production_recovery_github_evidence.v2" as const,
    mode: "verified_existing" as const,
    providerKey: "github-trending-page" as const,
    requestedUtcDate: params.date,
    evidenceCount: githubRows.length,
    evidenceSha256: evidenceDigests[0]!.sha256,
    scanJobIds: [
      ...new Set(githubRows.map((row) => row.github!.scanJobId)),
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
    schemaVersion: "reader_summary.production_recovery_day.v2",
    recoveryId: params.recoveryId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    requestedUtcDate: params.date,
    period,
    providerCounts,
    providerEvidenceDigests: evidenceDigests,
    providerEvidenceSha256,
    githubEvidence,
  };
  const canonicalSha256 =
    canonicalizeReaderSummaryWeeklyJson(canonicalRecord).sha256;
  return {
    schemaVersion: "reader_summary.production_recovery_day.v2",
    identity:
      `reader_summary.production_recovery_day.v2:${canonicalSha256}`,
    requestedUtcDate: params.date,
    period,
    providerCounts,
    providerEvidence,
    providerEvidenceSha256,
    githubEvidence,
    canonicalSha256,
    planSha256s: [canonicalSha256, canonicalSha256],
  };
};

const exactEvidence = (
  row: ProductionRecoveryEvidenceRow,
  providerKey: ReaderSummaryProductionRecoveryProviderKey,
  state: Pick<
    Parameters<typeof buildDay>[0],
    "date" | "seenFeedIds" | "seenSourceIds"
  >,
): ReaderSummaryProductionRecoveryEvidence => {
  const feedItemId = exactUuid(row.feedItemId, "feed item id");
  const sourceItemId = exactUuid(row.sourceItemId, "source item id");
  if (
    state.seenFeedIds.has(feedItemId) ||
    state.seenSourceIds.has(sourceItemId)
  ) {
    fail("evidence is duplicated across recovery dates");
  }
  state.seenFeedIds.add(feedItemId);
  state.seenSourceIds.add(sourceItemId);
  const evidence: ReaderSummaryProductionRecoveryEvidence = {
    providerKey,
    feedItemId,
    sourceItemId,
    sourceBindingId: exactUuid(row.sourceBindingId, "source binding id"),
    interestId: exactUuid(row.interestId, "interest id"),
    providerItemId: exactIdentity(row.providerItemId, "provider item id"),
    canonicalUrl: exactIdentity(row.canonicalUrl, "canonical URL"),
    title: exactIdentity(row.title, "title"),
    bodyPreview: exactText(row.bodyPreview, "body preview"),
    sourceText: exactText(row.sourceText, "source text"),
    ...(row.authorHandle === null
      ? {}
      : { authorHandle: exactIdentity(row.authorHandle, "author handle") }),
    sourceContentHash: exactSha256(row.sourceContentHash, "content hash"),
    sourceProviderContentHash:
      row.sourceProviderContentHash === null
        ? null
        : exactSha256(row.sourceProviderContentHash, "provider content hash"),
    publishedAt: exactDate(row.publishedAt, "published timestamp"),
    observedAt: exactDate(row.observedAt, "observed timestamp"),
  };
  if (providerKey !== "github-trending-page") {
    return evidence;
  }
  if (
    row.githubResultId === null ||
    row.githubScanJobId === null ||
    row.githubAttemptNumber === null ||
    row.githubRepositoryIdentity === null ||
    row.githubRank === null ||
    row.githubCheckedAt === null
  ) {
    fail(`${state.date} GitHub evidence lacks completed collection proof`);
  }
  return {
    ...evidence,
    github: {
      resultId: exactUuid(row.githubResultId, "GitHub result id"),
      scanJobId: exactUuid(row.githubScanJobId, "GitHub scan job id"),
      scanAttemptNumber: exactPositiveInteger(
        row.githubAttemptNumber,
        "GitHub attempt",
      ),
      repositoryIdentity: exactIdentity(
        row.githubRepositoryIdentity,
        "GitHub repository",
      ),
      rank: exactPositiveInteger(row.githubRank, "GitHub rank"),
      checkedAt: exactDate(row.githubCheckedAt, "GitHub checked timestamp"),
    },
  };
};

const evidenceToRow = (
  requestedUtcDate: string,
  evidence: ReaderSummaryProductionRecoveryEvidence,
): ProductionRecoveryEvidenceRow => ({
  requestedUtcDate,
  providerKey: evidence.providerKey,
  feedItemId: evidence.feedItemId,
  sourceItemId: evidence.sourceItemId,
  sourceBindingId: evidence.sourceBindingId,
  interestId: evidence.interestId,
  providerItemId: evidence.providerItemId,
  canonicalUrl: evidence.canonicalUrl,
  title: evidence.title,
  bodyPreview: evidence.bodyPreview,
  sourceText: evidence.sourceText,
  authorHandle: evidence.authorHandle ?? null,
  sourceContentHash: evidence.sourceContentHash,
  sourceProviderContentHash: evidence.sourceProviderContentHash,
  publishedAt: new Date(evidence.publishedAt),
  observedAt: new Date(evidence.observedAt),
  githubResultId: evidence.github?.resultId ?? null,
  githubScanJobId: evidence.github?.scanJobId ?? null,
  githubAttemptNumber: evidence.github?.scanAttemptNumber ?? null,
  githubRepositoryIdentity: evidence.github?.repositoryIdentity ?? null,
  githubRank: evidence.github?.rank ?? null,
  githubCheckedAt:
    evidence.github === undefined ? null : new Date(evidence.github.checkedAt),
});

const exactRecord = (
  input: unknown,
  label: string,
): Readonly<Record<string, unknown>> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    fail(`${label} is invalid`);
  }
  return input as Readonly<Record<string, unknown>>;
};

const exactIdentity = (input: unknown, label: string): string => {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > 4_096 ||
    input !== input.trim()
  ) {
    fail(`${label} is invalid`);
  }
  return input as string;
};

const exactText = (input: unknown, label: string): string => {
  if (typeof input !== "string" || input.length > 1_000_000) {
    fail(`${label} is invalid`);
  }
  return input as string;
};

export const exactUuid = (input: unknown, label: string): string => {
  const value = exactIdentity(input, label);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      value,
    )
  ) {
    fail(`${label} is invalid`);
  }
  return value;
};

export const recoveryUuid = (sha256: string): string =>
  `${sha256.slice(0, 8)}-${sha256.slice(8, 12)}-5${sha256.slice(13, 16)}-8${sha256.slice(17, 20)}-${sha256.slice(20, 32)}`;

const exactSha256 = (input: unknown, label: string): string => {
  if (typeof input !== "string" || !/^[0-9a-f]{64}$/u.test(input)) {
    fail(`${label} is invalid`);
  }
  return input as string;
};

const exactPositiveInteger = (input: unknown, label: string): number => {
  if (!Number.isSafeInteger(input) || Number(input) < 1) {
    fail(`${label} is invalid`);
  }
  return Number(input);
};

const exactDate = (input: unknown, label: string): string => {
  if (!(input instanceof Date) || !Number.isFinite(input.getTime())) {
    fail(`${label} is invalid`);
  }
  return (input as Date).toISOString();
};

const fail = (reason: string): never => {
  throw new Error(`Reader summary production recovery ${reason}`);
};
