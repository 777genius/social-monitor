import { createHash } from "node:crypto";

import type { Pool } from "pg";

export const githubTrendingDurableSnapshotRowLimit = 200;
const proofVersion = "github-trending-durable-snapshot-proof-v1" as const;
const providerKey = "github-trending-page" as const;
const expectedRepositoryCount = 10;
const maxCandidateBytes = 262_144;
const maxIdentityBytes = 256;
const maxTitleBytes = 512;
const maxBodyPreviewBytes = 4_096;

export const githubTrendingDurableSnapshotBindingFingerprint = (
  value: string,
): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

export type GitHubTrendingDurableSnapshotCandidate = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceTenantId: string;
  readonly sourceWorkspaceId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly feedSourceBindingId: string;
  readonly sourceSourceBindingId: string;
  readonly feedProviderKey: string;
  readonly sourceProviderKey: string;
  readonly feedStatus: string;
  readonly providerItemId: string;
  readonly canonicalUrl: string;
  readonly metadataKind: string;
  readonly repositoryFullName: string;
  readonly repositoryUrl: string;
  readonly rank: number;
  readonly starsGained: number;
  readonly totalStars: number;
  readonly window: string;
  readonly scanJobId: string;
  readonly feedScanJobId: string;
  readonly fetchStartedAt: string;
  readonly feedFetchStartedAt: string;
  readonly checkedAt: string;
  readonly feedCheckedAt: string;
  readonly publishedAt: string;
  readonly sourcePublishedAt: string;
  readonly feedObservedAt: string;
  readonly sourceObservedAt: string;
  readonly scanJobStatus: string;
  readonly scanJobTenantId: string;
  readonly scanJobWorkspaceId: string;
  readonly scanJobSourceBindingId: string;
  readonly sourceContentHash: string;
  readonly sourceProviderContentHash: string;
  readonly sourceTitle: string;
  readonly feedTitle: string;
  readonly bodyPreview: string;
  readonly sourceTitleBytes: number;
  readonly feedTitleBytes: number;
  readonly bodyPreviewBytes: number;
  readonly feedSnapshotSourceBindingId: string;
  readonly feedSnapshotProviderKey: string;
};

export type GitHubTrendingDurableSnapshotProofRow = {
  readonly rank: number;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerItemId: string;
  readonly repositoryIdentity: string;
  readonly canonicalUrl: string;
  readonly starsGained: number;
  readonly totalStars: number;
  readonly highlightEligible: boolean;
  readonly sourceContentHash: string;
  readonly sourceProviderContentHash: string;
  readonly titleSha256: string;
  readonly bodyPreviewSha256: string;
  readonly titleBytes: number;
  readonly bodyPreviewBytes: number;
};

export type GitHubTrendingDurableSnapshotProof = {
  readonly proofVersion: typeof proofVersion;
  readonly providerKey: typeof providerKey;
  readonly requestedUtcDay: string;
  readonly group: {
    readonly sourceBindingId: string;
    readonly scanJobId: string;
    readonly fetchStartedAt: string;
    readonly checkedAt: string;
    readonly publishedAt: string;
    readonly observedAt: string;
    readonly sourceScanStatus: "SUCCEEDED";
  };
  readonly rows: readonly GitHubTrendingDurableSnapshotProofRow[];
  readonly proofSha256: string;
};

export type GitHubTrendingDurableSnapshotReadQuery = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly requestedUtcDay: string;
};

export interface GitHubTrendingDurableSnapshotReader {
  readCandidates(
    query: GitHubTrendingDurableSnapshotReadQuery,
  ): Promise<readonly GitHubTrendingDurableSnapshotCandidate[]>;
}

export class InMemoryGitHubTrendingDurableSnapshotReader
  implements GitHubTrendingDurableSnapshotReader
{
  constructor(
    private readonly rows: readonly GitHubTrendingDurableSnapshotCandidate[],
  ) {}

  async readCandidates(
    query: GitHubTrendingDurableSnapshotReadQuery,
  ): Promise<readonly GitHubTrendingDurableSnapshotCandidate[]> {
    const window = requestedDayWindow(query.requestedUtcDay);
    return this.rows
      .filter(
        (row) =>
          row.tenantId === query.tenantId &&
          row.workspaceId === query.workspaceId &&
          row.sourceTenantId === query.tenantId &&
          row.sourceWorkspaceId === query.workspaceId &&
          (row.feedSourceBindingId === query.sourceBindingId ||
            row.sourceSourceBindingId === query.sourceBindingId) &&
          touchesRequestedDay(row, window),
      )
      .sort(
        (left, right) =>
          left.feedItemId.localeCompare(right.feedItemId, "en-US"),
      )
      .slice(0, githubTrendingDurableSnapshotRowLimit + 1);
  }
}

