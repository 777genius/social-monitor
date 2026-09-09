import { assessedTransportSource } from "./reader-summary-faithful-source-transport.spec-support";
import { acceptedFixtureReaderHeadline } from "../../test-fixtures/accepted-reader-headline";
import { ReaderSummaryArtifact } from "../../domain";
import { artifact, content } from "../../domain/policies/reader-summary-publication-policy-test-fixtures";
import { normalizeReaderSummaryArtifactPayload } from "../persistence/prisma/prisma-reader-summary-artifact-payload";
import { presentReaderSummaryArtifact } from "../../features/shared/reader-summary-artifact-presenter";
import { readerSummaryPromotionBoardRestView } from "../../interfaces/rest/reader-summary-promotion-board-rest.mapper";
import { groundedReaderHeadline } from "../../domain/services/reader-summary-headline-policy";
import { selection, xEvidence } from "./reader-summary-editorial-slate.spec-support";
import { incident, project, simulation, source } from "./reader-summary-faithful-source.spec-support";

describe("source context through persisted promotion and REST", () => {
  it.each([incident, simulation].flatMap((text) => [3230, 35].map((likes) => ({ text, likes }))))(
    "preserves source at $likes likes through persistence and REST", ({ text, likes }) => {
    const snapshot = artifact().toSnapshot();
    const scope = { tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId };
    const original = assessedTransportSource(text, scope);
    const item = { ...original, promotionFacts: { ...original.promotionFacts!,
      metrics: { provider: "x" as const, likes, reposts: 0, weightedScore: likes } } };
    const items = likes === 35 ? [acceptedFixtureReaderHeadline(xEvidence("companion", 5000), scope), item] : [item];
    const board = project(items);
    const card = [...board.topReads, ...board.additionalPosts].find((entry) => entry.promotionCandidateId === item.feedItemId)!;
    const window = selection(items, board.admittedClusters).sourceWindow;
    const generated = ReaderSummaryArtifact.create({
      ...snapshot, generatedAt: window.endedAt, readerSummaryId: "faithful-source-fixture",
      period: { cadence: "daily", timezone: "UTC", startedAt: window.startedAt,
        endedAt: window.endedAt, periodKey: "daily:2026-08-29T00:00:00.000Z:2026-08-30T00:00:00.000Z:UTC" },
      sourceWindow: window, storyClusters: board.admittedClusters,
      topStories: [{ storyClusterId: card.storyClusterId!, title: text,
        summary: "The source discusses agent safety reporting.", interestIds: [item.interestId],
        providerKeys: [item.providerKey], citationIds: ["citation:source"] }], citationMap: board.admittedCitations,
      promotionAttestations: board.attestations,
      promotionEvidenceFacts: board.attestedEvidenceFacts,
      content: content({ topReads: board.topReads, selectedPosts: board.additionalPosts,
        interestSections: [], narrativeSections: [], sourceMix: [{ providerKey: item.providerKey, itemCount: items.length,
          citationCount: items.length, storyClusterCount: items.length, crossSourceClusterCount: 0,
          singleSourceOnly: true, interestIds: [item.interestId] }] }),
    });
    const props = generated.toSnapshot();
    const parsed = normalizeReaderSummaryArtifactPayload(JSON.parse(JSON.stringify(props)), {
      id: props.readerSummaryId, tenantId: props.tenantId, workspaceId: props.workspaceId,
      scopeType: "workspace", interestId: null, cadence: "daily",
      periodStartedAt: props.period.startedAt, periodEndedAt: props.period.endedAt,
      periodTimezone: "UTC", userId: null, subscriptionId: null,
      headline: props.headline, summaryText: props.executiveSummary, createdAt: window.endedAt,
    });
    const persisted = ReaderSummaryArtifact.create(parsed);
    const saved = persisted.toSnapshot().content!;
    expect([...saved.topReads, ...(saved.selectedPosts ?? [])].find((entry) => entry.promotionCandidateId === item.feedItemId)?.capturedSource?.body).toBe(text);
    const view = presentReaderSummaryArtifact(persisted, {
      status: "fresh", checkedAt: window.endedAt,
    });
    const response = readerSummaryPromotionBoardRestView(view);
    const transported = (likes === 35 ? response.selectedPosts : response.topReads)[0];
    expect(transported?.title).toBe(card.title);
    expect(transported?.displayHeadline?.status).toBe("accepted");
    expect(transported?.capturedSource).toEqual({ title: original.title, body: text,
      captureAvailability: "available", reviewAvailability: "body_present" });
    expect(transported?.title.length).toBeLessThanOrEqual(119);
    if (text === simulation) expect(transported?.title).toContain("Only in simulations");
    expect(transported?.citationIds).toEqual(["citation:source"]);
    expect(transported?.promotionAttestation?.placement).toBe(likes === 35 ? "additional" : "top");
    expect(persisted.toSnapshot().promotionAttestations).toEqual(board.attestations);
    const viewCard = [...view.content.topReads, ...(view.content.selectedPosts ?? [])]
      .find((entry) => entry.promotionCandidateId === item.feedItemId)!;
    for (const corrupt of [
      { ...viewCard, displayHeadline: undefined },
      { ...viewCard, capturedSource: { ...viewCard.capturedSource!, body: `${text} Retraction.` } },
    ]) {
      const replace = (entry: typeof viewCard) => entry.promotionCandidateId === item.feedItemId ? corrupt : entry;
      expect(() => readerSummaryPromotionBoardRestView({ ...view, content: { ...view.content,
        topReads: view.content.topReads.map(replace),
        selectedPosts: view.content.selectedPosts?.map(replace),
      } })).toThrow("Reader summary promotion board is invalid");
    }
  });

  it("uses a neutral fallback headline rather than a detached source prefix", () => {
    const lead = project([source(simulation)]).topReads[0]!;
    expect(groundedReaderHeadline({ headline: "Key signals across sources", topReads: [lead], sourceMix: [] }))
      .toBe("Discussion from monitored sources");
  });
});
