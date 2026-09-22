import { validDisplayHeadlineSource } from "./reader-post-display-headline";
import { canonicalPromotionPayload, promotionPayloadDigest } from "./reader-post-promotion-attestation";
import {
  publicReaderPostPresentationV3Seal,
  readerPostPresentationV3MatchesCard,
  sealReaderPostPresentationV3,
  type ReaderPostPresentationV3Input,
} from "./reader-post-presentation-v3";

describe("Promotion V3 full-source presentation", () => {
  it.each([12_000, 12_001, 64_000])(
    "accepts a complete %i UTF-16 body without changing the V2 limit",
    (length) => {
      const input = presentationInput("a".repeat(length - 12) + " late caveat");
      const headline = acceptedHeadline(input, "late caveat");
      const result = sealReaderPostPresentationV3({ input, headline });

      expect(result.status).toBe("available");
      expect(validDisplayHeadlineSource(headline, capturedSource(input))).toBe(
        length <= 12_000,
      );
      if (result.status !== "available") return;
      expect(readerPostPresentationV3MatchesCard({
        title: headline.text,
        providerKey: input.providerKey,
        candidateId: input.candidateId,
        capturedSource: capturedSource(input),
        headline,
        seal: result.seal,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
      })).toBe(true);
    },
  );

  it("rejects one UTF-16 unit beyond the V3 full-presentation cap", () => {
    const input = presentationInput("a".repeat(63_989) + " late caveat");
    expect(input.body).toHaveLength(64_001);

    expect(sealReaderPostPresentationV3({
      input,
      headline: acceptedHeadline(input, "late caveat"),
    })).toEqual({ status: "unavailable", reason: "input_over_budget" });
  });

  it("binds a late qualification from a complete 40k source", () => {
    const input = presentationInput("a".repeat(39_984) + " only in preview");
    const headline = acceptedHeadline(input, "only in preview", true);
    const result = sealReaderPostPresentationV3({ input, headline });

    expect(input.body).toHaveLength(40_000);
    expect(result).toMatchObject({ status: "available" });
    if (result.status !== "available") return;
    expect(result.seal.headline).toMatchObject({
      wholeInput: { bodyLength: 40_000, qualificationJudgment: "preserved" },
      qualifications: [{ phrase: "only in preview" }],
    });
  });

  it("fails a mismatched card headline or source seal", () => {
    const input = presentationInput("Supported body late caveat");
    const headline = acceptedHeadline(input, "late caveat");
    const result = sealReaderPostPresentationV3({ input, headline });
    if (result.status !== "available") throw new Error("invalid fixture");

    const params = { title: headline.text, providerKey: input.providerKey,
      candidateId: input.candidateId, capturedSource: capturedSource(input),
      headline, seal: result.seal, tenantId: input.tenantId,
      workspaceId: input.workspaceId };
    expect(readerPostPresentationV3MatchesCard({ ...params,
      headline: { ...headline, text: "Different headline" } })).toBe(false);
    expect(readerPostPresentationV3MatchesCard({ ...params,
      seal: { ...result.seal, capturedSourceDigest: "0".repeat(64) } })).toBe(false);
  });

  it("publishes only an interest digest and rejects a resealed substitution", () => {
    const input = presentationInput("Supported body late caveat");
    const headline = acceptedHeadline(input, "late caveat");
    const result = sealReaderPostPresentationV3({ input, headline });
    if (result.status !== "available") throw new Error("invalid fixture");
    const publicSeal = publicReaderPostPresentationV3Seal(result.seal);
    expect(JSON.stringify(publicSeal)).not.toContain(input.trustedIntent);
    expect(publicSeal.headline.binding).not.toHaveProperty("trustedIntent");
    const substituted = { ...capturedSource(input), body: "Substituted content" };
    expect(readerPostPresentationV3MatchesCard({
      title: headline.text, providerKey: input.providerKey, candidateId: input.candidateId,
      capturedSource: substituted, headline: publicSeal.headline,
      seal: { ...publicSeal, capturedSourceDigest: promotionPayloadDigest(
        canonicalPromotionPayload(substituted)) }, tenantId: input.tenantId,
      workspaceId: input.workspaceId, trustedIntent: input.trustedIntent,
    })).toBe(false);
  });

  it.each([
    ["claim with subject-only judgment", { kind: "claim", judgment: "subject_only" }],
    ["claim with unreported qualification", { kind: "claim", judgment: "preserved" }],
    ["subject label with claim judgment", { kind: "subject_label", judgment: "none" }],
  ] as const)("rejects %s", (_name, invalid) => {
    const input = presentationInput("Supported body late caveat");
    const headline = acceptedHeadline(input, "late caveat");
    expect(sealReaderPostPresentationV3({ input, headline: {
      ...headline,
      kind: invalid.kind,
      wholeInput: { ...headline.wholeInput,
        qualificationJudgment: invalid.judgment },
    } })).toEqual({ status: "unavailable", reason: "invalid_presentation" });
  });
});

const presentationInput = (body: string): ReaderPostPresentationV3Input => ({
  tenantId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  interestId: "00000000-0000-4000-8000-000000000003",
  candidateId: "00000000-0000-4000-8000-000000000004",
  sourceItemId: "00000000-0000-4000-8000-000000000005",
  sourceBindingId: "00000000-0000-4000-8000-000000000006",
  providerKey: "rss", trustedIntent: "database methods",
  sourceSnapshotSha256: "1".repeat(64), title: "Useful database method",
  body, captureComplete: true,
});

const capturedSource = (input: ReaderPostPresentationV3Input) => ({
  title: input.title, body: input.body,
  captureAvailability: "available" as const,
  reviewAvailability: "body_present" as const,
});

const acceptedHeadline = (input: ReaderPostPresentationV3Input, quote: string,
  qualification = false) => {
  const start = input.body.lastIndexOf(quote);
  const reference = { field: "bodyPreview" as const, start,
    end: start + quote.length, quote };
  const text = qualification ? `Useful method, ${quote}` : "Useful database method";
  return { status: "accepted" as const, kind: "claim" as const, text,
    binding: { candidateId: input.candidateId, providerKey: input.providerKey,
      tenantId: input.tenantId, workspaceId: input.workspaceId,
      interestId: input.interestId, sourceBindingId: input.sourceBindingId,
      sourceItemId: input.sourceItemId, trustedIntent: input.trustedIntent,
      availability: "body_present" as const,
      reviewedInputDigest: promotionPayloadDigest(JSON.stringify({
        candidateId: input.candidateId, providerKey: input.providerKey,
        context: { tenantId: input.tenantId, workspaceId: input.workspaceId,
          interestId: input.interestId, sourceBindingId: input.sourceBindingId,
          sourceItemId: input.sourceItemId, trustedIntent: input.trustedIntent,
          availability: "body_present" }, title: input.title, body: input.body,
      })) }, support: [reference],
    qualifications: qualification ? [{ phrase: quote, evidence: [reference] }] : [],
    confidence: 0.9, wholeInput: { titleLength: input.title.length,
      bodyLength: input.body.length,
      qualificationJudgment: qualification ? "preserved" as const : "none" as const },
  };
};
