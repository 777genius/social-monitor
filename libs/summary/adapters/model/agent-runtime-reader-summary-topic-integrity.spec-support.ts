import type {
  BuildReaderSummaryTopicMapParams,
  ReaderSummaryTopicLabelPlan,
} from "../../domain/services/reader-summary-topic-label-plan";
import { buildReaderSummaryTopicMap } from "../../domain/services/reader-summary-topic-map-builder";
import { reconcileVerifiedReaderSummaryTopicRelations } from "../../domain/services/reader-summary-topic-relation-reconciliation";
import { normalizeAgentRuntimeReaderSummaryTopicLabelPlan } from "./agent-runtime-reader-summary-topic-label-plan-normalizer";

export const ungrouped = "group:ungrouped";
const stamp = new Date("2026-09-06T00:00:00Z");

/** Synthetic inputs only: these cannot replay the missing original incident input. */
export const topicIntegrityFixture = (
  subjects: readonly string[],
  fallbacks: readonly string[] = subjects,
  keywordLists: readonly (readonly string[])[] = subjects.map(() => []),
) => {
  const candidates = subjects.map((subject, index) => ({
    nodeId: `topic:story:checkpoint-${index}`,
    storyClusterId: `story:checkpoint-${index}`,
    fallbackLabel: fallbacks[index]!,
    score: 1 - index / 100,
    evidenceCount: 1,
    providerKeys: ["rss"],
    interestIds: ["test-interest"],
    keywords: keywordLists[index]!,
    labelCandidates: [],
  }));
  const selectedEvidence = subjects.map((subject, index) => ({
    feedItemId: `feed-${index}`,
    sourceItemId: `source-${index}`,
    sourceBindingId: "test-binding",
    interestId: "test-interest",
    providerKey: "rss",
    title: `${subject} research`,
    bodyPreview: `${fallbacks[index]}. ${keywordLists[index]!.join(" ")}.`,
    canonicalUrl: `https://example.test/checkpoint-${index}`,
    publishedAt: stamp,
    observedAt: stamp,
    score: 1 - index / 100,
    whyImportant: [],
  }));
  const clusters = candidates.map((candidate, index) => ({
    id: candidate.storyClusterId,
    storyKey: `checkpoint-${index}`,
    rankingPolicyVersion: "story_ranking_v10" as const,
    representativeFeedItemId: selectedEvidence[index]!.feedItemId,
    duplicateFeedItemIds: [],
    interestIds: ["test-interest"],
    providerKeys: ["rss"],
    score: 1 - index / 100,
    observedAtRange: { startedAt: stamp, endedAt: stamp },
    whyImportant: [],
  }));
  const rawLabels = subjects.map((subject, index) => ({
    nodeId: candidates[index]!.nodeId,
    topicId: `topic:${subject.toLowerCase()}-research`,
    subject,
    parentSubject: "",
    claimType: "other",
    confidenceScore: 0.95,
    groupId: ungrouped,
    keywords: [...keywordLists[index]!],
  }));
  const params = {
    clusters,
    selectedEvidence,
    topStories: [],
    citationMap: selectedEvidence.map((item, index) => ({
      citationId: `c${index}`,
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      providerKey: "rss",
      field: "bodyPreview" as const,
      canonicalUrl: item.canonicalUrl,
    })),
    generatedBy: "agent-runtime" as const,
  } satisfies BuildReaderSummaryTopicMapParams;

  return { candidates, rawLabels, params };
};

export type TopicIntegrityFixture = ReturnType<typeof topicIntegrityFixture>;

export const normalizeIntegrityFixture = (fixture: TopicIntegrityFixture) =>
  normalizeAgentRuntimeReaderSummaryTopicLabelPlan(
    { nodeLabels: fixture.rawLabels, groups: [] },
    fixture.candidates,
  );

export const buildDistinctIntegrityMap = (
  fixture: TopicIntegrityFixture,
  plan: ReaderSummaryTopicLabelPlan = normalizeIntegrityFixture(fixture),
) => {
  const pairs = fixture.candidates.slice(1).map((target, index) => ({
    sourceNodeId: fixture.candidates[index]!.nodeId,
    targetNodeId: target.nodeId,
    sharedTerms: [],
  }));
  const reconciled = reconcileVerifiedReaderSummaryTopicRelations({
    labelPlan: plan,
    candidates: pairs,
    decisions: pairs.map((pair) => ({ ...pair, sameTopic: false, confidenceScore: 0.99 })),
  });

  return buildReaderSummaryTopicMap({ ...fixture.params, labelPlan: reconciled });
};