export class PrismaGitHubTrendingDurableSnapshotReader
  implements GitHubTrendingDurableSnapshotReader
{
  constructor(private readonly database: Pick<Pool, "query">) {}

  async readCandidates(
    query: GitHubTrendingDurableSnapshotReadQuery,
  ): Promise<readonly GitHubTrendingDurableSnapshotCandidate[]> {
    const window = requestedDayWindow(query.requestedUtcDay);
    const result = await this.database.query<PrismaCandidateRow>(
      prismaCandidateQuery,
      [
        query.tenantId,
        query.workspaceId,
        query.sourceBindingId,
        window.startInclusive.toISOString(),
        window.endExclusive.toISOString(),
        githubTrendingDurableSnapshotRowLimit + 1,
      ],
    );
    return result.rows.map(candidateFromPrisma);
  }
}

export const reuseGitHubTrendingDurableSnapshot = async (params: {
  readonly reader: GitHubTrendingDurableSnapshotReader;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly requestedUtcDay: string;
  readonly observedThrough: Date;
}): Promise<GitHubTrendingDurableSnapshotProof> => {
  const window = requestedDayWindow(params.requestedUtcDay);
  if (
    !Number.isFinite(params.observedThrough.getTime()) ||
    params.observedThrough.getTime() < window.endExclusive.getTime()
  ) {
    throw invalidSnapshot("closed_day_required");
  }
  const candidates = await params.reader.readCandidates(params);
  if (
    candidates.length === 0 ||
    candidates.length > githubTrendingDurableSnapshotRowLimit ||
    Buffer.byteLength(JSON.stringify(candidates), "utf8") > maxCandidateBytes
  ) {
    throw invalidSnapshot(
      candidates.length === 0 ? "snapshot_missing" : "candidate_bound_exceeded",
    );
  }
  assertExactOrderingIdentities(candidates);
  const ordered = [...candidates].sort(compareNewestCandidate);
  const selectedIdentity = groupIdentity(ordered[0]!);
  const selected = ordered.filter(
    (candidate) => groupIdentity(candidate) === selectedIdentity,
  );
  rejectAmbiguousNewestEnvelope(ordered, ordered[0]!);
  const proof = certifySelectedGroup({
    rows: selected,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    sourceBindingId: params.sourceBindingId,
    requestedUtcDay: params.requestedUtcDay,
    observedThrough: params.observedThrough,
  });
  if (!githubTrendingDurableSnapshotProofPassesInvariants(proof)) {
    throw invalidSnapshot("proof_invariant_failed");
  }
  return proof;
};

export const githubTrendingDurableSnapshotProofPassesInvariants = (
  proof: GitHubTrendingDurableSnapshotProof | undefined,
): boolean => {
  try {
    if (
      proof === undefined ||
      proof.proofVersion !== proofVersion ||
      proof.providerKey !== providerKey ||
      proof.group.sourceScanStatus !== "SUCCEEDED" ||
      proof.rows.length !== expectedRepositoryCount
    ) {
      return false;
    }
    const window = requestedDayWindow(proof.requestedUtcDay);
    const fetchStartedAt = exactIsoTime(proof.group.fetchStartedAt);
    const checkedAt = exactIsoTime(proof.group.checkedAt);
    const publishedAt = exactIsoTime(proof.group.publishedAt);
    const observedAt = exactIsoTime(proof.group.observedAt);
    if (
      !nonEmptyBounded(proof.group.sourceBindingId, maxIdentityBytes) ||
      !nonEmptyBounded(proof.group.scanJobId, maxIdentityBytes) ||
      fetchStartedAt === undefined ||
      checkedAt === undefined ||
      publishedAt === undefined ||
      observedAt === undefined ||
      !inside(fetchStartedAt, window) ||
      !inside(checkedAt, window) ||
      !inside(publishedAt, window) ||
      fetchStartedAt > checkedAt ||
      publishedAt !== checkedAt ||
      observedAt < checkedAt ||
      !validProofRows(proof.rows, proof.group.scanJobId)
    ) {
      return false;
    }
    return proof.proofSha256 === proofDigest(proofPayload(proof));
  } catch {
    return false;
  }
};

