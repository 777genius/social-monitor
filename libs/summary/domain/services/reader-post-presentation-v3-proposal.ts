import { isDisplayRoundTripText, displayHeadlineContentFailure, type DisplayHeadlineContentFailure } from "./reader-post-display-headline";
import { READER_POST_PRESENTATION_V3_MAX_BODY_UTF16, READER_POST_PRESENTATION_V3_MAX_TITLE_UTF16,
  READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES } from "./reader-post-presentation-v3";

export type ReaderPostPresentationCandidate = Readonly<{ candidateId: string; title: string; sourceText: string }>;

/** Freeze only the genuine model-visible source projection, without inventing publication bindings. */
export const readerPostPresentationCandidates = (prompt: string): readonly ReaderPostPresentationCandidate[] => {
  if (Buffer.byteLength(prompt, "utf8") > READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES) {
    throw new Error("Invalid presentation source projection");
  }
  const root: unknown = JSON.parse(prompt);
  if (!exact(root, ["candidates"]) || !Array.isArray(root.candidates) ||
      root.candidates.length < 1 || root.candidates.length > 4) throw new Error("Invalid presentation source projection");
  const ids = new Set<string>();
  const candidates = root.candidates.map((candidate: unknown) => {
    if (!exact(candidate, ["candidateId", "title", "sourceText"]) ||
        typeof candidate.candidateId !== "string" || !candidate.candidateId.trim() || ids.has(candidate.candidateId) ||
        typeof candidate.title !== "string" || candidate.title.length > READER_POST_PRESENTATION_V3_MAX_TITLE_UTF16 ||
        typeof candidate.sourceText !== "string" || candidate.sourceText.length > READER_POST_PRESENTATION_V3_MAX_BODY_UTF16 ||
        !isDisplayRoundTripText(candidate.title) || !isDisplayRoundTripText(candidate.sourceText)) {
      throw new Error("Invalid presentation source projection");
    }
    ids.add(candidate.candidateId);
    return Object.freeze({ candidateId: candidate.candidateId, title: candidate.title, sourceText: candidate.sourceText });
  });
  return Object.freeze(candidates);
};

export type ReaderPostPresentationProposalFailure = Readonly<{
  code: DisplayHeadlineContentFailure | "proposal_cardinality" | "proposal_shape_or_identity" | "proposal_fields";
  index?: number;
}>;
export const validReaderPostPresentationProposals = (
  output: unknown, candidates: readonly ReaderPostPresentationCandidate[],
): boolean => readerPostPresentationProposalFailure(output, candidates) === null;

/** Validate proposals against the original full source; this does not create or certify a publication seal. */
export const readerPostPresentationProposalFailure = (
  output: unknown, candidates: readonly ReaderPostPresentationCandidate[],
): ReaderPostPresentationProposalFailure | null => {
  if (!exact(output, ["presentations"]) || !Array.isArray(output.presentations) ||
      output.presentations.length !== candidates.length || candidates.length < 1 || candidates.length > 4) return { code: "proposal_cardinality" };
  const byId = new Map(candidates.map(candidate => [candidate.candidateId, candidate]));
  const seen = new Set<string>();
  for (const [index, proposal] of output.presentations.entries()) {
    if (!exact(proposal, ["candidateId", "status", "kind", "text", "support", "qualifications", "confidence", "qualificationJudgment"]) ||
        typeof proposal.candidateId !== "string" || seen.has(proposal.candidateId)) return { code: "proposal_shape_or_identity", index };
    const source = byId.get(proposal.candidateId);
    if (source === undefined) return { code: "proposal_shape_or_identity", index };
    seen.add(proposal.candidateId);
    if ((proposal.status !== "available" && proposal.status !== "unavailable") ||
        (proposal.kind !== "claim" && proposal.kind !== "subject_label") ||
        typeof proposal.text !== "string" || proposal.text.length > 119 ||
        typeof proposal.confidence !== "number" || !Number.isFinite(proposal.confidence) ||
        proposal.confidence < 0 || proposal.confidence > 1 ||
        !["none", "preserved", "subject_only"].includes(String(proposal.qualificationJudgment)) ||
        !Array.isArray(proposal.support) || proposal.support.length > 8 ||
        !proposal.support.every(validReference) || !Array.isArray(proposal.qualifications) ||
        proposal.qualifications.length > 8 || !proposal.qualifications.every(qualification =>
          exact(qualification, ["phrase", "evidence"]) && typeof qualification.phrase === "string" &&
          qualification.phrase.length <= 119 && Array.isArray(qualification.evidence) &&
          qualification.evidence.length > 0 && qualification.evidence.length <= 8 && qualification.evidence.every(validReference))) return { code: "proposal_fields", index };
    if (proposal.status === "unavailable") continue;
    const code = displayHeadlineContentFailure({ kind: proposal.kind, text: proposal.text, support: proposal.support,
      qualifications: proposal.qualifications, confidence: proposal.confidence,
      qualificationJudgment: proposal.qualificationJudgment }, {
      title: source.title, body: source.sourceText, captureAvailability: "available",
      reviewAvailability: source.sourceText.trim() ? "body_present" : "title_only",
    }, READER_POST_PRESENTATION_V3_MAX_BODY_UTF16);
    if (code !== null) return { code, index };
  }
  return null;
};

const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const validReference = (value: unknown): boolean => exact(value, ["field", "start", "end", "quote"]) &&
  (value.field === "title" || value.field === "bodyPreview") && typeof value.start === "number" &&
  typeof value.end === "number" && Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) &&
  value.start >= 0 && value.end > value.start && typeof value.quote === "string" &&
  value.quote.length > 0 && value.quote.length <= 256 && isDisplayRoundTripText(value.quote);

const reference = { type: "object", additionalProperties: false,
  required: ["field", "start", "end", "quote"], properties: {
    field: { type: "string", enum: ["title", "bodyPreview"] },
    start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 1 },
    quote: { type: "string", minLength: 1, maxLength: 256 } } };
export const readerPostPresentationV3OutputSchema = { type: "object", additionalProperties: false,
  required: ["presentations"], properties: { presentations: { type: "array",
    minItems: 1, maxItems: 4, items: { type: "object", additionalProperties: false,
      required: ["candidateId", "status", "kind", "text", "support", "qualifications", "confidence", "qualificationJudgment"], properties: {
        candidateId: { type: "string" }, status: { type: "string", enum: ["available", "unavailable"] },
        kind: { type: "string", enum: ["claim", "subject_label"] }, text: { type: "string", maxLength: 119 },
        support: { type: "array", maxItems: 8, items: reference }, qualifications: { type: "array", maxItems: 8,
          items: { type: "object", additionalProperties: false, required: ["phrase", "evidence"], properties: {
            phrase: { type: "string", maxLength: 119 }, evidence: { type: "array", minItems: 1, maxItems: 8, items: reference } } } },
        confidence: { type: "number", minimum: 0, maximum: 1 }, qualificationJudgment: { type: "string", enum: ["none", "preserved", "subject_only"] } } } } } };
