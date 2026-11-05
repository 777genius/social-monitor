import { ReaderSummaryArtifact } from "../../domain";
import { hasValidReaderDisplayTitle } from "../../domain/policies/reader-display-title-quality";
import { readerDisplayPublicationFindings } from "../../domain/policies/reader-summary-display-publication";
import {
  artifact,
  content,
} from "../../domain/policies/reader-summary-publication-policy-test-fixtures";
import { presentReaderSummaryArtifact } from "../../features/shared/reader-summary-artifact-presenter";
import { readerSummaryPromotionBoardRestView } from "../../interfaces/rest/reader-summary-promotion-board-rest.mapper";
import { capturedReaderSource } from "../../domain/services/reader-post-display-headline";
import { composeReaderSummaryEditorialSlate } from "./reader-summary-editorial-slate";
import {
  hackerNewsEvidence,
  redditEvidence,
  selection,
  storyCluster,
  xEvidence,
} from "./reader-summary-editorial-slate.spec-support";
import { headlineScope } from "./reader-headline.spec-support";
import { project } from "./reader-summary-faithful-source.spec-support";

const unavailableHeadline = {
  status: "unavailable" as const,
  reasonCode: "not_assessed" as const,
};

const sourceBody =
  "Atlas documents agent safety findings across public websites and proposes reporting standards for misalignment incidents.";

const mixedSourceTitleLeads = () => {
  const hn = {
    ...hackerNewsEvidence("hn-useful", 180),
    sourceText: sourceBody,
    readerHeadline: unavailableHeadline,
  };
  const reddit = {
    ...redditEvidence("reddit-useful", 749),
    sourceText: sourceBody,
    readerHeadline: unavailableHeadline,
  };
  const x = {
    ...xEvidence("x-useful", 23_396),
    sourceText: sourceBody,
    readerHeadline: {
      status: "unavailable" as const,
      reasonCode: "invalid_assessment" as const,
    },
  };
  return [hn, reddit, x];
};

describe("reader summary source-title editorial slate", () => {
  it("fills a mixed Top Reads slate from useful posts without accepted headlines", () => {
    const items = mixedSourceTitleLeads();

    const slate = composeReaderSummaryEditorialSlate({
      selection: selection(
        items,
        items.map((item) => storyCluster(item.feedItemId, [item])),
      ),
      candidates: items,
      displayScope: headlineScope,
    });

    expect(slate.top.map((entry) => entry.candidateId)).toEqual([
      "x-useful",
      "reddit-useful",
      "hn-useful",
    ]);
    expect(
      slate.excluded.filter((entry) =>
        entry.reasonCodes.includes("display_headline_unavailable"),
      ),
    ).toHaveLength(0);
  });

  it("publishes mixed source-title cards through identity, REST and ranking title gates", () => {
    const items = mixedSourceTitleLeads();
    const projection = project(items);
    const input = selection(
      items,
      items.map((item) => storyCluster(item.feedItemId, [item])),
    );
    const fixture = artifact().toSnapshot();
    const snapshot = {
      ...fixture,
      promotionAttestations: projection.attestations,
      content: {
        ...fixture.content!,
        topReads: projection.topReads,
        selectedPosts: projection.additionalPosts,
      },
    };

    expect(projection.topReads.map((card) => card.providerKey).sort()).toEqual([
      "hacker-news",
      "reddit",
      "x-twitter",
    ]);
    expect(projection.topReads.map((card) => card.displayHeadline)).toEqual([
      { status: "unavailable", reasonCode: "not_assessed" },
      { status: "unavailable", reasonCode: "not_assessed" },
      { status: "unavailable", reasonCode: "not_assessed" },
    ]);
    expect(projection.topReads.map((card) => card.capturedSource)).toEqual(
      projection.topReads.map((card) =>
        capturedReaderSource(items.find((item) => item.feedItemId === card.promotionCandidateId)!)),
    );
    expect(
      projection.topReads.every((card) => hasValidReaderDisplayTitle(card, items)),
    ).toBe(true);
    expect(readerDisplayPublicationFindings(snapshot, input)).toEqual([]);

    const generated = ReaderSummaryArtifact.create({
      ...fixture,
      readerSummaryId: "faithful-source-fixture",
      generatedAt: input.sourceWindow.endedAt,
      period: {
        cadence: "daily",
        timezone: "UTC",
        startedAt: input.sourceWindow.startedAt,
        endedAt: input.sourceWindow.endedAt,
        periodKey:
          "daily:2026-08-29T00:00:00.000Z:2026-08-30T00:00:00.000Z:UTC",
      },
      sourceWindow: input.sourceWindow,
      storyClusters: projection.admittedClusters,
      topStories: projection.topReads.map((card) => ({
        storyClusterId: card.storyClusterId!,
        title: card.title,
        summary: "The source discusses a concrete product update.",
        interestIds: [items[0]!.interestId],
        providerKeys: [card.providerKey],
        citationIds: card.citationIds,
      })),
      citationMap: projection.admittedCitations,
      promotionAttestations: projection.attestations,
      promotionEvidenceFacts: projection.attestedEvidenceFacts,
      content: content({
        topReads: projection.topReads,
        selectedPosts: projection.additionalPosts,
        interestSections: [],
        narrativeSections: [],
        sourceMix: items.map((item) => ({
          providerKey: item.providerKey,
          itemCount: 1,
          citationCount: 1,
          storyClusterCount: 1,
          crossSourceClusterCount: 0,
          singleSourceOnly: true,
          interestIds: [item.interestId],
        })),
      }),
    });
    const board = readerSummaryPromotionBoardRestView(
      presentReaderSummaryArtifact(generated, {
        status: "fresh",
        checkedAt: input.sourceWindow.endedAt,
      }),
    );
    const cards = [...board.topReads, ...board.selectedPosts];
    expect(cards.map((card) => card.providerKey).sort()).toEqual([
      "hacker-news",
      "reddit",
      "x-twitter",
    ]);
    expect(cards.every((card) => card.displayHeadline?.status === "unavailable")).toBe(
      true,
    );
    expect(cards.every((card) => card.displayHeadline?.reasonCode === "not_assessed")).toBe(
      true,
    );
    expect(cards.every((card) => card.title.trim().length > 0)).toBe(true);
    expect(cards.every((card) => card.capturedSource?.body === sourceBody)).toBe(true);
  });
});
