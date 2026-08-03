import { createHash } from "node:crypto";

import type { ReaderSummaryDailySourceAuthority } from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";

export type ReaderSummaryDailySourceItem = Readonly<{
  feedItemId: string;
  sourceItemId: string;
  providerKey: string;
  canonicalUrl: string;
  title: string;
  bodyPreview: string;
  authorHandle: string | null;
  publishedAt: string;
  observedAt: string;
  contentHash: string;
}>;

export type ReaderSummaryDailySourceItemV2 = ReaderSummaryDailySourceItem & Readonly<{
  sourceBindingId: string;
  interestId: string;
  providerContentHash: string | null;
}>;

/**
 * These are the only dates whose sealed legacy authority may omit GitHub.
 * The reason is deliberately a single canonical value so the byte-sealed
 * authority, release migration, and prepublication gate cannot drift.
 */
export const readerSummaryDailyCanonicalHistoricalGithubOmissionDates =
  Object.freeze(["2026-07-23", "2026-07-28", "2026-07-30"] as const);

export const readerSummaryDailyCanonicalHistoricalGithubOmissionReason =
  "Reviewed immutable recovery authority contains no eligible GitHub trending projection for this UTC day.";

export const readerSummaryDailyCanonicalFrozenGithubProjectionDates =
  Object.freeze([
    "2026-07-24",
    "2026-07-25",
    "2026-07-26",
    "2026-07-27",
    "2026-07-29",
  ] as const);

export type ReaderSummaryDailyFrozenGitHubProjectionItem = Readonly<{
  feedItemId: string;
  sourceItemId: string;
  sourceBindingId: string;
  providerKey: "github-trending-page";
  canonicalUrl: string;
  publishedAt: string;
  observedAt: string;
  sourceContentHash: string;
  sourceProviderContentHash: string | null;
  scanJobId: string;
  repositoryFullName: string;
  rank: number;
  checkedAtCollectionAnchor: string;
}>;

export type ReaderSummaryDailyGitHubProjection =
  | Readonly<{
      mode: "checked_at_collection_anchor";
      unavailableField: "fetchStartedAt";
      anchorField: "checkedAtCollectionAnchor";
      allowedRequestedUtcDates:
        typeof readerSummaryDailyCanonicalFrozenGithubProjectionDates;
      eligibleBindingIds: readonly string[];
      items: readonly ReaderSummaryDailyFrozenGitHubProjectionItem[];
      pageCount: number;
    }>
  | Readonly<{
      mode: "historical_omission";
      reason: string;
      authorizedAt: string;
    }>;

export type VerifiedReaderSummaryDailySourceAuthorityV1 = Readonly<{
  schemaVersion: 1;
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: string;
  ingestionCutoff: string;
  items: readonly ReaderSummaryDailySourceItem[];
  canonicalBytes: Buffer;
  canonicalSha256: string;
}>;

export type VerifiedReaderSummaryDailySourceAuthorityV2 = Readonly<{
  schemaVersion: 2;
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: string;
  ingestionCutoff: string;
  items: readonly ReaderSummaryDailySourceItemV2[];
  githubProjection: ReaderSummaryDailyGitHubProjection;
  canonicalBytes: Buffer;
  canonicalSha256: string;
}>;

export type VerifiedReaderSummaryDailySourceAuthority =
  | VerifiedReaderSummaryDailySourceAuthorityV1
  | VerifiedReaderSummaryDailySourceAuthorityV2;

export const isReaderSummaryDailySourceAuthorityV2 = (
  authority: VerifiedReaderSummaryDailySourceAuthority,
): authority is VerifiedReaderSummaryDailySourceAuthorityV2 =>
  authority.schemaVersion === 2;

