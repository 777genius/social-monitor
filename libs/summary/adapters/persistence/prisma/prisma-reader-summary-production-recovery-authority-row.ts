import {
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
} from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryProductionRecoveryProviderKeys,
  type ReaderSummaryProductionRecoveryAuthorityBinding,
  type ReaderSummaryProductionRecoveryDayAuthority,
  type ReaderSummaryProductionRecoveryEvidence,
  type ReaderSummaryProductionRecoveryGitHubEvidence,
  type ReaderSummaryProductionRecoveryProviderCount,
  type ReaderSummaryProductionRecoveryProviderKey,
} from "../../../ports/reader-summary-production-recovery-authority.port";

type Binding = ReaderSummaryProductionRecoveryAuthorityBinding;
type Day = ReaderSummaryProductionRecoveryDayAuthority;
type Evidence = ReaderSummaryProductionRecoveryEvidence;
type GitHubEvidence = ReaderSummaryProductionRecoveryGitHubEvidence;
type ProviderCount = ReaderSummaryProductionRecoveryProviderCount;
type ProviderKey = ReaderSummaryProductionRecoveryProviderKey;
type RecoveryDate = "2026-07-23" | "2026-07-24";
type EvidenceByProvider = Readonly<Record<ProviderKey, readonly Evidence[]>>;
const historicalUnavailableReason =
  "Historical GitHub trending evidence was not collected for this UTC day; this one reviewed recovery authorizes an explicit unavailable marker and no substitute data.";
const fail = (reason: string): never => {
  throw new Error(`Reader summary production recovery ${reason}`);
};
const evidenceKeys = ["providerKey", "feedItemId", "sourceItemId", "sourceBindingId", "providerItemId", "canonicalUrl", "sourceContentHash", "sourceProviderContentHash", "publishedAt", "observedAt"] as const;
const githubEvidenceKeys = [...evidenceKeys, "github"] as const;
const githubBindingKeys = ["resultId", "scanJobId", "scanAttemptNumber", "repositoryIdentity", "rank", "checkedAt"] as const;
export const verifiedProductionRecoveryDryRuns = (
  input: unknown,
  canonicalSha256: string,
): readonly [string, string] => {
  const rows = exactArray(input, "dry-run snapshots");
  if (rows.length !== 2) fail("dry-run hashes diverged");
  rows.forEach((candidate, index) => {
    const row = exactRecord(candidate, "dry-run snapshot");
    assertExactKeys(row, ["ordinal", "canonicalSha256"], "dry-run snapshot");
    if (
      row.ordinal !== index + 1 ||
      exactSha256(row.canonicalSha256, "dry-run canonical hash") !==
        canonicalSha256
    ) {
      fail("dry-run hashes diverged");
    }
  });
  return [canonicalSha256, canonicalSha256];
};

export const verifiedProductionRecoveryDays = (params: { input: unknown; canonicalRecord: Readonly<Record<string, unknown>>; recoveryId: string; tenantId: string; workspaceId: string }): readonly [Day, Day] => {
  const inputDays = exactArray(params.input, "daily authorities");
  const planDays = exactArray(params.canonicalRecord.days, "canonical plan days");
  if (inputDays.length !== 2 || planDays.length !== 2) {
    fail("requires exactly two days");
  }
  const days = inputDays.map((input, index) =>
    verifiedDay({
      input,
      planDay: planDays[index],
      recoveryId: params.recoveryId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      expectedDate: index === 0 ? "2026-07-23" : "2026-07-24",
    }),
  );
  const evidence = days.flatMap((day) =>
    readerSummaryProductionRecoveryProviderKeys.flatMap(
      (providerKey) => day.providerEvidence[providerKey],
    ),
  );
  if (
    new Set(evidence.map((item) => item.feedItemId)).size !==
      evidence.length ||
    new Set(evidence.map((item) => item.sourceItemId)).size !==
      evidence.length
  ) {
    fail("evidence is duplicated");
  }
  return [days[0]!, days[1]!];
};

