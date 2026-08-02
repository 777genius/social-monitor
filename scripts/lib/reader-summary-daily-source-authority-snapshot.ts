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

export type VerifiedReaderSummaryDailySourceAuthority = Readonly<{
  schemaVersion: 1;
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: string;
  ingestionCutoff: string;
  items: readonly ReaderSummaryDailySourceItem[];
  canonicalBytes: Buffer;
  canonicalSha256: string;
}>;

export const verifyReaderSummaryDailySourceAuthority = (input: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly requestedUtcDate: string;
  readonly authority: ReaderSummaryDailySourceAuthority;
}): VerifiedReaderSummaryDailySourceAuthority => {
  const bytes = Buffer.from(input.authority.canonicalBytes);
  if (bytes.length === 0 || sha256(bytes) !== input.authority.canonicalSha256) {
    throw new Error("Daily source authority canonical bytes or SHA-256 diverged");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Daily source authority canonical bytes are not JSON");
  }
  const value = record(decoded, "source authority");
  assertExactKeys(value, [
    "schemaVersion", "tenantId", "workspaceId", "requestedUtcDate",
    "ingestionCutoff", "items",
  ], "source authority");
  if (
    value.schemaVersion !== 1 ||
    value.tenantId !== input.tenantId ||
    value.workspaceId !== input.workspaceId ||
    value.requestedUtcDate !== input.requestedUtcDate ||
    value.requestedUtcDate !== input.authority.requestedUtcDate ||
    value.ingestionCutoff !== input.authority.ingestionCutoff ||
    !exactIso(value.ingestionCutoff)
  ) {
    throw new Error("Daily source authority scope, date, or cutoff diverged");
  }
  if (!Array.isArray(value.items)) {
    throw new Error("Daily source authority items are invalid");
  }
  const items = value.items.map((item, index) => sourceItem(item, index));
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

const sourceItem = (input: unknown, index: number): ReaderSummaryDailySourceItem => {
  const value = record(input, `item ${index}`);
  assertExactKeys(value, [
    "feedItemId", "sourceItemId", "providerKey", "canonicalUrl", "title",
    "bodyPreview", "authorHandle", "publishedAt", "observedAt", "contentHash",
  ], `item ${index}`);
  if (value.authorHandle !== null && typeof value.authorHandle !== "string") {
    throw new Error(`Daily source authority item ${index} has invalid authorHandle`);
  }
  if (!exactIso(value.publishedAt) || !exactIso(value.observedAt)) {
    throw new Error(`Daily source authority item ${index} has invalid timestamps`);
  }
  return {
    feedItemId: text(value.feedItemId, index, "feedItemId"),
    sourceItemId: text(value.sourceItemId, index, "sourceItemId"),
    providerKey: text(value.providerKey, index, "providerKey"),
    canonicalUrl: text(value.canonicalUrl, index, "canonicalUrl"),
    title: text(value.title, index, "title"),
    bodyPreview: text(value.bodyPreview, index, "bodyPreview"),
    authorHandle: value.authorHandle,
    publishedAt: value.publishedAt,
    observedAt: value.observedAt,
    contentHash: text(value.contentHash, index, "contentHash"),
  };
};

const assertOrderedAndCutOff = (
  items: readonly ReaderSummaryDailySourceItem[],
  requestedUtcDate: string,
  cutoff: string,
): void => {
  const dayStart = Date.parse(`${requestedUtcDate}T00:00:00.000Z`);
  const dayEnd = dayStart + 86_400_000;
  let previous = "";
  const ids = new Set<string>();
  for (const item of items) {
    const published = Date.parse(item.publishedAt);
    if (published < dayStart || published >= dayEnd || item.observedAt > cutoff) {
      throw new Error("Daily source authority contains an out-of-window item");
    }
    const orderKey = `${item.providerKey}\u0000${item.publishedAt}\u0000${item.feedItemId}`;
    if (orderKey < previous || ids.has(item.feedItemId)) {
      throw new Error("Daily source authority items are unordered or duplicated");
    }
    previous = orderKey;
    ids.add(item.feedItemId);
  }
};

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const exactIso = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};
const text = (value: unknown, index: number, field: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Daily source authority item ${index} has invalid ${field}`);
  }
  return value;
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
): void => {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length ||
      actual.some((key, index) => key !== canonical[index])) {
    throw new Error(`Daily ${label} contains fields outside authority v1`);
  }
};
