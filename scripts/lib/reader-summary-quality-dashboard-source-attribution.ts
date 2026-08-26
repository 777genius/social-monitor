import type { DashboardFeedItemRow } from "./reader-summary-quality-dashboard-published-window";
import {
  asRecord,
  parseHost,
  readMetadataString,
} from "./reader-summary-quality-eval-support";

export function dashboardProviderSourceKey(
  providerKey: "reddit" | "x-twitter",
  item: DashboardFeedItemRow,
): string {
  const metadata = asRecord(item.providerMetadata);
  if (providerKey === "reddit") {
    return (
      readMetadataString(metadata, "subreddit") ??
      parseRedditSubreddit(item.canonicalUrl) ??
      "unknown"
    ).toLowerCase();
  }

  return (
    readMetadataString(metadata, "authorHandle") ??
    item.authorHandle ??
    parseXHandle(item.canonicalUrl) ??
    "unknown"
  ).toLowerCase();
}

export function dashboardFeedSourceKey(item: DashboardFeedItemRow): string {
  if (item.providerKey === "reddit") {
    return dashboardProviderSourceKey("reddit", item);
  }
  if (item.providerKey === "x-twitter") {
    return dashboardProviderSourceKey("x-twitter", item);
  }

  return parseHost(item.canonicalUrl) ?? item.authorHandle ?? "unknown";
}

export function dashboardSourceProduct(metadata: unknown): string | undefined {
  const record = asRecord(metadata);
  const lane = asRecord(record.sourceQueryLane);
  const value =
    readMetadataString(record, "sourceProduct") ??
    readMetadataString(record, "sort") ??
    readMetadataString(record, "searchSort") ??
    readMetadataString(record, "timeline") ??
    readMetadataString(lane, "sourceProduct") ??
    readMetadataString(lane, "listing") ??
    readMetadataString(lane, "searchSort") ??
    readMetadataString(lane, "timeline");

  return value?.trim().toLowerCase();
}

function parseRedditSubreddit(value: string): string | undefined {
  return /reddit\.com\/r\/([^/]+)/i.exec(value)?.[1];
}

function parseXHandle(value: string): string | undefined {
  return /(?:x|twitter)\.com\/([^/?#]+)/i.exec(value)?.[1];
}