const verifiedDay = (params: { input: unknown; planDay: unknown; recoveryId: string; tenantId: string; workspaceId: string; expectedDate: RecoveryDate }): Day => {
  const day = exactRecord(params.input, "daily authority");
  const planDay = exactRecord(params.planDay, "canonical plan day");
  assertExactKeys(day, [
    "schemaVersion", "identity", "requestedUtcDate", "period",
    "providerCounts", "providerEvidence", "providerEvidenceSha256",
    "githubEvidence", "canonicalSha256",
  ], "daily authority");
  assertExactKeys(planDay, [
    "identity", "requestedUtcDate", "canonicalSha256",
    "providerEvidenceSha256",
  ], "canonical plan day");
  const identity = exactIdentity(day.identity, "daily identity");
  const canonicalSha256 = exactSha256(
    day.canonicalSha256,
    "daily canonical hash",
  );
  const providerCounts = exactProviderCounts(
    day.providerCounts,
    params.expectedDate,
  );
  const providerEvidence = exactProviderEvidence(
    day.providerEvidence,
    providerCounts,
  );
  const evidenceDigests = readerSummaryProductionRecoveryProviderKeys.map(
    (providerKey) => ({
      providerKey,
      count: providerEvidence[providerKey].length,
      sha256: canonicalizeReaderSummaryWeeklyJson(
        providerEvidence[providerKey],
        `${providerKey} production recovery evidence`,
      ).sha256,
    }),
  );
  const providerEvidenceSha256 = canonicalizeReaderSummaryWeeklyJson(
    evidenceDigests,
    "production recovery evidence digests",
  ).sha256;
  if (
    exactSha256(day.providerEvidenceSha256, "provider evidence aggregate hash") !==
    providerEvidenceSha256
  ) {
    fail("provider evidence seal diverged");
  }
  const period = exactPeriod(day.period, params.expectedDate);
  const githubEvidence = exactGitHubEvidence(
    day.githubEvidence,
    params.expectedDate,
    evidenceDigests[0]!.sha256,
    providerEvidence["github-trending-page"],
  );
  const canonicalDay = canonicalizeReaderSummaryWeeklyJson({
    schemaVersion: "reader_summary.production_recovery_day.v1",
    recoveryId: params.recoveryId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    requestedUtcDate: params.expectedDate,
    period,
    providerCounts,
    providerEvidenceDigests: evidenceDigests,
    providerEvidenceSha256,
    githubEvidence,
  }, "production recovery day");
  if (
    day.schemaVersion !== "reader_summary.production_recovery_day.v1" ||
    day.requestedUtcDate !== params.expectedDate ||
    canonicalDay.sha256 !== canonicalSha256 ||
    identity !== `reader_summary.production_recovery_day.v1:${canonicalSha256}` ||
    planDay.identity !== identity ||
    planDay.requestedUtcDate !== params.expectedDate ||
    planDay.canonicalSha256 !== canonicalSha256 ||
    planDay.providerEvidenceSha256 !== providerEvidenceSha256
  ) {
    fail("daily authority diverged");
  }
  return deepFreezeReaderSummaryWeekly({
    schemaVersion: "reader_summary.production_recovery_day.v1" as const,
    identity,
    requestedUtcDate: params.expectedDate,
    period,
    providerCounts,
    providerEvidence,
    providerEvidenceSha256,
    githubEvidence,
    canonicalSha256,
  });
};

const exactProviderCounts = (input: unknown, date: RecoveryDate): readonly ProviderCount[] => {
  const expected =
    date === "2026-07-23" ? [0, 100, 100, 78, 67] : [10, 100, 100, 68, 73];
  const rows = exactArray(input, "provider counts");
  if (rows.length !== readerSummaryProductionRecoveryProviderKeys.length) {
    fail("provider counts diverged");
  }
  return rows.map((candidate, index) => {
    const row = exactRecord(candidate, "provider count");
    const providerKey = readerSummaryProductionRecoveryProviderKeys[index]!;
    assertExactKeys(row, ["providerKey", "count"], "provider count");
    if (row.providerKey !== providerKey || row.count !== expected[index]) {
      fail("provider counts diverged");
    }
    return { providerKey, count: expected[index]! };
  });
};

const exactProviderEvidence = (input: unknown, counts: readonly ProviderCount[]): EvidenceByProvider => {
  const record = exactRecord(input, "provider evidence");
  assertExactKeys(
    record,
    [...readerSummaryProductionRecoveryProviderKeys],
    "provider evidence",
  );
  const feedIds = new Set<string>();
  const sourceIds = new Set<string>();
  const result = {} as Record<ProviderKey, readonly Evidence[]>;
  for (const { providerKey, count } of counts) {
    const rows = exactArray(record[providerKey], `${providerKey} evidence`);
    if (rows.length !== count) {
      fail("evidence count diverged");
    }
    result[providerKey] = rows.map((candidate) => {
      const evidence = exactEvidence(candidate, providerKey);
      if (feedIds.has(evidence.feedItemId) || sourceIds.has(evidence.sourceItemId)) {
        fail("evidence is duplicated");
      }
      feedIds.add(evidence.feedItemId);
      sourceIds.add(evidence.sourceItemId);
      return evidence;
    });
  }
  return result;
};