export const verifyReaderSummaryDailySourceAuthority = (input: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly requestedUtcDate: string;
  readonly authority: ReaderSummaryDailySourceAuthority;
}): VerifiedReaderSummaryDailySourceAuthority => {
  const bytes = Buffer.from(input.authority.canonicalBytes);
  if (
    bytes.length === 0 ||
    !sha256Pattern.test(input.authority.canonicalSha256) ||
    sha256(bytes) !== input.authority.canonicalSha256
  ) {
    throw new Error("Daily source authority canonical bytes or SHA-256 diverged");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Daily source authority canonical bytes are not JSON");
  }
  const value = record(decoded, "source authority");
  if (value.schemaVersion === 1) return verifyV1(input, bytes, value);
  if (value.schemaVersion === 2) return verifyV2(input, bytes, value);
  throw new Error("Daily source authority schema version is unsupported");
};

const verifyV1 = (
  input: Parameters<typeof verifyReaderSummaryDailySourceAuthority>[0],
  bytes: Buffer,
  value: Record<string, unknown>,
): VerifiedReaderSummaryDailySourceAuthorityV1 => {
  assertExactKeys(value, [
    "schemaVersion", "tenantId", "workspaceId", "requestedUtcDate",
    "ingestionCutoff", "items",
  ], "source authority", 1);
  assertScope(input, value);
  if (!Array.isArray(value.items)) {
    throw new Error("Daily source authority items are invalid");
  }
  const items = value.items.map((item, index) => sourceItemV1(item, index));
  assertOrderedAndCutOff(items, input.requestedUtcDate, input.authority.ingestionCutoff);
  return Object.freeze({
    schemaVersion: 1,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    requestedUtcDate: input.requestedUtcDate,
    ingestionCutoff: input.authority.ingestionCutoff,
    items: Object.freeze(items),
    canonicalBytes: bytes,
    canonicalSha256: input.authority.canonicalSha256,
  });
};

const verifyV2 = (
  input: Parameters<typeof verifyReaderSummaryDailySourceAuthority>[0],
  bytes: Buffer,
  value: Record<string, unknown>,
): VerifiedReaderSummaryDailySourceAuthorityV2 => {
  assertExactKeys(value, [
    "schemaVersion", "tenantId", "workspaceId", "requestedUtcDate",
    "ingestionCutoff", "items", "githubProjection",
  ], "source authority", 2);
  if (!canonicalJsonBytes(value).equals(bytes)) {
    throw new Error("Daily source authority v2 bytes are not canonical JSON");
  }
  assertScope(input, value);
  assertV2Cutoff(input.requestedUtcDate, input.authority.ingestionCutoff);
  if (!Array.isArray(value.items)) {
    throw new Error("Daily source authority v2 items are invalid");
  }
  const items = value.items.map((item, index) => sourceItemV2(item, index));
  assertOrderedAndCutOff(items, input.requestedUtcDate, input.authority.ingestionCutoff);
  const githubProjection = verifyGitHubProjection({
    value: value.githubProjection,
    items,
    requestedUtcDate: input.requestedUtcDate,
    ingestionCutoff: input.authority.ingestionCutoff,
  });
  return Object.freeze({
    schemaVersion: 2,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    requestedUtcDate: input.requestedUtcDate,
    ingestionCutoff: input.authority.ingestionCutoff,
    items: Object.freeze(items),
    githubProjection,
    canonicalBytes: bytes,
    canonicalSha256: input.authority.canonicalSha256,
  });
};

const assertScope = (
  input: Parameters<typeof verifyReaderSummaryDailySourceAuthority>[0],
  value: Record<string, unknown>,
): void => {
  if (
    value.tenantId !== input.tenantId ||
    value.workspaceId !== input.workspaceId ||
    value.requestedUtcDate !== input.requestedUtcDate ||
    value.requestedUtcDate !== input.authority.requestedUtcDate ||
    value.ingestionCutoff !== input.authority.ingestionCutoff ||
    !exactIso(value.ingestionCutoff)
  ) {
    throw new Error("Daily source authority scope, date, or cutoff diverged");
  }
};

