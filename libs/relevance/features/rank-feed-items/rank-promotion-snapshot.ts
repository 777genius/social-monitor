import { feedPromotionMetricStrength } from "@social-monitor/feed/domain";
import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import {
  type Clock,
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import type {
  SourceContentQualityPolicy,
  SourceContentSafetyPolicy,
} from "../../domain";
import {
  presentSourceContentQuality,
  presentSourceContentSafety,
} from "../shared/relevance-presenter";
import type { RankFeedItemsCommand } from "./rank-feed-items.command";
import type {
  RankedFeedItemView,
  RankFeedItemsResult,
} from "./rank-feed-items.result";
import { promotionSafeProviderMetadata } from "./rank-feed-item-projection";

const PROMOTION_SOURCE_TEXT_SAFETY_CAP = 256_000;

export const rankPromotionSnapshot = async (params: {
  readonly command: RankFeedItemsCommand;
  readonly feedItems: FeedItemReadRepositoryPort;
  readonly clock: Clock;
  readonly qualityPolicy: SourceContentQualityPolicy;
  readonly safetyPolicy: SourceContentSafetyPolicy;
}): Promise<Result<RankFeedItemsResult, DomainError | Error>> => {
  if (params.feedItems.readPromotionSnapshot === undefined) {
    return err(new DomainError(
      "operation.conflict",
      "Promotion snapshot repository capability is unavailable",
    ));
  }
  const { command } = params;
  const timestampPolicy = command.publishedAtOrAfter !== undefined ||
      command.publishedBefore !== undefined
    ? "published_at" as const
    : "observed_at" as const;
  const windowStartedAt = timestampPolicy === "published_at"
    ? command.publishedAtOrAfter
    : command.observedAtOrAfter;
  const windowEndedAt = timestampPolicy === "published_at"
    ? command.publishedBefore
    : command.observedBefore;
  if (windowStartedAt === undefined || windowEndedAt === undefined) {
    return err(new DomainError(
      "validation.failed",
      "Promotion ranking requires a bounded timestamp window",
    ));
  }
  let snapshot;
  try {
    snapshot = await params.feedItems.readPromotionSnapshot({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId: normalizeOptional(command.interestId),
      timestampPolicy,
      windowStartedAt,
      windowEndedAt,
      observedThrough: command.observedAtOrBefore === undefined
        ? windowEndedAt
        : command.observedAtOrBefore,
    });
  } catch (error) {
    return err(new DomainError(
      "operation.conflict",
      "Promotion snapshot transaction did not complete",
      { reason: prismaErrorCode(error) === "P2028"
        ? "promotion_snapshot_timeout"
        : "promotion_snapshot_transaction_failed" },
    ));
  }
  if (!snapshot.ok) {
    return err(new DomainError(
      "operation.conflict",
      "Promotion candidate snapshot exceeded its bounded scan",
      {
        reason: snapshot.reason,
        physicalRowsRead: snapshot.physicalRowsRead,
        eligibleCandidateCount: snapshot.eligibleItemCount,
      },
    ));
  }
  const sourceContentById = new Map(snapshot.sourceContent.map((content) =>
    [content.feedItemId, content] as const));
  const projected = snapshot.candidates.map((candidate) => {
    const item = candidate.item.toSnapshot();
    const sourceContent = sourceContentById.get(item.id);
    if (sourceContent === undefined || sourceContent.sourceItemId !== item.sourceItemId) {
      throw new Error("Promotion snapshot source content is not identity-bound");
    }
    const safety = params.safetyPolicy.evaluate({
      providerKey: item.providerKey,
      title: item.title,
      bodyPreview: sourceContent.body.slice(0, PROMOTION_SOURCE_TEXT_SAFETY_CAP),
      canonicalUrl: item.canonicalUrl,
    });
    const quality = params.qualityPolicy.evaluate({
      providerKey: item.providerKey,
      canonicalUrl: safety.sanitizedCanonicalUrl ?? item.canonicalUrl,
      title: safety.sanitizedTitle,
      bodyPreview: safety.sanitizedBodyPreview,
      authorHandle: item.authorHandle,
      providerMetadata: promotionSafeProviderMetadata(
        item.providerKey,
        item.providerMetadata,
      ),
    });
    return {
      feedItemId: item.id,
      sourceItemId: item.sourceItemId,
      sourceBindingId: item.sourceBindingId,
      interestId: item.interestId,
      providerKey: item.providerKey,
      canonicalUrl: safety.sanitizedCanonicalUrl ?? item.canonicalUrl,
      title: safety.sanitizedTitle,
      bodyPreview: safety.sanitizedBodyPreview,
      ...(safety.sanitizedBodyPreview === undefined ? {} : {
        sourceText: safety.sanitizedBodyPreview.slice(
          0, PROMOTION_SOURCE_TEXT_SAFETY_CAP,
        ),
      }),
      providerMetadata: promotionSafeProviderMetadata(
        item.providerKey,
        item.providerMetadata,
      ),
      authorHandle: item.authorHandle,
      publishedAt: item.publishedAt.toISOString(),
      observedAt: item.observedAt.toISOString(),
      ...(candidate.exactTimestamps === undefined ? {} : {
        exactPublishedAt: candidate.exactTimestamps.publishedAt,
        exactObservedAt: candidate.exactTimestamps.observedAt,
      }),
      ...(candidate.metricAuthority === undefined ? {} : {
        engagementAuthority: {
          observedAt: candidate.metricAuthority.observedAt.toISOString(),
          regressionState: candidate.metricAuthority.regressionState,
        },
      }),
      score: Math.min(
        0.85,
        feedPromotionMetricStrength(candidate.canonical.metrics) / 10,
      ) * quality.qualityScore,
      rank: 0,
      clusterId: `promotion-snapshot:${item.id}`,
      clusterSize: 1,
      duplicateFeedItemIds: [],
      whyImportant: ["Authoritative promotion snapshot candidate"],
      safety: presentSourceContentSafety(safety),
      contentQuality: presentSourceContentQuality(quality),
    } satisfies RankedFeedItemView;
  });
  const supplemental = (snapshot.supplementalItems ?? []).map((feedItem) => {
    const item = feedItem.toSnapshot();
    const sourceContent = sourceContentById.get(item.id);
    if (sourceContent === undefined || sourceContent.sourceItemId !== item.sourceItemId) {
      throw new Error("Promotion supplemental source content is not identity-bound");
    }
    const safety = params.safetyPolicy.evaluate({
      providerKey: item.providerKey,
      title: item.title,
      bodyPreview: sourceContent.body.slice(0, PROMOTION_SOURCE_TEXT_SAFETY_CAP),
      canonicalUrl: item.canonicalUrl,
    });
    const quality = params.qualityPolicy.evaluate({
      providerKey: item.providerKey,
      canonicalUrl: safety.sanitizedCanonicalUrl ?? item.canonicalUrl,
      title: safety.sanitizedTitle,
      bodyPreview: safety.sanitizedBodyPreview,
      authorHandle: item.authorHandle,
      providerMetadata: item.providerMetadata,
    });
    return {
      feedItemId: item.id,
      sourceItemId: item.sourceItemId,
      sourceBindingId: item.sourceBindingId,
      interestId: item.interestId,
      providerKey: item.providerKey,
      canonicalUrl: safety.sanitizedCanonicalUrl ?? item.canonicalUrl,
      title: safety.sanitizedTitle,
      bodyPreview: safety.sanitizedBodyPreview,
      ...(safety.sanitizedBodyPreview === undefined ? {} : {
        sourceText: safety.sanitizedBodyPreview.slice(
          0, PROMOTION_SOURCE_TEXT_SAFETY_CAP,
        ),
      }),
      providerMetadata: item.providerMetadata,
      authorHandle: item.authorHandle,
      publishedAt: item.publishedAt.toISOString(),
      observedAt: item.observedAt.toISOString(),
      score: 0,
      rank: 0,
      clusterId: `promotion-snapshot:${item.id}`,
      clusterSize: 1,
      duplicateFeedItemIds: [],
      whyImportant: ["Supplemental evidence from authoritative promotion snapshot"],
      safety: presentSourceContentSafety(safety),
      contentQuality: presentSourceContentQuality(quality),
    } satisfies RankedFeedItemView;
  });
  const items = [...projected, ...supplemental]
    .sort((left, right) => right.score - left.score ||
      right.publishedAt.localeCompare(left.publishedAt) ||
      right.feedItemId.localeCompare(left.feedItemId))
    .map((item, index) => ({ ...item, rank: index + 1 }));
  return ok({
    generatedAt: params.clock.now().toISOString(),
    profileApplied: false,
    items,
  });
};

const prismaErrorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" ? error.code : undefined;

const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};