const exactEvidence = (input: unknown, providerKey: ProviderKey): Evidence => {
  const value = exactRecord(input, "provider evidence item");
  assertExactKeys(
    value,
    providerKey === "github-trending-page" ? githubEvidenceKeys : evidenceKeys,
    "provider evidence item",
  );
  if (value.providerKey !== providerKey) {
    fail("evidence provider diverged");
  }
  const evidence: Evidence = {
    providerKey,
    feedItemId: exactUuid(value.feedItemId, "evidence feed item id"),
    sourceItemId: exactUuid(value.sourceItemId, "evidence source item id"),
    sourceBindingId: exactUuid(
      value.sourceBindingId,
      "evidence source binding id",
    ),
    providerItemId: exactIdentity(value.providerItemId, "evidence provider item id"),
    canonicalUrl: exactIdentity(value.canonicalUrl, "evidence canonical URL"),
    sourceContentHash: exactSha256(
      value.sourceContentHash,
      "evidence source content hash",
    ),
    sourceProviderContentHash:
      value.sourceProviderContentHash === null
        ? null
        : exactSha256(
            value.sourceProviderContentHash,
            "evidence provider content hash",
          ),
    publishedAt: exactTimestamp(
      value.publishedAt,
      "evidence publication timestamp",
    ),
    observedAt: exactTimestamp(value.observedAt, "evidence observation timestamp"),
  };
  if (providerKey !== "github-trending-page") {
    if (Object.hasOwn(value, "github")) {
      fail("non-GitHub evidence was forged");
    }
    return evidence;
  }
  const github = exactRecord(value.github, "GitHub evidence binding");
  assertExactKeys(github, githubBindingKeys, "GitHub evidence binding");
  return {
    ...evidence,
    github: {
      resultId: exactUuid(github.resultId, "GitHub result id"),
      scanJobId: exactUuid(github.scanJobId, "GitHub scan job id"),
      scanAttemptNumber: exactPositiveInteger(
        github.scanAttemptNumber,
        "GitHub scan attempt number",
      ),
      repositoryIdentity: exactIdentity(
        github.repositoryIdentity,
        "GitHub repository identity",
      ),
      rank: exactPositiveInteger(github.rank, "GitHub rank"),
      checkedAt: exactTimestamp(github.checkedAt, "GitHub checked timestamp"),
    },
  };
};

const exactGitHubEvidence = (input: unknown, date: RecoveryDate, evidenceSha256: string, evidence: readonly Evidence[]): GitHubEvidence => {
  const value = exactRecord(input, "GitHub evidence");
  assertExactKeys(value, date === "2026-07-23" ? [
    "schemaVersion", "mode", "providerKey", "requestedUtcDate",
    "evidenceCount", "authorization",
  ] : [
    "schemaVersion", "mode", "providerKey", "requestedUtcDate",
    "evidenceCount", "evidenceSha256", "scanJobIds",
  ], "GitHub evidence");
  if (
    value.schemaVersion !==
      "reader_summary.production_recovery_github_evidence.v1" ||
    value.providerKey !== "github-trending-page" ||
    value.requestedUtcDate !== date
  ) {
    fail("GitHub evidence diverged");
  }
  return date === "2026-07-23"
    ? exactHistoricalGitHubEvidence(value, evidence)
    : exactVerifiedGitHubEvidence(value, evidenceSha256, evidence);
};

const exactHistoricalGitHubEvidence = (value: Readonly<Record<string, unknown>>, evidence: readonly Evidence[]): GitHubEvidence => {
  const authorization = exactRecord(
    value.authorization,
    "historical GitHub authorization",
  );
  assertExactKeys(
    authorization,
    ["authorizationId", "authorizedAt", "reason"],
    "historical GitHub authorization",
  );
  if (
    value.mode !== "historical_unavailable" ||
    value.evidenceCount !== 0 ||
    evidence.length !== 0 ||
    authorization.authorizationId !==
      "reader_summary.production_recovery.github.2026-07-23.v1" ||
    authorization.reason !== historicalUnavailableReason
  ) {
    fail("historical GitHub authorization diverged");
  }
  return {
    schemaVersion: "reader_summary.production_recovery_github_evidence.v1",
    mode: "historical_unavailable",
    providerKey: "github-trending-page",
    requestedUtcDate: "2026-07-23",
    evidenceCount: 0,
    authorization: {
      authorizationId:
        "reader_summary.production_recovery.github.2026-07-23.v1",
      authorizedAt: exactTimestamp(
        authorization.authorizedAt,
        "historical GitHub authorization timestamp",
      ),
      reason: exactIdentity(
        authorization.reason,
        "historical GitHub authorization reason",
      ),
    },
  };
};

