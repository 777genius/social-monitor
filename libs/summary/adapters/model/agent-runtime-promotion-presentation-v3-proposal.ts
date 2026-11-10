import type { ReaderDisplayHeadline } from "../../domain";
import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";
import { promotionPayloadDigest } from "../../domain/services/reader-post-promotion-attestation";

/**
 * The proposals that keep the canonical contract, by candidate. A completed
 * task already passed the strict schema, so what is left here are slips the
 * schema cannot rule out: an unknown or repeated candidateId (ids are plain
 * strings), or a text over 119 UTF-16 units that the schema counted as at
 * most 119 code points. Such a slip used to throw and fail the whole day as
 * a dependency outage; now only the affected candidates are
 * invalid_presentation, like any other rejected headline, and every other
 * proposal still has to pass the seal.
 */
export const contractProposals = (value: unknown, inputs: readonly ReaderPostPresentationV3Input[]) => {
  const requested = new Set(inputs.map((input) => input.candidateId));
  const result = new Map<string, Record<string, unknown>>();
  const answered = new Set<string>();
  for (const item of Array.isArray(value) ? value : []) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const proposal = item as Record<string, unknown>;
    const id = proposal.candidateId;
    if (typeof id !== "string" || !requested.has(id)) continue;
    // A candidate answered twice has no trustworthy proposal.
    if (answered.has(id)) {
      result.delete(id);
      continue;
    }
    answered.add(id);
    if (validProposal(proposal)) result.set(id, proposal);
  }
  return result;
};

const validProposal = (value: Record<string, unknown>): boolean =>
  Object.keys(value).sort().join(",") ===
    "candidateId,confidence,kind,qualificationJudgment,qualifications,status,support,text" &&
  (value.status === "available" || value.status === "unavailable") &&
  (value.kind === "claim" || value.kind === "subject_label") &&
  typeof value.text === "string" && value.text.length <= 119 &&
  typeof value.confidence === "number" && Number.isFinite(value.confidence) &&
  value.confidence >= 0 && value.confidence <= 1 &&
  ["none", "preserved", "subject_only"].includes(value.qualificationJudgment as string) &&
  validReferences(value.support) && Array.isArray(value.qualifications) &&
  value.qualifications.length <= 8 && value.qualifications.every(validQualification);

const validQualification = (value: unknown): boolean => value !== null &&
  typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === "evidence,phrase" &&
  typeof (value as Record<string, unknown>).phrase === "string" &&
  validReferences((value as Record<string, unknown>).evidence, true);

const validReferences = (value: unknown, nonEmpty = false): boolean =>
  Array.isArray(value) && value.length <= 8 && (!nonEmpty || value.length > 0) &&
  value.every((reference) => reference !== null && typeof reference === "object" &&
    !Array.isArray(reference) && Object.keys(reference).sort().join(",") ===
      "end,field,quote,start" && ((reference as Record<string, unknown>).field === "title" ||
      (reference as Record<string, unknown>).field === "bodyPreview") &&
    Number.isSafeInteger((reference as Record<string, unknown>).start) &&
    Number.isSafeInteger((reference as Record<string, unknown>).end) &&
    typeof (reference as Record<string, unknown>).quote === "string");

export const bind = (input: ReaderPostPresentationV3Input,
  proposal: Record<string, unknown>): ReaderDisplayHeadline => ({
  status: "accepted", kind: proposal.kind as "claim" | "subject_label",
  text: proposal.text as string,
  binding: { candidateId: input.candidateId, providerKey: input.providerKey,
    tenantId: input.tenantId, workspaceId: input.workspaceId,
    interestId: input.interestId, sourceBindingId: input.sourceBindingId,
    sourceItemId: input.sourceItemId, trustedIntent: input.trustedIntent,
    availability: input.body.trim() ? "body_present" : "title_only",
    reviewedInputDigest: promotionPayloadDigest(JSON.stringify({
      candidateId: input.candidateId, providerKey: input.providerKey,
      context: { tenantId: input.tenantId, workspaceId: input.workspaceId,
        interestId: input.interestId, sourceBindingId: input.sourceBindingId,
        sourceItemId: input.sourceItemId, trustedIntent: input.trustedIntent,
        availability: input.body.trim() ? "body_present" : "title_only" },
      title: input.title, body: input.body,
    })) }, support: proposal.support as never,
  qualifications: proposal.qualifications as never,
  confidence: proposal.confidence as number,
  wholeInput: { titleLength: input.title.length, bodyLength: input.body.length,
    qualificationJudgment: proposal.qualificationJudgment as "none" | "preserved" | "subject_only" },
});
