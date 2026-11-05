import {
  aug14RelatedTopicCitations,
  aug14RelatedTopicSelection,
} from "../../test-fixtures/aug-14-related-topic.fixture";
import type { TopRead } from "../entities/top-read";
import {
  buildRelatedTopicCandidates,
  reconcileRelatedTopicVerdicts,
} from "../services/reader-summary-related-topics";
import { buildReaderSummary } from "./reader-summary";

describe("reader summary related-topic aggregate production path", () => {
  it("keeps related-only evidence context-only and out of reader-visible cards", () => {
    const selection = aug14RelatedTopicSelection();
    const candidate = buildRelatedTopicCandidates({ selection })[0]!;
    const relations = reconcileRelatedTopicVerdicts({
      candidates: [candidate],
      evidence: selection.selectedEvidence,
      clusters: selection.clusters,
      decisions: [{
        leftFeedItemId: candidate.leftFeedItemId,
        rightFeedItemId: candidate.rightFeedItemId,
        relation: "related_topic",
        confidenceScore: 0.99,
      }],
    });
    const disabled = build([]);
    const enabled = build(relations);

    expect(enabled.topReads).toEqual(disabled.topReads);
    expect(enabled.sourceMix).toEqual(disabled.sourceMix);
    expect(enabled.mainTopics).toEqual(disabled.mainTopics);
    expect(enabled.headline).toEqual(disabled.headline);
    expect(enabled.oneLineTakeaway).toEqual(disabled.oneLineTakeaway);
    expect(enabled.interestSections).toEqual(disabled.interestSections);
    expect(enabled.trendDelta).toEqual(disabled.trendDelta);
    expect(enabled.risks).toEqual(disabled.risks);
    expect(enabled.claimBoard).toEqual(disabled.claimBoard);
    expect(enabled.reliabilityReport).toEqual(disabled.reliabilityReport);
    expect(nonRelated(enabled.selectedPosts)).toEqual(
      nonRelated(disabled.selectedPosts),
    );
    const related = enabled.selectedPosts?.filter(
      (item) => item.cardKind === "related_topic",
    );
    expect(related).toEqual([]);
  });
});

const build = (
  relatedTopicRelations: Parameters<typeof buildReaderSummary>[0]["relatedTopicRelations"],
) => {
  const selection = aug14RelatedTopicSelection();
  const citations = aug14RelatedTopicCitations();
  return buildReaderSummary({
    headline: "Text watermarking is under discussion",
    executiveSummary: "An official publication and independent discussion cover text watermarking.",
    topStories: [{
      storyClusterId: "story:aug14-anthropic-watermark",
      title: "Anthropic introduces text watermarking for Claude-generated code",
      summary: "Anthropic published official information about text watermarking.",
      interestIds: ["interest:claude-code"],
      providerKeys: ["rss", "hacker-news"],
      citationIds: [
        "citation:aug14-watermark-official",
        "citation:aug14-watermark-hn",
      ],
    }],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: citations,
    storyClusters: selection.clusters,
    sourceWindow: selection.sourceWindow,
    selectedEvidence: selection.selectedEvidence,
    relatedTopicRelations,
    qualityFlags: [],
  });
};

const nonRelated = (items: readonly TopRead[] | undefined): readonly TopRead[] =>
  (items ?? []).filter((item) => item.cardKind !== "related_topic");
