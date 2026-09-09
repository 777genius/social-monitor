import { assessPromotionReaderHeadline } from "@social-monitor/relevance/features/rank-feed-items/promotion-reader-headline-assessment";
import { headlineRequest, headlineReview, reference } from "../../../../../test/support/promotion-reader-headline";
import { ReaderSummaryArtifact } from "../../../domain";
import type { SummaryHeadlineReference, SummaryReaderHeadline } from "../../../domain/value-objects/summary-reader-headline";
import { readerPostDisplayHeadline } from "../../../domain/services/reader-post-display-headline";
import { canonicalPromotionPayload, promotionPayloadDigest } from "../../../domain/services/reader-post-promotion-attestation";
import { readerDisplayPublicationFindings } from "../../../domain/policies/reader-summary-display-publication";
import { assessedSource } from "../../evidence/reader-headline.spec-support";
import { headlineArtifact, headlineArtifactProps, headlineFallback } from "./reader-headline-artifact.spec-support";
import { serializeReaderSummaryArtifact } from "./prisma-reader-summary-json";
import { normalizeReaderSummaryArtifactPayload } from "./prisma-reader-summary-artifact-payload";

// Exercise the actual upstream validator with the exact identity consumed by projection.
const scenario = (body: string, title = "Orion benchmark findings") => {
  const lead = assessedSource(body, "Orion benchmark discussion");
  const accepted = lead.readerHeadline;
  if (accepted?.status !== "accepted") throw new Error("fixture");
  const { candidateId, providerKey, reviewedInputDigest, ...promotion } = accepted.binding;
  void reviewedInputDigest;
  const request = { ...headlineRequest(body, title), candidateId, providerKey, promotion };
  const proposal = { status: "available", kind: "claim", text: accepted.text,
    confidence: 0.95, support: [reference(request, title, "title")],
    qualifications: [] as { phrase: string; evidence: SummaryHeadlineReference[] }[],
    wholeInput: { titleLength: title.length, bodyLength: body.length, qualificationJudgment: "none" } };
  return { lead: { ...lead, title }, request, proposal };
};
type Scenario = ReturnType<typeof scenario>;
const envelope = ({ lead, request, proposal }: Scenario) => {
  const review = headlineReview(request, proposal);
  const readerHeadline = { ...proposal, status: "accepted", binding: { ...request.promotion,
    candidateId: request.candidateId, providerKey: request.providerKey,
    reviewedInputDigest: review.assessment.headlineInput!.reviewedInputDigest } } as SummaryReaderHeadline;
  return { ...lead, readerHeadline };
};
const load = (artifact: ReaderSummaryArtifact, payload = serializeReaderSummaryArtifact(artifact)) =>
  ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(payload, headlineFallback(artifact)));

// Recreate a stored accepted envelope with consistent canonical bytes. This tests
// structural revalidation, rather than merely detecting an unrecomputed digest.
const persistedEnvelope = (s: Scenario) => {
  const artifact = headlineArtifact(s.lead);
  const payload = structuredClone(serializeReaderSummaryArtifact(artifact)) as Record<string, any>;
  const card = payload.content.topReads[0];
  card.title = s.proposal.text;
  card.displayHeadline = envelope(s).readerHeadline;
  const seal = payload.promotionAttestations[0];
  seal.displayHeadline = { headline: card.displayHeadline,
    capturedSourceDigest: promotionPayloadDigest(canonicalPromotionPayload(card.capturedSource)) };
  const { digest, canonicalPayload, ...material } = seal;
  void digest; void canonicalPayload;
  seal.canonicalPayload = canonicalPromotionPayload(material);
  seal.digest = promotionPayloadDigest(seal.canonicalPayload);
  return { artifact, payload };
};

