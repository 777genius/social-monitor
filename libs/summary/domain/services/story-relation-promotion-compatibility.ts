import type {
  ApprovedSameStoryRelation,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";

/**
 * Proves that authenticated candidate-window endpoints are still present and
 * current in the independently constructed promotion window. This deliberately
 * does not compare the promotion window to the execution proof's selection hash.
 */
export const storyRelationCompatibleWithPromotionSelection = (
  relation: ApprovedSameStoryRelation,
  selection: SummaryEvidenceSelection,
): boolean => {
  const selectedIds = new Set(selection.sourceWindow.selectedFeedItemIds);
  if (!selectedIds.has(relation.leftFeedItemId) ||
      !selectedIds.has(relation.rightFeedItemId)) return false;
  const evidenceById = new Map(selection.selectedEvidence.map((item) =>
    [item.feedItemId, item] as const));
  const left = evidenceById.get(relation.leftFeedItemId);
  const right = evidenceById.get(relation.rightFeedItemId);
  if (left === undefined || right === undefined ||
      !itemInsidePromotionWindow(left, selection) ||
      !itemInsidePromotionWindow(right, selection)) return false;

  const declaredClusterIds = new Set(selection.sourceWindow.storyClusterIds);
  const clusterByItemId = new Map<string, string>();
  for (const cluster of selection.clusters) {
    if (!declaredClusterIds.has(cluster.id)) continue;
    for (const id of [cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds]) {
      const current = clusterByItemId.get(id);
      if (current !== undefined && current !== cluster.id) return false;
      clusterByItemId.set(id, cluster.id);
    }
  }
  const leftClusterId = clusterByItemId.get(relation.leftFeedItemId);
  return leftClusterId !== undefined &&
    leftClusterId === clusterByItemId.get(relation.rightFeedItemId);
};

const itemInsidePromotionWindow = (
  item: SummaryEvidenceItem,
  selection: SummaryEvidenceSelection,
): boolean => {
  const { sourceWindow } = selection;
  const publishedAt = item.publishedAt.getTime();
  const observedAt = item.observedAt.getTime();
  if (!Number.isFinite(publishedAt) || !Number.isFinite(observedAt) ||
      publishedAt > observedAt ||
      !insideClosed(publishedAt, sourceWindow.startedAt,
        sourceWindow.endedAt)) return false;
  if ((sourceWindow.periodStartedAt === undefined) !==
      (sourceWindow.periodEndedAt === undefined)) return false;
  if (sourceWindow.periodStartedAt !== undefined &&
      sourceWindow.periodEndedAt !== undefined &&
      !insideHalfOpen(publishedAt, sourceWindow.periodStartedAt,
        sourceWindow.periodEndedAt)) return false;
  return sourceWindow.ingestionCutoff === undefined ||
    (Number.isFinite(sourceWindow.ingestionCutoff.getTime()) &&
      observedAt <= sourceWindow.ingestionCutoff.getTime());
};

const insideHalfOpen = (value: number, startedAt: Date, endedAt: Date): boolean =>
  Number.isFinite(startedAt.getTime()) && Number.isFinite(endedAt.getTime()) &&
  startedAt.getTime() < endedAt.getTime() && value >= startedAt.getTime() &&
  value < endedAt.getTime();

const insideClosed = (value: number, startedAt: Date, endedAt: Date): boolean =>
  Number.isFinite(startedAt.getTime()) && Number.isFinite(endedAt.getTime()) &&
  startedAt.getTime() <= endedAt.getTime() && value >= startedAt.getTime() &&
  value <= endedAt.getTime();
