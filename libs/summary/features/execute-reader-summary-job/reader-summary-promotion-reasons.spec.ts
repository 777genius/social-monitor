import { artifact, dailyEvidenceSelection } from
  "../../domain/policies/reader-summary-publication-policy-test-fixtures";
import { buildReaderSummaryDraftWithPromotionContent } from
  "./reader-summary-promotion-content";
import type { TopReadCandidate } from "../../domain/entities/top-read";

const placeholder = "Authoritative promotion snapshot candidate";
const substantive = "A developer reports that the new agent kept tool results across a resumed session, " +
  "avoiding a repeated repository scan. The report covers one workflow and includes no controlled " +
  "latency comparison, so it does not establish a general performance improvement.";

const authoredStory = (story: TopReadCandidate): TopReadCandidate => ({
  ...story,
  readerReasonProvenance: {
    kind: "model", originalStoryClusterId: story.storyClusterId,
    originalCitationIds: [...story.citationIds], originalSummary: story.summary,
  },
});

const fixture = () => {
  const base = dailyEvidenceSelection(25);
  const evidence = {
    ...base,
    clusters: base.clusters.map((cluster) => ({ ...cluster, whyImportant: [placeholder] })),
    selectedEvidence: base.selectedEvidence.map((item) => ({
      ...item, whyImportant: [placeholder],
      bodyPreview: "The resumed agent reused saved tool results and skipped scanning my repository again. " +
        "I tested one workflow and did not record comparative timings.",
    })),
  };
  const draft = {
    ...artifact().toSnapshot(),
    topStories: [authoredStory({ ...artifact().toSnapshot().topStories[0]!, summary: substantive })],
    citationMap: evidence.selectedEvidence.map((item, index) => ({
      citationId: `citation-publication-${index + 1}`,
      feedItemId: item.feedItemId, sourceItemId: item.sourceItemId,
      providerKey: item.providerKey, canonicalUrl: item.canonicalUrl,
      field: "canonicalUrl" as const,
    })),
  };
  return { evidence, draft };
};

describe("promotion reader explanations", () => {
  it.each([true, false])("preserves complete model prose through authoritative assembly (slate=%s)", (slate) => {
    const { evidence, draft } = fixture();
    const selection = { ...evidence, editorialSlate: slate ? evidence.editorialSlate : undefined };
    const before = structuredClone(selection);
    const result = buildReaderSummaryDraftWithPromotionContent(selection, draft);
    expect(result.content.topReads[0]?.reason).toBe(substantive);
    expect(result.content.topReads[0]?.whyImportant[0]).toBe(substantive);
    expect(result.topStories).toEqual(draft.topStories);
    expect(selection).toEqual(before);
    const withoutModel = buildReaderSummaryDraftWithPromotionContent(selection, { ...draft, topStories: [] });
    const cards = (content: typeof result.content) => [
      ...content.topReads, ...(content.selectedPosts ?? []),
    ].map(({ reason, whyImportant, ...card }) => {
      void reason;
      void whyImportant;
      return card;
    });
    expect(cards(result.content)).toEqual(cards(withoutModel.content));
    expect(JSON.stringify(result.content)).not.toContain(placeholder);
    if (!slate) {
      expect(result.content.selectedPosts).toHaveLength(1);
      expect(result.content.selectedPosts?.[0]?.reason).toBe(
        "Selected with 1 cited source in this summary window.",
      );
    }
  });

  it.each([
    { storyClusterId: "other-story" },
    { citationIds: [] },
    { citationIds: ["citation-publication-2"] },
    { citationIds: ["citation-publication-1", "citation-publication-2"] },
    { citationIds: ["citation-publication-1", "unknown"] },
    { summary: placeholder },
    { summary: `Useful agent findings. ${placeholder}` },
    { summary: "AI runtime quality discussion" },
    { summary: `${substantive} token=fixture-secret` },
    { summary: `${substantive} [UNTRUSTED_SOURCE_INSTRUCTION_REDACTED]` },
  ])("does not borrow, clip, or expose unusable model prose: %j", (override) => {
    const { evidence, draft } = fixture();
    const result = buildReaderSummaryDraftWithPromotionContent(evidence, {
      ...draft, topStories: [authoredStory({ ...draft.topStories[0]!, ...override })],
    });
    expect(result.content.topReads[0]?.reason).toBe(
      "Selected with 1 cited source in this summary window.",
    );
    expect(result.content.topReads[0]?.whyImportant).toEqual([
      "Selected with 1 cited source in this summary window.",
    ]);
  });

  it("uses the lead's measured rationale for an additional post when the model has none", () => {
    const { evidence, draft } = fixture();
    const result = buildReaderSummaryDraftWithPromotionContent({
      ...evidence, editorialSlate: undefined,
      selectedEvidence: evidence.selectedEvidence.map((item) => ({
        ...item, whyImportant: [placeholder, item.providerKey === "hacker-news"
          ? "Recorded Hacker News points: 25." : "Recorded Reddit score: 50."],
      })),
    }, { ...draft, topStories: [] });
    expect(result.content.selectedPosts?.[0]?.reason).toBe("Recorded Hacker News points: 25.");
  });
});
