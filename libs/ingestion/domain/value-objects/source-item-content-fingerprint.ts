import { createHash } from "node:crypto";

import type { SourceItemProps } from "../entities/source-item";
import {
  buildSourceEngagementMetrics,
  sourceMetadataWithoutEngagementAndVolatileProvenance,
} from "./source-engagement-metrics";

export const sourceItemContentHash = (snapshot: SourceItemProps): string =>
  createHash("sha256")
    .update(
      [
        snapshot.sourceBindingId,
        snapshot.externalId,
        snapshot.canonicalUrl,
        snapshot.title,
        snapshot.body,
        snapshot.authorHandle ?? "",
        snapshot.publishedAt.toISOString(),
      ].join("\u001f"),
    )
    .digest("hex");

export const sourceItemProviderContentHash = (params: {
  readonly providerKey: string;
  readonly snapshot: SourceItemProps;
}): string => {
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
        contentHash: sourceItemContentHash(params.snapshot),
        metadata,
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