const certifySelectedGroup = (params: {
  readonly rows: readonly GitHubTrendingDurableSnapshotCandidate[];
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly requestedUtcDay: string;
  readonly observedThrough: Date;
}): GitHubTrendingDurableSnapshotProof => {
  if (params.rows.length !== expectedRepositoryCount) {
    throw invalidSnapshot("partial_group");
  }
  const rows = [...params.rows].sort(
    (left, right) =>
      left.rank - right.rank ||
      left.repositoryFullName.localeCompare(right.repositoryFullName, "en-US"),
  );
  const first = rows[0]!;
  const window = requestedDayWindow(params.requestedUtcDay);
  const feedIds = new Set<string>();
  const sourceIds = new Set<string>();
  const repositories = new Set<string>();
  const ranks = new Set<number>();
  for (const [index, row] of rows.entries()) {
    assertCandidate(row, {
      first,
      expectedRank: index + 1,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      sourceBindingId: params.sourceBindingId,
      window,
      observedThrough: params.observedThrough,
    });
    feedIds.add(row.feedItemId);
    sourceIds.add(row.sourceItemId);
    repositories.add(repositoryIdentity(row.repositoryFullName));
    ranks.add(row.rank);
  }
  if (
    [feedIds, sourceIds, repositories, ranks].some(
      (identities) => identities.size !== expectedRepositoryCount,
    )
  ) {
    throw invalidSnapshot("duplicate_identity");
  }
  const payload = {
    proofVersion,
    providerKey,
    requestedUtcDay: params.requestedUtcDay,
    group: {
      sourceBindingId: first.feedSourceBindingId,
      scanJobId: first.scanJobId,
      fetchStartedAt: first.fetchStartedAt,
      checkedAt: first.checkedAt,
      publishedAt: first.publishedAt,
      observedAt: first.feedObservedAt,
      sourceScanStatus: "SUCCEEDED" as const,
    },
    rows: rows.map(proofRow),
  };
  return { ...payload, proofSha256: proofDigest(payload) };
};

