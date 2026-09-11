import { projectPublicTitles } from "./reader-summary-title-projection.spec-support";
import { headlineArtifact } from "../../adapters/persistence/prisma/reader-headline-artifact.spec-support";
import { presentReaderSummaryArtifact } from "../../features/shared/reader-summary-artifact-presenter";
import { readerSummaryPromotionBoardRestView } from "./reader-summary-promotion-board-rest.mapper";
import { canonicalPromotionPayload, promotionPayloadDigest } from "../../domain/services/reader-post-promotion-attestation";

const fixture = () => presentReaderSummaryArtifact(headlineArtifact(), {
  status: "fresh", checkedAt: new Date("2026-07-05T09:00:00Z"),
});

describe("grounded headline REST transport", () => {
  it("uses the same exact transport for Top and Additional, including Unicode and tail", () => {
    const title = "Orion model discussion";
    const body = "Synthetic é 漢字 🚀 context. ".repeat(100) + "Final qualification: simulation only.";
    const { response, projection } = projectPublicTitles(title, body, true);
    const cards = [...response.readerBrief.topReads, ...response.readerBrief.selectedPosts];
    expect(response.readerBrief.topReads).toHaveLength(1);
    expect(response.readerBrief.selectedPosts).toHaveLength(1);
    expect(cards.map((card) => card.title)).toEqual([title, title]);
    for (const card of cards) expect(card.capturedSource?.body).toBe(body);
    expect(cards.map((card) => card.promotionAttestation?.candidateId)).toEqual(
      [...projection.topReads, ...projection.additionalPosts].map((card) => card.promotionCandidateId));
  });

  it("transports exact stored title, full source and sealed assessment", () => {
    const view = fixture();
    const board = readerSummaryPromotionBoardRestView(view);
    const card = board.topReads[0]!;
    expect(JSON.parse(JSON.stringify(card)).capturedSource).toEqual(view.content.topReads[0]!.capturedSource);
    expect(card.title).toBe(view.content.topReads[0]!.displayHeadline!.status === "accepted"
      ? view.content.topReads[0]!.title : "never unavailable");
    expect(card.capturedSource!.body).toContain("Final correction: simulation only.");
    expect(card.displayHeadline).toEqual(view.content.topReads[0]!.displayHeadline);
    expect(card.promotionAttestation!.displayHeadline!.headline).toEqual(card.displayHeadline);
  });

  it.each(["title", "source", "missing", "unavailable", "scope", "citation", "seal"])(
    "rejects %s tampering without silently dropping the card", (mutation) => {
      const view = fixture();
      const card = view.content.topReads[0]!;
      const attestation = view.promotionAttestations[0]!;
      const changed = structuredClone(view);
      if (mutation === "title") Object.assign(changed.content.topReads[0]!, { title: "Fabricated title" });
      if (mutation === "source") Object.assign(changed.content.topReads[0]!, {
        capturedSource: { ...card.capturedSource!, body: `${card.capturedSource!.body} Changed tail` },
      });
      if (mutation === "missing") Reflect.deleteProperty(changed.content.topReads[0]!, "displayHeadline");
      if (mutation === "unavailable") Object.assign(changed.content.topReads[0]!, {
        displayHeadline: { status: "unavailable", reasonCode: "not_assessed" },
      });
      if (mutation === "scope") Object.assign(changed, { workspaceId: "other-workspace" });
      if (mutation === "citation") Object.assign(changed.citations[0]!, { sourceItemId: "other-source" });
      if (mutation === "seal") {
        const body = JSON.parse(attestation.canonicalPayload) as Record<string, unknown>;
        delete body.displayHeadline;
        const canonicalPayload = canonicalPromotionPayload(body);
        Object.assign(changed.promotionAttestations[0]!, {
          canonicalPayload, digest: promotionPayloadDigest(canonicalPayload),
        });
      }
      expect(() => readerSummaryPromotionBoardRestView(changed)).toThrow("promotion board is invalid");
    },
  );
});
