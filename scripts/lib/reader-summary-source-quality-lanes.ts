import { fingerprint } from "./yesterday-social-replay-support";
import {
  asRecord,
  readMetadataString,
} from "./reader-summary-quality-eval-support";

export type ReaderSummaryTraceProviderKey =
  "hacker-news" | "reddit" | "rss" | "x-twitter";

export const sourceQualityLaneDescriptor = (
  providerKey: ReaderSummaryTraceProviderKey,
  metadataValue: unknown,
): {
  readonly key: string;
  readonly family: string;
  readonly queryFingerprint: string;
} => {
  const metadata = asRecord(metadataValue);
  const lane = asRecord(metadata.sourceQueryLane);
  const query =
    readMetadataString(lane, "query") ??
    readMetadataString(metadata, "searchQuery") ??
    sourceProduct(metadata) ??
    providerSourceKey(providerKey, metadata);
  const family = laneFamily({ providerKey, metadata, lane, query });

  return {
    key: `${providerKey}:${family}:${query.toLowerCase()}`,
    family,
    queryFingerprint: fingerprint(`${providerKey}:${query.toLowerCase()}`),
  };
};

const laneFamily = (params: {
  readonly providerKey: ReaderSummaryTraceProviderKey;
  readonly metadata: Record<string, unknown>;
  readonly lane: Record<string, unknown>;
  readonly query: string;
}): string => {
  if (params.providerKey === "reddit") {
    return redditLaneFamily(params);
  }
  if (params.providerKey === "x-twitter") {
    return xTwitterLaneFamily(params);
  }

  return `provider_feed:${sourceProduct(params.metadata) ?? "default"}`;
};

const redditLaneFamily = (params: {
  readonly metadata: Record<string, unknown>;
  readonly lane: Record<string, unknown>;
  readonly query: string;
}): string => {
  const mode = readMetadataString(params.lane, "mode");
  const searchSort =
    readMetadataString(params.lane, "searchSort") ??
    readMetadataString(params.metadata, "searchSort");
  const searchTime =
    readMetadataString(params.lane, "searchTime") ??
    readMetadataString(params.metadata, "searchTime");
  const product = sourceProduct(params.metadata);

  if (mode === "listing" || product === "hot" || product === "top") {
    return `community_listing:${product ?? "listing"}`;
  }
  if (searchSort !== undefined) {
    return `search:${searchSort}:${searchTime ?? "any"}`;
  }

  return params.query.includes(":")
    ? "community_listing:unknown"
    : "search:general";
};

const xTwitterLaneFamily = (params: {
  readonly lane: Record<string, unknown>;
  readonly query: string;
}): string => {
  const kind = readMetadataString(params.lane, "kind");
  const operation = readMetadataString(params.lane, "operation");
  const query = params.query.toLowerCase();
  const descriptor = `${kind ?? ""}:${operation ?? ""}`.toLowerCase();

  if (descriptor.includes("account_posts") || /\bfrom:/u.test(query)) {
    return "from";
  }
  if (descriptor.includes("account_mentions") || /(^|\s)@[\w_]+/u.test(query)) {
    return "mention";
  }
  if (descriptor.includes("product_or_group") || /\sor\s/u.test(query)) {
    return "product_or_group";
  }

  return descriptor.includes("fallback") ? "fallback" : "search:general";
};

const sourceProduct = (
  metadata: Record<string, unknown>,
): string | undefined => {
  const value =
    readMetadataString(metadata, "sourceProduct") ??
    readMetadataString(metadata, "sort") ??
    readMetadataString(metadata, "searchSort") ??
    readMetadataString(metadata, "timeline");

  return value?.trim().toLowerCase();
};

const providerSourceKey = (
  providerKey: ReaderSummaryTraceProviderKey,
  metadata: Record<string, unknown>,
): string => {
  if (providerKey === "reddit") {
    return readMetadataString(metadata, "subreddit") ?? "unknown";
  }
  if (providerKey === "x-twitter") {
    return readMetadataString(metadata, "authorHandle") ?? "unknown";
  }

  return providerKey;
};