const assertCandidate = (
  row: GitHubTrendingDurableSnapshotCandidate,
  expected: {
    readonly first: GitHubTrendingDurableSnapshotCandidate;
    readonly expectedRank: number;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly sourceBindingId: string;
    readonly window: RequestedDayWindow;
    readonly observedThrough: Date;
  },
): void => {
  const fetchStartedAt = exactIsoTime(row.fetchStartedAt);
  const checkedAt = exactIsoTime(row.checkedAt);
  const publishedAt = exactIsoTime(row.publishedAt);
  const observedAt = exactIsoTime(row.feedObservedAt);
  const repository = repositoryIdentity(row.repositoryFullName);
  const valid =
    row.tenantId === expected.tenantId &&
    row.workspaceId === expected.workspaceId &&
    row.sourceTenantId === expected.tenantId &&
    row.sourceWorkspaceId === expected.workspaceId &&
    row.sourceTenantId === row.tenantId &&
    row.sourceWorkspaceId === row.workspaceId &&
    row.feedSourceBindingId === expected.sourceBindingId &&
    row.sourceSourceBindingId === expected.sourceBindingId &&
    row.feedProviderKey === providerKey &&
    row.sourceProviderKey === providerKey &&
    row.feedStatus === "VISIBLE" &&
    nonEmptyBounded(row.feedItemId, maxIdentityBytes) &&
    nonEmptyBounded(row.sourceItemId, maxIdentityBytes) &&
    nonEmptyBounded(row.providerItemId, maxIdentityBytes) &&
    nonEmptyBounded(row.scanJobId, maxIdentityBytes) &&
    nonEmptyBounded(row.feedSourceBindingId, maxIdentityBytes) &&
    row.metadataKind === "github_trending_page_repository" &&
    row.window === "daily" &&
    row.scanJobStatus === "SUCCEEDED" &&
    row.scanJobTenantId === row.tenantId &&
    row.scanJobWorkspaceId === row.workspaceId &&
    row.scanJobSourceBindingId === expected.sourceBindingId &&
    row.feedSnapshotSourceBindingId === expected.sourceBindingId &&
    row.feedSnapshotProviderKey === providerKey &&
    row.rank === expected.expectedRank &&
    Number.isSafeInteger(row.starsGained) &&
    row.starsGained > 0 &&
    Number.isSafeInteger(row.totalStars) &&
    row.totalStars > 0 &&
    validRepository(repository, row.canonicalUrl, row.repositoryUrl) &&
    row.providerItemId ===
      `${providerKey}:daily:${row.scanJobId}:${row.repositoryFullName}` &&
    sameGroupEnvelope(row, expected.first) &&
    row.feedScanJobId === row.scanJobId &&
    row.feedFetchStartedAt === row.fetchStartedAt &&
    row.feedCheckedAt === row.checkedAt &&
    row.sourcePublishedAt === row.publishedAt &&
    row.sourceObservedAt === row.feedObservedAt &&
    fetchStartedAt !== undefined &&
    checkedAt !== undefined &&
    publishedAt !== undefined &&
    observedAt !== undefined &&
    inside(fetchStartedAt, expected.window) &&
    inside(checkedAt, expected.window) &&
    inside(publishedAt, expected.window) &&
    fetchStartedAt <= checkedAt &&
    publishedAt === checkedAt &&
    observedAt >= checkedAt &&
    observedAt <= expected.observedThrough.getTime() &&
    validHash(row.sourceContentHash) &&
    validHash(row.sourceProviderContentHash) &&
    validVisibleText(row.sourceTitle, row.sourceTitleBytes, maxTitleBytes) &&
    validVisibleText(row.feedTitle, row.feedTitleBytes, maxTitleBytes) &&
    row.sourceTitle === row.feedTitle &&
    validVisibleText(
      row.bodyPreview,
      row.bodyPreviewBytes,
      maxBodyPreviewBytes,
    );
  if (!valid) {
    throw invalidSnapshot("selected_group_invalid");
  }
};

const proofRow = (
  row: GitHubTrendingDurableSnapshotCandidate,
): GitHubTrendingDurableSnapshotProofRow => ({
  rank: row.rank,
  feedItemId: row.feedItemId,
  sourceItemId: row.sourceItemId,
  providerItemId: row.providerItemId,
  repositoryIdentity: repositoryIdentity(row.repositoryFullName),
  canonicalUrl: row.canonicalUrl,
  starsGained: row.starsGained,
  totalStars: row.totalStars,
  highlightEligible: row.starsGained > 1_000,
  sourceContentHash: row.sourceContentHash.toLowerCase(),
  sourceProviderContentHash: row.sourceProviderContentHash.toLowerCase(),
  titleSha256: sha256(row.feedTitle),
  bodyPreviewSha256: sha256(row.bodyPreview),
  titleBytes: row.feedTitleBytes,
  bodyPreviewBytes: row.bodyPreviewBytes,
});

const validProofRows = (
  rows: readonly GitHubTrendingDurableSnapshotProofRow[],
  scanJobId: string,
): boolean => {
  const feedIds = new Set<string>();
  const sourceIds = new Set<string>();
  const repositories = new Set<string>();
  return rows.every((row, index) => {
    feedIds.add(row.feedItemId);
    sourceIds.add(row.sourceItemId);
    repositories.add(row.repositoryIdentity);
    return (
      row.rank === index + 1 &&
      nonEmptyBounded(row.feedItemId, maxIdentityBytes) &&
      nonEmptyBounded(row.sourceItemId, maxIdentityBytes) &&
      nonEmptyBounded(row.providerItemId, maxIdentityBytes) &&
      row.providerItemId.toLocaleLowerCase("en-US") ===
        `${providerKey}:daily:${scanJobId}:${row.repositoryIdentity}`.toLocaleLowerCase(
          "en-US",
        ) &&
      validRepository(
        row.repositoryIdentity,
        row.canonicalUrl,
        row.canonicalUrl,
      ) &&
      Number.isSafeInteger(row.starsGained) &&
      row.starsGained > 0 &&
      Number.isSafeInteger(row.totalStars) &&
      row.totalStars > 0 &&
      row.highlightEligible === (row.starsGained > 1_000) &&
      validHash(row.sourceContentHash) &&
      validHash(row.sourceProviderContentHash) &&
      validHash(row.titleSha256) &&
      validHash(row.bodyPreviewSha256) &&
      Number.isSafeInteger(row.titleBytes) &&
      row.titleBytes > 0 &&
      row.titleBytes <= maxTitleBytes &&
      Number.isSafeInteger(row.bodyPreviewBytes) &&
      row.bodyPreviewBytes > 0 &&
      row.bodyPreviewBytes <= maxBodyPreviewBytes
    );
  }) &&
    feedIds.size === expectedRepositoryCount &&
    sourceIds.size === expectedRepositoryCount &&
    repositories.size === expectedRepositoryCount;
};

