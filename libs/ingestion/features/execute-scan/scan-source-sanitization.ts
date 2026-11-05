import {
  isSensitiveKey,
  type JsonObject,
  redactSensitiveText,
  REDACTED_VALUE,
  sanitizeUrlCredentials,
  urlContainsCredentials,
} from "@social-monitor/shared-kernel";

import type { FetchedConversationUnit, FetchedSourceItem } from "../../ports";
import {
  articleFetchUrl,
  articleRequestUrl,
  markLiveArticleCredentialsRequired,
} from '../../domain/value-objects/source-content-capture';

export const sanitizeAndPrepareLiveArticleFetchUrls = (
  providerKey: string,
  items: readonly FetchedSourceItem[],
): {
  readonly sanitizedFetchedItems: readonly FetchedSourceItem[];
  readonly liveArticleFetchUrls: ReadonlyMap<string, string>;
} => {
  const liveArticleFetchUrls = new Map<string, string>();
  const ambiguousExternalIds = new Set<string>();
  const sanitizedFetchedItems = items.map((item) => {
    let sanitized = sanitizeFetchedSourceItem(item);
    const fetchUrl = articleFetchUrl(providerKey, item);
    const durableUrl = articleRequestUrl(providerKey, item);
    if (fetchUrl !== undefined && durableUrl !== undefined && urlContainsCredentials(fetchUrl)) {
      sanitized = markLiveArticleCredentialsRequired(sanitized);
    }
    if (fetchUrl !== undefined && !ambiguousExternalIds.has(sanitized.externalId)) {
      const previous = liveArticleFetchUrls.get(sanitized.externalId);
      if (previous === undefined || previous === fetchUrl) {
        liveArticleFetchUrls.set(sanitized.externalId, fetchUrl);
      } else {
        liveArticleFetchUrls.delete(sanitized.externalId);
        ambiguousExternalIds.add(sanitized.externalId);
      }
    }
    return sanitized;
  });
  return { sanitizedFetchedItems, liveArticleFetchUrls };
};

export const sanitizeFetchedSourceItem = (
  item: FetchedSourceItem,
): FetchedSourceItem => ({
  ...item,
  externalId: redactSensitiveText(item.externalId),
  canonicalUrl: sanitizeFetchedSourceUrl(item.canonicalUrl),
  title: redactSensitiveText(item.title),
  body: redactSensitiveText(item.body),
  authorHandle:
    item.authorHandle === undefined
      ? undefined
      : redactSensitiveText(item.authorHandle),
  metadata:
    item.metadata === undefined
      ? undefined
      : sanitizeFetchedSourceMetadata(item.metadata),
});

export const sanitizeFetchedConversationUnit = (
  unit: FetchedConversationUnit,
): FetchedConversationUnit => ({
  ...unit,
  rootExternalId: redactSensitiveText(unit.rootExternalId),
  rootProviderItemId: redactSensitiveText(unit.rootProviderItemId),
  providerUnitId: redactSensitiveText(unit.providerUnitId),
  canonicalUrl: sanitizeFetchedSourceUrl(unit.canonicalUrl),
  body: redactSensitiveText(unit.body),
  authorHandle:
    unit.authorHandle === undefined
      ? undefined
      : redactSensitiveText(unit.authorHandle),
  threadExternalId: redactSensitiveText(unit.threadExternalId),
  parentProviderUnitId:
    unit.parentProviderUnitId === undefined
      ? undefined
      : redactSensitiveText(unit.parentProviderUnitId),
  metadata:
    unit.metadata === undefined
      ? undefined
      : sanitizeFetchedSourceMetadata(unit.metadata),
});

export const sanitizeSourceWarnings = (
  warnings: readonly string[] | undefined,
): readonly string[] => [
  ...new Set(
    (warnings ?? [])
      .map((warning) => redactSensitiveText(warning).trim())
      .filter((warning) => warning.length > 0),
  ),
];

export const sanitizeFetchedSourceMetadata = (metadata: JsonObject): JsonObject =>
  Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      sanitizeFetchedSourceMetadataValue(key, value),
    ]),
  ) as JsonObject;

const sanitizeFetchedSourceMetadataValue = (
  key: string,
  value: unknown,
): unknown => {
  if (isSensitiveKey(key)) {
    return REDACTED_VALUE;
  }
  if (typeof value === "string") {
    return isUrlField(key) || isAbsoluteUrl(value)
      ? sanitizeFetchedSourceUrl(value)
      : redactSensitiveText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeFetchedSourceMetadataValue("", entry));
  }
  if (typeof value === "object" && value !== null) {
    return sanitizeFetchedSourceMetadata(value as JsonObject);
  }
  return value;
};

const isUrlField = (key: string): boolean =>
  /(?:url|uri|href|link)$/iu.test(key);

const isAbsoluteUrl = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

export const sanitizeFetchedSourceUrl = (value: string): string => {
  const sanitized = sanitizeUrlCredentials(value);
  const fragmentStart = sanitized.indexOf('#');
  return fragmentStart < 0 ? sanitized : sanitized.slice(0, fragmentStart);
};
