import type { ReaderValueSourceSnapshot } from "@social-monitor/relevance/domain/reader-value/reader-value-source";
import { createHash } from "node:crypto";
import type { ReaderSummaryPreparationManifest,
  SummaryEvidenceItem } from "../../domain";
import type { ReaderSummaryScopeIdentity } from "../../domain/value-objects/reader-summary-scope";
import { compareReaderSummaryPreparationTimestamps } from "../../domain/value-objects/reader-summary-preparation";
import { StoryClusteringService } from "../../domain/services/story-clustering.service";
import { STORY_RANKING_POLICY_V1 } from "../../domain/policies/story-ranking-policy";
import { readerPromotionSourceForProviderKey } from "../../domain/policies/reader-promotion-source-registry";
import { selectReaderSummaryDailyGenerationInput } from "../../domain/services/reader-summary-daily-generation-selection";
import { readerBrowseSourceEngagement, readerBrowseSourceLikeCount } from "./reader-browse-source-engagement";
import { clusteringEvidenceItem } from "./relevance-reader-summary-v3-source-evidence";

/** Shared producer/writer reconstruction. No provider call or assessment-label gate. */
export function dailyReaderSummaryGenerationEvidence(params: {
  readonly manifest: ReaderSummaryPreparationManifest;
  readonly manifestSha256: string;
  readonly periodKey: string;
  readonly identity: ReaderSummaryScopeIdentity;
  readonly snapshots: ReadonlyMap<string, ReaderValueSourceSnapshot>;
}) {
  const evidence = params.manifest.candidates.map(frozen => {
    const snapshot = params.snapshots.get(frozen.assessmentId);
    if (snapshot === undefined) throw new Error("Daily generation assessment snapshot missing");
    // The mapper reads only input.interestId. Source text is the exact frozen
    // assessment snapshot, independent of whether its answer promoted a card.
    return { frozen, snapshot, evidence: clusteringEvidenceItem(frozen, {
      tenantId: params.identity.tenantId, workspaceId: params.identity.workspaceId,
      interestId: "frozen-daily", candidateId: frozen.candidateId,
      sourceItemId: frozen.sourceItemId, sourceBindingId: frozen.sourceBindingId,
      providerKey: frozen.providerKey, trustedIntent: snapshot.interest,
      sourceSnapshotSha256: frozen.sourceSnapshotSha256,
      title: snapshot.title, body: dailySourceText(snapshot, params.manifest.cutoffAt), captureComplete: true,
    }, { input: { interestId: "interestId" in frozen && typeof frozen.interestId === "string" ? frozen.interestId :
      params.identity.scope.type === "interest" ? params.identity.scope.interestId : "frozen-daily" } }) };
  });
  const safe = evidence.filter(({ snapshot }) => snapshot.safety !== "blocked");
  const clustering = new StoryClusteringService({ now: () => new Date(params.manifest.cutoffAt) },
    { ...STORY_RANKING_POLICY_V1, maxClusters: Math.max(1, safe.length) });
  const clustered = clustering.clusterWithinComparisonBudget({ identity: params.identity,
    now: new Date(params.manifest.cutoffAt), limit: Math.max(1, safe.length),
    items: safe.map(({ evidence: item, snapshot }) => ({ ...item,
      // A validated retained quoted source is the shared origin. Its parent
      // (the author's own tweet) must never be used as a cross-author anchor.
      ...(snapshot.quotedPost !== undefined && validRetainedQuote(snapshot.quotedPost, params.manifest.cutoffAt)
        ? { canonicalUrl: snapshot.quotedPost.canonicalUrl } : {}) })).sort((a, b) =>
      Buffer.compare(Buffer.from(a.feedItemId), Buffer.from(b.feedItemId))),
  }, 8_388_608);
  if (clustered.kind !== "ready") throw new Error("Daily generation story comparison budget exceeded");
  const storyById = new Map(clustered.selection.clusters.flatMap(cluster =>
    [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds].map(id => [id, cluster.id] as const)));
  const proof = selectReaderSummaryDailyGenerationInput({
    manifestSha256: params.manifestSha256, periodKey: params.periodKey, cutoffAt: params.manifest.cutoffAt,
    candidates: evidence.map(({ frozen, snapshot, evidence: item }) => {
      const observedAt = frozen.engagementObservedAt ?? null;
      const metric = { providerKey: frozen.providerKey, providerMetadata: frozen.providerMetadata,
        engagementObservedAt: observedAt };
      const x = readerPromotionSourceForProviderKey(frozen.providerKey)?.family === "x";
      return { feedItemId: frozen.candidateId, sourceItemId: frozen.sourceItemId,
        interestId: item.interestId,
        observedAt: frozen.observedAt,
        assessmentId: frozen.assessmentId, sourceSnapshotSha256: frozen.sourceSnapshotSha256,
        inputSha256: frozen.inputSha256, providerKey: frozen.providerKey,
        providerFamily: readerPromotionSourceForProviderKey(frozen.providerKey)?.family ?? frozen.providerKey,
        publishedAt: frozen.publishedAt, canonicalIdentity: frozen.canonicalIdentity,
        storyId: storyById.get(frozen.candidateId) ?? `source:${frozen.sourceItemId}`,
        nativeCount: x ? readerBrowseSourceLikeCount(metric) ?? null : readerBrowseSourceEngagement(metric),
        engagementObservedAt: observedAt, safe: snapshot.safety !== "blocked",
        contextAvailable: snapshot.body.trim().length > 0 && !snapshot.retainedSnapshotTruncated &&
          snapshot.capture.availability !== "truncated" && snapshot.quotedContext !== "not_captured" };
    }),
  });
  const byId = new Map(evidence.map(value => [value.frozen.candidateId, value.evidence]));
  const selectedEvidence: readonly SummaryEvidenceItem[] = proof.selected.map(entry => byId.get(entry.feedItemId)!);
  const clusters = proof.selected.map(entry => {
    const item = byId.get(entry.feedItemId)!;
    return { id: entry.storyId, storyKey: entry.storyId, representativeFeedItemId: entry.feedItemId,
      duplicateFeedItemIds: [], interestIds: [item.interestId], providerKeys: [item.providerKey], score: 1,
      observedAtRange: { startedAt: item.observedAt, endedAt: item.observedAt }, whyImportant: [] };
  });
  return { proof, selectedEvidence, clusters };
}

const validRetainedQuote = (quote: NonNullable<ReaderValueSourceSnapshot["quotedPost"]>, cutoff: string): boolean =>
  /^\d+$/u.test(quote.tweetId) &&
  new RegExp(`^https://(?:x\\.com|twitter\\.com)/[^/]+/status/${quote.tweetId}$`, "u").test(quote.canonicalUrl) &&
  createHash("sha256").update(quote.body, "utf8").digest("hex") === quote.bodySha256 &&
  compareReaderSummaryPreparationTimestamps(quote.availableAt, cutoff) <= 0;

const dailySourceText = (snapshot: ReaderValueSourceSnapshot, cutoff: string): string => {
  const quote = snapshot.quotedPost;
  return quote === undefined || !validRetainedQuote(quote, cutoff) ? snapshot.body :
    `Authored post:\n${safeSourceBody(snapshot.body)}\n\nCaptured quoted post by ${quote.authorHandle} (${quote.canonicalUrl}):\n${safeSourceBody(quote.body)}`;
};

/** Preserve historical ordinary bytes; quote only bodies spoofing envelope labels. */
const safeSourceBody = (value: string): string =>
  /(?:^|\n)[ \t]*(?:Authored post:|Captured quoted post by )/iu.test(value)
    ? JSON.stringify(value) : value;