type RequestedDayWindow = {
  readonly startInclusive: Date;
  readonly endExclusive: Date;
};

const requestedDayWindow = (day: string): RequestedDayWindow => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) {
    throw invalidSnapshot("invalid_requested_day");
  }
  const startInclusive = new Date(`${day}T00:00:00.000Z`);
  const endExclusive = new Date(startInclusive.getTime() + 86_400_000);
  if (
    !Number.isFinite(startInclusive.getTime()) ||
    startInclusive.toISOString().slice(0, 10) !== day
  ) {
    throw invalidSnapshot("invalid_requested_day");
  }
  return { startInclusive, endExclusive };
};

const touchesRequestedDay = (
  row: GitHubTrendingDurableSnapshotCandidate,
  window: RequestedDayWindow,
): boolean => {
  const start = window.startInclusive.toISOString();
  const end = window.endExclusive.toISOString();
  // Keep this six-field predicate in lockstep with prismaCandidateQuery.
  return [
    row.sourcePublishedAt,
    row.fetchStartedAt,
    row.checkedAt,
    row.publishedAt,
    row.feedFetchStartedAt,
    row.feedCheckedAt,
  ].some((value) => value >= start && value < end);
};

const compareNewestCandidate = (
  left: GitHubTrendingDurableSnapshotCandidate,
  right: GitHubTrendingDurableSnapshotCandidate,
): number =>
  exactOrderingTime(right.checkedAt) - exactOrderingTime(left.checkedAt) ||
  exactOrderingTime(right.fetchStartedAt) -
    exactOrderingTime(left.fetchStartedAt) ||
  exactOrderingTime(right.publishedAt) - exactOrderingTime(left.publishedAt) ||
  groupIdentity(right).localeCompare(groupIdentity(left), "en-US") ||
  left.feedItemId.localeCompare(right.feedItemId, "en-US");

const assertExactOrderingIdentities = (
  rows: readonly GitHubTrendingDurableSnapshotCandidate[],
): void => {
  for (const row of rows) {
    if (
      [
        row.fetchStartedAt,
        row.feedFetchStartedAt,
        row.checkedAt,
        row.feedCheckedAt,
        row.publishedAt,
        row.sourcePublishedAt,
        row.feedObservedAt,
        row.sourceObservedAt,
      ].some((value) => exactIsoTime(value) === undefined) ||
      row.fetchStartedAt !== row.feedFetchStartedAt ||
      row.checkedAt !== row.feedCheckedAt ||
      row.publishedAt !== row.sourcePublishedAt
    ) {
      throw invalidSnapshot("invalid_ordering_identity");
    }
  }
};

const rejectAmbiguousNewestEnvelope = (
  rows: readonly GitHubTrendingDurableSnapshotCandidate[],
  selected: GitHubTrendingDurableSnapshotCandidate,
): void => {
  if (
    rows.some(
      (row) =>
        row !== selected &&
        row.fetchStartedAt === selected.fetchStartedAt &&
        row.checkedAt === selected.checkedAt &&
        row.publishedAt === selected.publishedAt &&
        groupIdentity(row) !== groupIdentity(selected),
    )
  ) {
    throw invalidSnapshot("ambiguous_scan_identity");
  }
};

const groupIdentity = (
  row: GitHubTrendingDurableSnapshotCandidate,
): string =>
  [
    row.feedSourceBindingId,
    row.scanJobId,
    row.fetchStartedAt,
    row.checkedAt,
    row.publishedAt,
    row.feedObservedAt,
  ].join("\u0000");