const assertV2Cutoff = (
  requestedUtcDate: string,
  ingestionCutoff: string,
): void => {
  if (
    Date.parse(ingestionCutoff) <
      Date.parse(`${requestedUtcDate}T00:00:00.000Z`) + 86_400_000
  ) {
    throw new Error("Daily source authority v2 cutoff predates the UTC day boundary");
  }
};

const sourceItemV1 = (
  input: unknown,
  index: number,
): ReaderSummaryDailySourceItem => {
  const value = record(input, `item ${index}`);
  assertExactKeys(value, [
    "feedItemId", "sourceItemId", "providerKey", "canonicalUrl", "title",
    "bodyPreview", "authorHandle", "publishedAt", "observedAt", "contentHash",
  ], `item ${index}`, 1);
  return commonSourceItem(value, index, false);
};

const sourceItemV2 = (
  input: unknown,
  index: number,
): ReaderSummaryDailySourceItemV2 => {
  const value = record(input, `item ${index}`);
  assertExactKeys(value, [
    "feedItemId", "sourceItemId", "sourceBindingId", "interestId", "providerKey",
    "canonicalUrl", "title", "bodyPreview", "authorHandle", "publishedAt",
    "observedAt", "contentHash", "providerContentHash",
  ], `item ${index}`, 2);
  if (value.providerContentHash !== null && !sha256Pattern.test(String(value.providerContentHash))) {
    throw new Error(`Daily source authority item ${index} has invalid providerContentHash`);
  }
  return Object.freeze({
    ...commonSourceItem(value, index, true),
    sourceBindingId: uuid(value.sourceBindingId, index, "sourceBindingId"),
    interestId: uuid(value.interestId, index, "interestId"),
    providerContentHash: value.providerContentHash as string | null,
  });
};

const commonSourceItem = (
  value: Record<string, unknown>,
  index: number,
  strictContentHash: boolean,
): ReaderSummaryDailySourceItem => {
  if (value.authorHandle !== null && typeof value.authorHandle !== "string") {
    throw new Error(`Daily source authority item ${index} has invalid authorHandle`);
  }
  if (!exactIso(value.publishedAt) || !exactIso(value.observedAt)) {
    throw new Error(`Daily source authority item ${index} has invalid timestamps`);
  }
  return Object.freeze({
    feedItemId: uuid(value.feedItemId, index, "feedItemId"),
    sourceItemId: uuid(value.sourceItemId, index, "sourceItemId"),
    providerKey: text(value.providerKey, index, "providerKey"),
    canonicalUrl: text(value.canonicalUrl, index, "canonicalUrl"),
    title: text(value.title, index, "title"),
    bodyPreview: text(value.bodyPreview, index, "bodyPreview"),
    authorHandle: value.authorHandle as string | null,
    publishedAt: value.publishedAt,
    observedAt: value.observedAt,
    contentHash: strictContentHash
      ? sha(value.contentHash, index, "contentHash")
      : text(value.contentHash, index, "contentHash"),
  });
};

