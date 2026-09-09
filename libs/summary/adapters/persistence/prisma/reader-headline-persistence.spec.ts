import { ReaderSummaryArtifact } from "../../../domain";
import { canonicalPromotionPayload, promotionPayloadDigest } from "../../../domain/services/reader-post-promotion-attestation";
import { readerDisplayPublicationFindings } from "../../../domain/policies/reader-summary-display-publication";
import { headlineArtifact, headlineArtifactProps, headlineFallback } from "./reader-headline-artifact.spec-support";
import { assessedSource } from "../../evidence/reader-headline.spec-support";
import { serializeReaderSummaryArtifact } from "./prisma-reader-summary-json";
import { normalizeReaderSummaryArtifactPayload } from "./prisma-reader-summary-artifact-payload";
import { normalizePromotionAttestations } from "./prisma-reader-summary-promotion-attestation";

describe("headline and captured source persistence authority", () => {
  it("roundtrips exact Unicode, separate full source and canonical seal without reassessment", () => {
    const lead = assessedSource("Orion 🚀 cafe\u0301 研究。 Final correction: simulation only.",
      "Orion 🚀 cafe\u0301 研究。 simulation only");
    const artifact = headlineArtifact(lead);
    const payload = serializeReaderSummaryArtifact(artifact);
    const loaded = ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(payload, headlineFallback(artifact)));
    const snapshot = loaded.toSnapshot();
    expect(snapshot.content?.topReads[0]?.title).toBe(artifact.toSnapshot().content?.topReads[0]?.title);
    expect(snapshot.content?.topReads[0]?.capturedSource?.body).toBe(lead.sourceText);
    expect(snapshot.promotionAttestations).toEqual(artifact.toSnapshot().promotionAttestations);
    expect(readerDisplayPublicationFindings(snapshot, headlineArtifactProps(lead).evidence)).toEqual([]);
  });

  it.each(["title", "source tail", "qualifier", "candidate", "scope", "slot", "digest"])(
    "rejects mutated %s at the persisted boundary", (field) => {
      const artifact = headlineArtifact();
      const payload = structuredClone(serializeReaderSummaryArtifact(artifact)) as Record<string, any>;
      const card = payload.content.topReads[0];
      const seal = payload.promotionAttestations[0];
      if (field === "title") card.title += " changed";
      if (field === "source tail") card.capturedSource.body += " Retraction.";
      if (field === "qualifier") card.displayHeadline.qualifications[0].phrase = "preliminary";
      if (field === "candidate") card.promotionCandidateId = "wrong";
      if (field === "scope") card.displayHeadline.binding.tenantId = "wrong";
      if (field === "slot") card.editorialSlot = 2;
      if (field === "digest") seal.displayHeadline.capturedSourceDigest = "a".repeat(64);
      expect(() => ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(payload, headlineFallback(artifact)))).toThrow();
    },
  );

  it("does not gain authority by recomputing a digest after changing captured text", () => {
    const artifact = headlineArtifact();
    const payload = structuredClone(serializeReaderSummaryArtifact(artifact)) as Record<string, any>;
    payload.content.topReads[0].capturedSource.body += " Full retraction.";
    const seal = payload.promotionAttestations[0];
    seal.displayHeadline.capturedSourceDigest = promotionPayloadDigest(canonicalPromotionPayload(payload.content.topReads[0].capturedSource));
    const { digest, canonicalPayload, ...body } = seal;
    void digest; void canonicalPayload;
    seal.canonicalPayload = canonicalPromotionPayload(body);
    seal.digest = promotionPayloadDigest(seal.canonicalPayload);
    expect(() => ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(payload, headlineFallback(artifact)))).toThrow(/display/);
  });

  it("does not authorize a caller-resealed headline against the independently accepted candidate", () => {
    const { props, evidence } = headlineArtifactProps();
    const originalCard = props.content.topReads[0]!;
    if (originalCard.displayHeadline?.status !== "accepted") throw new Error("fixture");
    const headline = { ...originalCard.displayHeadline,
      text: "Orion benchmark discussion; simulation only" };
    const card = { ...originalCard, title: headline.text, displayHeadline: headline };
    const attestations = props.promotionAttestations.map((seal) => {
      if (seal.schemaVersion !== "reader_post_promotion_attestation.v2") throw new Error("fixture");
      const { digest, canonicalPayload, ...body } = seal;
      void digest; void canonicalPayload;
      const updated = { ...body, displayHeadline: { ...seal.displayHeadline!, headline } };
      const payload = canonicalPromotionPayload(updated);
      return { ...updated, canonicalPayload: payload, digest: promotionPayloadDigest(payload) };
    });
    const forged = ReaderSummaryArtifact.create({ ...props, promotionAttestations: attestations,
      content: { ...props.content, topReads: [card] } });
    expect(readerDisplayPublicationFindings(forged.toSnapshot(), evidence)).toHaveLength(1);
  });

  it("preserves historical bytes without upgrading them to new publication authority", () => {
    const { props, evidence } = headlineArtifactProps();
    const cards = props.content.topReads.map(({ displayHeadline, capturedSource, ...card }) => {
      void displayHeadline; void capturedSource; return card;
    });
    const attestations = props.promotionAttestations.map((seal) => {
      if (seal.schemaVersion !== "reader_post_promotion_attestation.v2") throw new Error("fixture");
      const { displayHeadline, digest, canonicalPayload, ...body } = seal;
      void displayHeadline; void digest; void canonicalPayload;
      const payload = canonicalPromotionPayload(body);
      return { ...body, canonicalPayload: payload, digest: promotionPayloadDigest(payload) };
    });
    const historical = ReaderSummaryArtifact.rehydrate({ ...props,
      promotionAttestations: attestations, content: { ...props.content, topReads: cards } });
    const serialized = serializeReaderSummaryArtifact(historical);
    const loaded = ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(serialized, headlineFallback(historical)));
    expect(serializeReaderSummaryArtifact(loaded).promotionAttestations).toEqual(serialized.promotionAttestations);
    expect(JSON.stringify(loaded.toSnapshot().content?.topReads)).toBe(JSON.stringify(cards));
    expect(readerDisplayPublicationFindings(loaded.toSnapshot(), evidence)).toHaveLength(1);
    expect(normalizePromotionAttestations(serialized.promotionAttestations)).toEqual(attestations);
  });

  it("detaches and freezes source and nested annotation before callers can mutate a saved artifact", () => {
    const { props } = headlineArtifactProps();
    const artifact = ReaderSummaryArtifact.create(props);
    const card = props.content.topReads[0]!;
    const before = serializeReaderSummaryArtifact(artifact);
    Object.assign(card, { title: "mutated" });
    Object.assign(card.capturedSource!, { body: "lost source" });
    if (card.displayHeadline?.status === "accepted") Object.assign(card.displayHeadline.binding, { candidateId: "wrong" });
    expect(serializeReaderSummaryArtifact(artifact)).toEqual(before);
    expect(Object.isFrozen(artifact.toSnapshot().content?.topReads[0]?.displayHeadline)).toBe(true);
  });

  it.each(["\u0000", "\ud800", "\udc00"])("retains rejected non-roundtripping captured UTF-16 through JSON storage", (invalid) => {
    const body = `Orion benchmark ${invalid} findings. Late qualification remains.`;
    const artifact = headlineArtifact(assessedSource(body, "Orion benchmark discussion"));
    expect(artifact.toSnapshot().content?.topReads[0]?.displayHeadline?.status).toBe("unavailable");
    const serialized = serializeReaderSummaryArtifact(artifact);
    const loaded = ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(serialized, headlineFallback(artifact)));
    expect(loaded.toSnapshot().content?.topReads[0]?.capturedSource?.body).toBe(body);
  });
});