const sameGroupEnvelope = (
  row: GitHubTrendingDurableSnapshotCandidate,
  first: GitHubTrendingDurableSnapshotCandidate,
): boolean =>
  groupIdentity(row) === groupIdentity(first);

const validRepository = (
  identity: string,
  canonicalUrl: string,
  metadataUrl: string,
): boolean =>
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(identity) &&
  canonicalUrl === metadataUrl &&
  canonicalUrl.toLocaleLowerCase("en-US") ===
    `https://github.com/${identity}`.toLocaleLowerCase("en-US");

const repositoryIdentity = (value: string): string =>
  value.trim().toLocaleLowerCase("en-US");

const validVisibleText = (
  value: string,
  declaredBytes: number,
  maxBytes: number,
): boolean =>
  value.trim().length > 0 &&
  !hasDisallowedControlCharacter(value) &&
  Buffer.byteLength(value, "utf8") === declaredBytes &&
  declaredBytes <= maxBytes;

const hasDisallowedControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (
      codePoint <= 8 ||
      codePoint === 11 ||
      codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) ||
      codePoint === 127
    ) {
      return true;
    }
  }
  return false;
};

const nonEmptyBounded = (value: string, maxBytes: number): boolean =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  Buffer.byteLength(value, "utf8") <= maxBytes;

const exactIsoTime = (value: string): number | undefined => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
    ? parsed.getTime()
    : undefined;
};

const exactOrderingTime = (value: string): number => {
  const time = exactIsoTime(value);
  if (time === undefined) {
    throw invalidSnapshot("invalid_ordering_identity");
  }
  return time;
};

const inside = (time: number, window: RequestedDayWindow): boolean =>
  time >= window.startInclusive.getTime() &&
  time < window.endExclusive.getTime();

const validHash = (value: string): boolean => /^[a-f0-9]{64}$/iu.test(value);
const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const proofPayload = (
  proof: GitHubTrendingDurableSnapshotProof,
): Omit<GitHubTrendingDurableSnapshotProof, "proofSha256"> => ({
  proofVersion: proof.proofVersion,
  providerKey: proof.providerKey,
  requestedUtcDay: proof.requestedUtcDay,
  group: proof.group,
  rows: proof.rows,
});

const proofDigest = (value: unknown): string =>
  `sha256:${sha256(canonicalJson(value))}`;

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

const invalidSnapshot = (code: string): Error =>
  new Error(`GitHub durable snapshot reuse rejected: ${code}`);

type PrismaCandidateRow = Omit<
  GitHubTrendingDurableSnapshotCandidate,
  | "rank"
  | "starsGained"
  | "totalStars"
  | "sourceTitleBytes"
  | "feedTitleBytes"
  | "bodyPreviewBytes"
  | "publishedAt"
  | "sourcePublishedAt"
  | "feedObservedAt"
  | "sourceObservedAt"
> & {
  readonly rank: string | number;
  readonly starsGained: string | number;
  readonly totalStars: string | number;
  readonly sourceTitleBytes: string | number;
  readonly feedTitleBytes: string | number;
  readonly bodyPreviewBytes: string | number;
  readonly publishedAt: Date;
  readonly sourcePublishedAt: Date;
  readonly feedObservedAt: Date;
  readonly sourceObservedAt: Date;
};

const candidateFromPrisma = (
  row: PrismaCandidateRow,
): GitHubTrendingDurableSnapshotCandidate => ({
  ...row,
  rank: Number(row.rank),
  starsGained: Number(row.starsGained),
  totalStars: Number(row.totalStars),
  sourceTitleBytes: Number(row.sourceTitleBytes),
  feedTitleBytes: Number(row.feedTitleBytes),
  bodyPreviewBytes: Number(row.bodyPreviewBytes),
  publishedAt: row.publishedAt.toISOString(),
  sourcePublishedAt: row.sourcePublishedAt.toISOString(),
  feedObservedAt: row.feedObservedAt.toISOString(),
  sourceObservedAt: row.sourceObservedAt.toISOString(),
});