const verifyGitHubProjection = (input: {
  readonly value: unknown;
  readonly items: readonly ReaderSummaryDailySourceItemV2[];
  readonly requestedUtcDate: string;
  readonly ingestionCutoff: string;
}): ReaderSummaryDailyGitHubProjection => {
  const value = record(input.value, "GitHub projection");
  if (value.mode === "historical_omission") {
    assertExactKeys(value, ["mode", "reason", "authorizedAt"], "GitHub omission", 2);
    const authorizedAt = exactIsoText(value.authorizedAt, "GitHub omission authorization");
    if (
      !isHistoricalGithubOmissionDate(input.requestedUtcDate) ||
      value.reason !== readerSummaryDailyCanonicalHistoricalGithubOmissionReason ||
      authorizedAt !== input.ingestionCutoff ||
      input.items.some((item) => item.providerKey === "github-trending-page")
    ) {
      throw new Error("Daily source authority GitHub omission is invalid");
    }
    return Object.freeze({
      mode: "historical_omission",
      reason: readerSummaryDailyCanonicalHistoricalGithubOmissionReason,
      authorizedAt,
    });
  }
  if (value.mode !== "checked_at_collection_anchor") {
    throw new Error("Daily source authority GitHub projection mode is invalid");
  }
  if (isHistoricalGithubOmissionDate(input.requestedUtcDate)) {
    throw new Error("Daily source authority GitHub omission is required for this UTC day");
  }
  if (!isFrozenGithubProjectionDate(input.requestedUtcDate)) {
    throw new Error("Daily source authority frozen GitHub projection is outside the reviewed recovery dates");
  }
  assertExactKeys(value, [
    "mode", "unavailableField", "anchorField", "allowedRequestedUtcDates",
    "eligibleBindingIds", "items", "pageCount",
  ], "GitHub projection", 2);
  const pageCount = value.pageCount;
  if (
    value.unavailableField !== "fetchStartedAt" ||
    value.anchorField !== "checkedAtCollectionAnchor" ||
    !Array.isArray(value.allowedRequestedUtcDates) ||
    !sameOrderedValues(
      value.allowedRequestedUtcDates.filter(
        (entry): entry is string => typeof entry === "string",
      ),
      readerSummaryDailyCanonicalFrozenGithubProjectionDates,
    ) ||
    value.allowedRequestedUtcDates.some((entry) => typeof entry !== "string") ||
    !Array.isArray(value.eligibleBindingIds) || !Array.isArray(value.items) ||
      !isPositiveSafeInteger(pageCount)) {
    throw new Error("Daily source authority GitHub projection is invalid");
  }
  const eligibleBindingIds = value.eligibleBindingIds.map((entry, index) =>
    uuid(entry, index, "eligibleBindingId"));
  assertSortedUnique(eligibleBindingIds, "GitHub eligible binding ids");
  const items = value.items.map((entry, index) =>
    frozenGitHubProjectionItem(entry, index));
  const byFeedItemId = new Map(input.items.map((item) => [item.feedItemId, item]));
  const sourceGitHubItems = input.items.filter(
    (item) => item.providerKey === "github-trending-page",
  );
  const expectedBindingIds = [...new Set(
    sourceGitHubItems.map((item) => item.sourceBindingId),
  )].sort();
  if (!sameOrderedValues(eligibleBindingIds, expectedBindingIds)) {
    throw new Error("Daily source authority frozen GitHub eligible bindings diverged");
  }
  const expectedItems = [...sourceGitHubItems].sort(compareGitHubProjectionSourceItems);
  if (items.length !== expectedItems.length) {
    throw new Error("Daily source authority frozen GitHub projection is incomplete");
  }
  if (items.length !== 10) {
    throw new Error("Daily source authority frozen GitHub projection must contain ten repositories");
  }
  const projectedFeedItemIds = new Set<string>();
  const projectedSourceItemIds = new Set<string>();
  for (const [index, item] of items.entries()) {
    const source = expectedItems[index];
    if (
      source === undefined ||
      projectedFeedItemIds.has(item.feedItemId) ||
      projectedSourceItemIds.has(item.sourceItemId) ||
      byFeedItemId.get(item.feedItemId) !== source ||
      !eligibleBindingIds.includes(item.sourceBindingId) ||
      !sameFrozenGitHubProjectionItem(item, source, input)
    ) {
      throw new Error("Daily source authority frozen GitHub projection diverged");
    }
    projectedFeedItemIds.add(item.feedItemId);
    projectedSourceItemIds.add(item.sourceItemId);
  }
  const expectedPageCount = frozenProjectionPageCount(
    eligibleBindingIds.length,
    expectedItems.length,
  );
  if (pageCount !== expectedPageCount) {
    throw new Error("Daily source authority frozen GitHub projection page count diverged");
  }
  return Object.freeze({
    mode: "checked_at_collection_anchor",
    unavailableField: "fetchStartedAt",
    anchorField: "checkedAtCollectionAnchor",
    allowedRequestedUtcDates:
      readerSummaryDailyCanonicalFrozenGithubProjectionDates,
    eligibleBindingIds: Object.freeze(eligibleBindingIds),
    items: Object.freeze(items),
    pageCount,
  });
};