const exactVerifiedGitHubEvidence = (value: Readonly<Record<string, unknown>>, evidenceSha256: string, evidence: readonly Evidence[]): GitHubEvidence => {
  const scanJobIds = exactArray(value.scanJobIds, "verified GitHub scan job ids")
    .map((scanJobId) => exactUuid(scanJobId, "GitHub scan job id"));
  const evidenceScanJobIds = [...new Set(evidence.map((item) => {
    const github = item.github;
    return github === undefined
      ? fail("existing GitHub evidence diverged")
      : github.scanJobId;
  }))].sort();
  if (
    value.mode !== "verified_existing" ||
    value.evidenceCount !== 10 ||
    exactSha256(value.evidenceSha256, "verified GitHub evidence hash") !==
      evidenceSha256 ||
    scanJobIds.length === 0 ||
    new Set(scanJobIds).size !== scanJobIds.length ||
    JSON.stringify(scanJobIds) !== JSON.stringify(evidenceScanJobIds) ||
    new Set(evidence.map((item) => item.github?.rank)).size !== 10
  ) {
    fail("existing GitHub evidence diverged");
  }
  return {
    schemaVersion: "reader_summary.production_recovery_github_evidence.v1",
    mode: "verified_existing",
    providerKey: "github-trending-page",
    requestedUtcDate: "2026-07-24",
    evidenceCount: 10,
    evidenceSha256,
    scanJobIds,
  };
};

export const exactBoundaries = (input: unknown): Binding["boundaries"] => {
  const value = exactRecord(input, "recovery boundaries");
  assertExactKeys(value, [
    "stage", "modelCallPerformed", "publicationPerformed",
    "recollectionPerformed",
  ], "recovery boundaries");
  if (
    value.stage !== "pre_model" ||
    value.modelCallPerformed !== false ||
    value.publicationPerformed !== false ||
    value.recollectionPerformed !== false
  ) {
    fail("crossed its pre-model boundary");
  }
  return {
    stage: "pre_model",
    modelCallPerformed: false,
    publicationPerformed: false,
    recollectionPerformed: false,
  };
};

const exactPeriod = (input: unknown, date: RecoveryDate): Day["period"] => {
  const value = exactRecord(input, "daily period");
  assertExactKeys(value, ["startedAt", "endedAt", "timezone"], "daily period");
  const startedAt = `${date}T00:00:00.000Z`;
  const endedAt = new Date(Date.parse(startedAt) + 86_400_000).toISOString();
  if (value.startedAt !== startedAt || value.endedAt !== endedAt || value.timezone !== "UTC") {
    fail("daily period diverged");
  }
  return { startedAt, endedAt, timezone: "UTC" };
};
export const assertRequestedDates = (input: unknown): void => {
  const dates = exactArray(input, "requested UTC dates");
  if (dates.length !== 2 || dates[0] !== "2026-07-23" || dates[1] !== "2026-07-24") {
    fail("date authority diverged");
  }
};

export const exactRecord = (input: unknown, label: string): Readonly<Record<string, unknown>> => {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error(`Reader summary production recovery ${label} is invalid`);
  }
  return input as Readonly<Record<string, unknown>>;
};
export const assertExactKeys = (
  input: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
  label: string,
): void => {
  assertReaderSummaryWeeklyExactObject(
    input,
    expectedKeys,
    `production recovery ${label}`,
    { allowAuthoritativeHashes: true },
  );
};
const exactArray = (input: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(input)) {
    throw new Error(`Reader summary production recovery ${label} is invalid`);
  }
  return input;
};

export const exactIdentity = (input: unknown, label: string): string => {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > 4_096 ||
    input !== input.trim()
  ) {
    throw new Error(`Reader summary production recovery ${label} is invalid`);
  }
  return input;
};

export const exactUuid = (input: unknown, label: string): string => {
  const value = exactIdentity(input, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)) {
    throw new Error(`Reader summary production recovery ${label} is invalid`);
  }
  return value;
};

export const recoveryUuid = (sha256: string): string =>
  `${sha256.slice(0, 8)}-${sha256.slice(8, 12)}-5${sha256.slice(13, 16)}-8${sha256.slice(17, 20)}-${sha256.slice(20, 32)}`;

export const exactSha256 = (input: unknown, label: string): string => {
  if (typeof input !== "string" || !/^[0-9a-f]{64}$/u.test(input)) {
    throw new Error(`Reader summary production recovery ${label} is invalid`);
  }
  return input;
};

const exactPositiveInteger = (input: unknown, label: string): number => {
  if (!Number.isSafeInteger(input) || Number(input) < 1) {
    throw new Error(`Reader summary production recovery ${label} is invalid`);
  }
  return Number(input);
};

const exactTimestamp = (input: unknown, label: string): string => {
  const value = exactIdentity(input, label);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`Reader summary production recovery ${label} is invalid`);
  }
  return value;
};

export const exactDate = (input: unknown, label: string): string => {
  if (!(input instanceof Date) || !Number.isFinite(input.getTime())) {
    throw new Error(`Reader summary production recovery ${label} is invalid`);
  }
  return input.toISOString();
};