const prismaCandidateQuery = `
  select
    fi.tenant_id::text as "tenantId",
    fi.workspace_id::text as "workspaceId",
    si.tenant_id::text as "sourceTenantId",
    si.workspace_id::text as "sourceWorkspaceId",
    fi.id::text as "feedItemId",
    si.id::text as "sourceItemId",
    fi.source_binding_id::text as "feedSourceBindingId",
    si.source_binding_id::text as "sourceSourceBindingId",
    fi.provider_key as "feedProviderKey",
    si.provider_key as "sourceProviderKey",
    fi.status::text as "feedStatus",
    left(si.provider_item_id, 256) as "providerItemId",
    left(fi.canonical_url, 256) as "canonicalUrl",
    left(si.metadata->>'kind', 128) as "metadataKind",
    left(si.metadata->'repository'->>'fullName', 256) as "repositoryFullName",
    left(si.metadata->'repository'->>'url', 256) as "repositoryUrl",
    left(si.metadata->'trending'->>'rank', 32) as "rank",
    left(si.metadata->'trending'->>'starsGained', 32) as "starsGained",
    left(si.metadata->'repository'->>'totalStars', 32) as "totalStars",
    left(si.metadata->'trending'->>'window', 32) as "window",
    left(si.metadata->'trending'->>'scanJobId', 256) as "scanJobId",
    left(fi.provider_metadata->'trending'->>'scanJobId', 256) as "feedScanJobId",
    left(si.metadata->'trending'->>'fetchStartedAt', 64) as "fetchStartedAt",
    left(fi.provider_metadata->'trending'->>'fetchStartedAt', 64) as "feedFetchStartedAt",
    left(si.metadata->'trending'->>'checkedAt', 64) as "checkedAt",
    left(fi.provider_metadata->'trending'->>'checkedAt', 64) as "feedCheckedAt",
    fi.published_at as "publishedAt",
    si.published_at as "sourcePublishedAt",
    fi.observed_at as "feedObservedAt",
    si.observed_at as "sourceObservedAt",
    coalesce(sj.status::text, '') as "scanJobStatus",
    coalesce(sj.tenant_id::text, '') as "scanJobTenantId",
    coalesce(sj.workspace_id::text, '') as "scanJobWorkspaceId",
    coalesce(sj.source_binding_id::text, '') as "scanJobSourceBindingId",
    left(si.content_hash, 128) as "sourceContentHash",
    left(coalesce(si.provider_content_hash, ''), 128) as "sourceProviderContentHash",
    left(si.title, 513) as "sourceTitle",
    left(fi.title, 513) as "feedTitle",
    left(fi.body_preview, 4097) as "bodyPreview",
    octet_length(si.title)::text as "sourceTitleBytes",
    octet_length(fi.title)::text as "feedTitleBytes",
    octet_length(fi.body_preview)::text as "bodyPreviewBytes",
    left(fi.provider_metadata->'sourceBindingSnapshot'->>'sourceBindingId', 256) as "feedSnapshotSourceBindingId",
    left(fi.provider_metadata->'sourceBindingSnapshot'->>'providerKey', 64) as "feedSnapshotProviderKey"
  from feed_items fi
  join source_items si
    on si.id = fi.source_item_id
   and si.tenant_id = fi.tenant_id
   and si.workspace_id = fi.workspace_id
  left join scan_jobs sj
    on sj.id::text = si.metadata->'trending'->>'scanJobId'
  where fi.tenant_id = $1::uuid
    and fi.workspace_id = $2::uuid
    and si.tenant_id = $1::uuid
    and si.workspace_id = $2::uuid
    and (
      fi.source_binding_id = $3::uuid
      or si.source_binding_id = $3::uuid
    )
    and (
      -- Keep these six arms in lockstep with touchesRequestedDay.
      (si.published_at >= $4::timestamptz and si.published_at < $5::timestamptz)
      or (
        si.metadata->'trending'->>'fetchStartedAt' >= $4::text
        and si.metadata->'trending'->>'fetchStartedAt' < $5::text
      )
      or (
        si.metadata->'trending'->>'checkedAt' >= $4::text
        and si.metadata->'trending'->>'checkedAt' < $5::text
      )
      or (fi.published_at >= $4::timestamptz and fi.published_at < $5::timestamptz)
      or (
        fi.provider_metadata->'trending'->>'fetchStartedAt' >= $4::text
        and fi.provider_metadata->'trending'->>'fetchStartedAt' < $5::text
      )
      or (
        fi.provider_metadata->'trending'->>'checkedAt' >= $4::text
        and fi.provider_metadata->'trending'->>'checkedAt' < $5::text
      )
    )
  order by fi.id asc
  limit $6
`;