const frozenGitHubProjectionItem = (
  input: unknown,
  index: number,
): ReaderSummaryDailyFrozenGitHubProjectionItem => {
  const value = record(input, `GitHub projection item ${index}`);
  assertExactKeys(value, [
    "feedItemId", "sourceItemId", "sourceBindingId", "providerKey", "canonicalUrl",
    "publishedAt", "observedAt", "sourceContentHash", "sourceProviderContentHash",
    "scanJobId", "repositoryFullName", "rank", "checkedAtCollectionAnchor",
  ], `GitHub projection item ${index}`, 2);
  const rank = value.rank;
  if (
    value.providerKey !== "github-trending-page" ||
    !isPositiveSafeInteger(rank)
  ) {
    throw new Error(`Daily source authority GitHub projection item ${index} is invalid`);
  }
  const publishedAt = exactIsoText(
    value.publishedAt,
    `GitHub projection item ${index} publishedAt`,
  );
  const checkedAtCollectionAnchor = exactIsoText(
    value.checkedAtCollectionAnchor,
    `GitHub projection item ${index} checkedAtCollectionAnchor`,
  );
  if (
    value.sourceProviderContentHash !== null &&
    !sha256Pattern.test(String(value.sourceProviderContentHash))
  ) {
    throw new Error(`Daily source authority GitHub projection item ${index} has invalid sourceProviderContentHash`);
  }
  return Object.freeze({
    feedItemId: uuid(value.feedItemId, index, "feedItemId"),
    sourceItemId: uuid(value.sourceItemId, index, "sourceItemId"),
    sourceBindingId: uuid(value.sourceBindingId, index, "sourceBindingId"),
    providerKey: "github-trending-page",
    canonicalUrl: text(value.canonicalUrl, index, "canonicalUrl"),
    publishedAt,
    observedAt: exactIsoText(value.observedAt, `GitHub projection item ${index} observedAt`),
    sourceContentHash: sha(value.sourceContentHash, index, "sourceContentHash"),
    sourceProviderContentHash: value.sourceProviderContentHash as string | null,
    scanJobId: uuid(value.scanJobId, index, "scanJobId"),
    repositoryFullName: text(value.repositoryFullName, index, "repositoryFullName"),
    rank,
    checkedAtCollectionAnchor,
  });
};

const sameFrozenGitHubProjectionItem = (
  item: ReaderSummaryDailyFrozenGitHubProjectionItem,
  source: ReaderSummaryDailySourceItemV2,
  input: Parameters<typeof verifyGitHubProjection>[0],
): boolean =>
  source.sourceItemId === item.sourceItemId &&
  source.sourceBindingId === item.sourceBindingId &&
  source.providerKey === item.providerKey &&
  source.canonicalUrl === item.canonicalUrl &&
  source.contentHash === item.sourceContentHash &&
  source.providerContentHash === item.sourceProviderContentHash &&
  source.publishedAt === item.publishedAt &&
  source.observedAt === item.observedAt &&
  source.publishedAt <= item.checkedAtCollectionAnchor &&
  item.checkedAtCollectionAnchor <= source.observedAt &&
  item.checkedAtCollectionAnchor <= input.ingestionCutoff &&
  isWithinUtcDate(item.publishedAt, input.requestedUtcDate) &&
  isWithinUtcDate(item.checkedAtCollectionAnchor, input.requestedUtcDate);

const compareGitHubProjectionSourceItems = (
  left: ReaderSummaryDailySourceItemV2,
  right: ReaderSummaryDailySourceItemV2,
): number => githubProjectionOrderKey(left).localeCompare(githubProjectionOrderKey(right));