describe("summary reference parity and persisted acceptance", () => {
  it.each([
    ["support", "\ud83d"], ["support", "\ude80"],
    ["qualification", "\ud83d"], ["qualification", "\ude80"],
  ])("rejects upstream-accepted split surrogate %s %j before sealing, preserving full source", (role, quote) => {
    const s = scenario("Orion benchmark 🚀 findings.");
    const ref = reference(s.request, quote);
    if (role === "support") s.proposal.support.push(ref);
    else {
      s.proposal.qualifications = [{ phrase: "benchmark", evidence: [ref] }];
      s.proposal.wholeInput.qualificationJudgment = "preserved";
    }
    const upstream = assessPromotionReaderHeadline(s.request, headlineReview(s.request, s.proposal));
    expect(upstream.status).toBe("accepted");
    expect(upstream).toEqual(envelope(s).readerHeadline);
    const lead = { ...s.lead, readerHeadline: upstream };
    expect(readerPostDisplayHeadline(lead).status).toBe("unavailable");
    const artifact = headlineArtifact(lead);
    const snapshot = artifact.toSnapshot();
    expect(snapshot.content!.topReads).toHaveLength(1);
    expect(snapshot.content!.topReads[0]!.promotionCandidateId).toBe(lead.feedItemId);
    expect(snapshot.content!.topReads[0]!.displayHeadline?.status).toBe("unavailable");
    expect(snapshot.promotionAttestations?.[0]).toMatchObject({ displayHeadline: { headline: { status: "unavailable" } } });
    expect(readerDisplayPublicationFindings(snapshot, headlineArtifactProps(lead).evidence)).toHaveLength(1);
    const loaded = load(artifact).toSnapshot();
    expect(loaded.content!.topReads[0]!.capturedSource).toEqual(snapshot.content!.topReads[0]!.capturedSource);
    expect(loaded.content!.topReads[0]!.capturedSource).toMatchObject({ title: lead.title, body: lead.sourceText });
    expect(loaded.promotionAttestations).toEqual(snapshot.promotionAttestations);
    const stored = persistedEnvelope(s);
    expect(() => load(stored.artifact, stored.payload)).toThrow();
  });

  const tokenCases = ["OrionFake benchmarking note.", ...["𐐀", "\u0301", "2", "_", "-", "\u200d", ".", "+", "−", "'", "’"]
    .flatMap((joiner) => [`${joiner}Orion benchmark note`, `Orion${joiner} benchmark note`,
      `Orion ${joiner}benchmark note`, `Orion benchmark${joiner} note`, `Orion v1${joiner} benchmark note`, `Orion ${joiner}v1 benchmark note`])];
  it.each(tokenCases)("matches upstream whole-token rejection: %s", (title) => {
    const s = scenario(title, title);
    s.proposal.kind = "subject_label";
    s.proposal.support = [reference(s.request, "Orion", "title"),
      ...(title.includes("v1") ? [reference(s.request, "v1", "title")] : []), reference(s.request, "benchmark", "title")];
    s.proposal.text = title.includes("v1") ? "Orion v1 benchmark discussion" : "Orion benchmark discussion";
    s.proposal.wholeInput.qualificationJudgment = "subject_only";
    expect(assessPromotionReaderHeadline(s.request, headlineReview(s.request, s.proposal))).toEqual({ status: "unavailable", reasonCode: "insufficient_support" });
    expect(readerPostDisplayHeadline(envelope(s)).status).toBe("unavailable");
    const stored = persistedEnvelope(s);
    expect(() => load(stored.artifact, stored.payload)).toThrow();
  });

  it.each([
    ["per quote 256", 256, 1, "x", true], ["per quote 257", 257, 1, "x", false],
    ["aggregate 512", 256, 2, "x", true], ["aggregate 513", 171, 3, "x", false],
    ["serialized 1024", 127, 4, '"', true], ["serialized 1026", 170, 3, '"', false],
    ["occurrences 8", 5, 8, "x", true], ["occurrences 9", 5, 9, "x", false],
    ["whitespace only", 3, 1, " ", false],
    ["Unicode whitespace only", 3, 1, "\u00a0", false],
    ["quoted whitespace preserved", 1, 1, " benchmark ", true],
    ["astral 256 UTF16", 128, 1, "🚀", true], ["astral 258 UTF16", 129, 1, "🚀", false],
  ] as const)("enforces %s without repair at consumer and persisted boundaries", (_name, length, count, character, allowed) => {
    const quote = character.repeat(length);
    const s = scenario(`Orion benchmark ${quote} findings.`);
    const ref = reference(s.request, quote);
    s.proposal.support = [ref];
    s.proposal.text = "Orion benchmark preliminary findings";
    const phrases = ["Orion", "benchmark", "preliminary", "findings", "Orion benchmark", "benchmark preliminary", "preliminary findings", "Orion benchmark preliminary"];
    s.proposal.qualifications = phrases.slice(0, count - 1).map((phrase) => ({ phrase, evidence: [ref] }));
    s.proposal.wholeInput.qualificationJudgment = count > 1 ? "preserved" : "none";
    const upstream = assessPromotionReaderHeadline(s.request, headlineReview(s.request, s.proposal));
    expect(upstream.status).toBe(allowed ? "accepted" : "unavailable");
    const lead = envelope(s);
    expect(readerPostDisplayHeadline(lead).status).toBe(allowed ? "accepted" : "unavailable");
    const stored = persistedEnvelope(s);
    if (allowed) {
      expect(upstream).toEqual(lead.readerHeadline);
      expect(load(stored.artifact, stored.payload).toSnapshot().content!.topReads[0]!.displayHeadline).toEqual(upstream);
      expect(load(headlineArtifact({ ...s.lead, readerHeadline: upstream })).toSnapshot().content!.topReads[0]!.displayHeadline).toEqual(upstream);
    } else expect(() => load(stored.artifact, stored.payload)).toThrow();
  });
});
