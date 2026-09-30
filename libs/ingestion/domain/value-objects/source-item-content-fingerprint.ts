import { legacySourceSnapshotSha256 } from './legacy-source-capture';
import { readContentCapture } from './source-content-capture';
import { createHash } from "node:crypto";

import type { SourceItemProps } from "../entities/source-item";
import {
  GITHUB_TRENDING_PAGE_PROVIDER_KEY,
  parseGitHubTrendingPageRepositoryMetadata,
} from "./github-trending-page";
import {
  buildSourceEngagementMetrics,
  sourceMetadataWithoutEngagementAndVolatileProvenance,
} from "./source-engagement-metrics";

const hashSourceItemFields = (snapshot: SourceItemProps, includeBinding: boolean): string =>
  createHash("sha256")
    .update(
      [
        ...(includeBinding ? [snapshot.sourceBindingId] : []),
        snapshot.externalId,
        snapshot.canonicalUrl,
        snapshot.title,
        snapshot.body,
        snapshot.authorHandle ?? "",
        snapshot.publishedAt.toISOString(),
      ].join("\u001f"),
    )
    .digest("hex");

// A SourceItem is shared by provider identity across bindings. Its content
// revision must remain stable when only the observing binding changes.
export const sourceItemContentHash = (snapshot: SourceItemProps): string =>
  hashSourceItemFields(snapshot, false);

export const sourceItemProviderContentHash = (params: {
  readonly providerKey: string;
  readonly snapshot: SourceItemProps;
}): string => {
  if (params.providerKey === GITHUB_TRENDING_PAGE_PROVIDER_KEY) {
    const metadata = parseGitHubTrendingPageRepositoryMetadata(
      params.snapshot.metadata,
    );
    if (metadata !== null) {
      return metadata.trending.snapshotContentHash;
    }
  }
  const capture = readContentCapture(params.snapshot);
  const sourceDigest = capture?.sourceSnapshotSha256 ?? legacySourceSnapshotSha256(params.snapshot);
  const engagement = buildSourceEngagementMetrics({
    providerKey: params.providerKey,
    metadata: params.snapshot.metadata,
  });
  const metadata =
    engagement.qualityFlags.metadataKindKnown &&
    !engagement.qualityFlags.invalidMetricValue &&
    !engagement.qualityFlags.conflictingAliases
      ? sourceMetadataWithoutEngagementAndVolatileProvenance({
          providerKey: params.providerKey,
          metadata: params.snapshot.metadata,
        })
      : (params.snapshot.metadata ?? {});

  return createHash("sha256")
    .update(
      JSON.stringify(canonical({
        // Retain the binding in the provider persistence fingerprint so a
        // binding change still updates the SourceItem's provenance. Keep the
        // existing digest format to avoid rewriting unchanged provider rows.
        contentHash: hashSourceItemFields(params.snapshot, true),
        // Assessment identity is the capture digest; provider persistence must
        // additionally observe meaningful non-text provider facts.
        sourceDigest,
        metadata: Object.fromEntries(Object.entries(metadata).filter(([key]) =>
          !['contentCapture', 'articleCaptureAttempt', 'articleContent'].includes(key))),
      })),
    )
    .digest("hex");
};

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
};