const githubProjectionOrderKey = (item: Pick<
  ReaderSummaryDailySourceItemV2,
  "sourceBindingId" | "observedAt" | "feedItemId"
>): string => `${item.sourceBindingId}\u0000${item.observedAt}\u0000${item.feedItemId}`;

const frozenProjectionPageCount = (
  eligibleBindingCount: number,
  itemCount: number,
): number => pageReads(eligibleBindingCount) +
  (eligibleBindingCount === 0 ? 0 : pageReads(itemCount));

const pageReads = (count: number): number =>
  Math.floor(count / frozenGitHubProjectionPageSize) + 1;

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && value >= 1;

const sameOrderedValues = (
  left: readonly string[],
  right: readonly string[],
): boolean => left.length === right.length &&
  left.every((value, index) => value === right[index]);

const isHistoricalGithubOmissionDate = (requestedUtcDate: string): boolean =>
  (readerSummaryDailyCanonicalHistoricalGithubOmissionDates as readonly string[])
    .includes(requestedUtcDate);

const isFrozenGithubProjectionDate = (requestedUtcDate: string): boolean =>
  (readerSummaryDailyCanonicalFrozenGithubProjectionDates as readonly string[])
    .includes(requestedUtcDate);

const assertOrderedAndCutOff = (
  items: readonly ReaderSummaryDailySourceItem[],
  requestedUtcDate: string,
  cutoff: string,
): void => {
  const dayStart = Date.parse(`${requestedUtcDate}T00:00:00.000Z`);
  const dayEnd = dayStart + 86_400_000;
  let previous = "";
  const feedItemIds = new Set<string>();
  const sourceItemIds = new Set<string>();
  for (const item of items) {
    const published = Date.parse(item.publishedAt);
    if (published < dayStart || published >= dayEnd || item.observedAt > cutoff) {
      throw new Error("Daily source authority contains an out-of-window item");
    }
    const orderKey = `${item.providerKey}\u0000${item.publishedAt}\u0000${item.feedItemId}`;
    if (orderKey < previous || feedItemIds.has(item.feedItemId) || sourceItemIds.has(item.sourceItemId)) {
      throw new Error("Daily source authority items are unordered or duplicated");
    }
    previous = orderKey;
    feedItemIds.add(item.feedItemId);
    sourceItemIds.add(item.sourceItemId);
  }
};

const assertSortedUnique = (values: readonly string[], label: string): void => {
  if (values.some((value, index) => index > 0 && values[index - 1]! >= value)) {
    throw new Error(`Daily source authority ${label} are not sorted and unique`);
  }
};

const isWithinUtcDate = (value: string, date: string): boolean =>
  value.startsWith(`${date}T`);

const frozenGitHubProjectionPageSize = 1_000;
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const sha256Pattern = /^[0-9a-f]{64}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const exactIso = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};
const exactIsoText = (value: unknown, label: string): string => {
  if (!exactIso(value)) throw new Error(`Daily source authority ${label} is invalid`);
  return value;
};
const text = (value: unknown, index: number, field: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Daily source authority item ${index} has invalid ${field}`);
  }
  return value;
};
const uuid = (value: unknown, index: number, field: string): string => {
  const result = text(value, index, field);
  if (!uuidPattern.test(result)) {
    throw new Error(`Daily source authority item ${index} has invalid ${field}`);
  }
  return result;
};
const sha = (value: unknown, index: number, field: string): string => {
  const result = text(value, index, field);
  if (!sha256Pattern.test(result)) {
    throw new Error(`Daily source authority item ${index} has invalid ${field}`);
  }
  return result;
};
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Daily ${label} is not an object`);
  }
  return value as Record<string, unknown>;
};
const assertExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
  version: 1 | 2,
): void => {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length ||
      actual.some((key, index) => key !== canonical[index])) {
    throw new Error(`Daily ${label} contains fields outside authority v${version}`);
  }
};
const canonicalJsonBytes = (value: unknown): Buffer =>
  Buffer.from(canonicalJson(value), "utf8");
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("Daily source authority value is not canonical JSON");
};
