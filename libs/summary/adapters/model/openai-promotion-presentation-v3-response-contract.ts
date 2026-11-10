import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";

export const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("V3 presentation item is invalid");
  }
  return value as Record<string, unknown>;
};

const validatedPresentationBatch = (
  value: unknown,
  inputs: readonly ReaderPostPresentationV3Input[],
): ReadonlyMap<string, Record<string, unknown>> => {
  if (!Array.isArray(value) || value.length !== inputs.length) {
    throw new Error("V3 presentation returned an invalid batch");
  }
  const requested = new Set(inputs.map((input) => input.candidateId));
  const proposals = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    const proposal = record(item);
    assertPresentationShape(proposal);
    const candidateId = proposal.candidateId as string;
    if (!requested.has(candidateId) || proposals.has(candidateId)) {
      throw new Error("V3 presentation returned an invalid candidate identity");
    }
    proposals.set(candidateId, proposal);
  }
  if (proposals.size !== requested.size ||
      [...requested].some((candidateId) => !proposals.has(candidateId))) {
    throw new Error("V3 presentation returned an incomplete candidate batch");
  }
  return proposals;
};

export const validatedPresentationRoot = (
  value: unknown,
  inputs: readonly ReaderPostPresentationV3Input[],
): ReadonlyMap<string, Record<string, unknown>> => {
  const root = record(value);
  const keys = Object.keys(root);
  if (keys.length !== 1 || keys[0] !== "presentations") {
    throw new Error("V3 presentation response root violates the response contract");
  }
  return validatedPresentationBatch(root.presentations, inputs);
};

const assertPresentationShape = (proposal: Record<string, unknown>): void => {
  const keys = Object.keys(proposal).sort();
  const expected = ["candidateId", "confidence", "kind", "qualificationJudgment",
    "qualifications", "status", "support", "text"].sort();
  const validScalar = typeof proposal.candidateId === "string" &&
    (proposal.status === "available" || proposal.status === "unavailable") &&
    (proposal.kind === "claim" || proposal.kind === "subject_label") &&
    typeof proposal.text === "string" && proposal.text.length <= 119 &&
    typeof proposal.confidence === "number" && Number.isFinite(proposal.confidence) &&
    proposal.confidence >= 0 && proposal.confidence <= 1 &&
    ["none", "preserved", "subject_only"].includes(
      proposal.qualificationJudgment as string);
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) ||
      !validScalar || !validReferences(proposal.support) ||
      !Array.isArray(proposal.qualifications) || proposal.qualifications.length > 8 ||
      !proposal.qualifications.every(validQualification)) {
    throw new Error("V3 presentation item violates the response contract");
  }
};

const validQualification = (value: unknown): boolean => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).sort().join(",") === "evidence,phrase" &&
    typeof item.phrase === "string" && item.phrase.length <= 119 &&
    validReferences(item.evidence, true);
};

const validReferences = (value: unknown, nonEmpty = false): boolean =>
  Array.isArray(value) && value.length <= 8 && (!nonEmpty || value.length > 0) &&
  value.every((reference) => {
    if (reference === null || typeof reference !== "object" ||
        Array.isArray(reference)) return false;
    const item = reference as Record<string, unknown>;
    return Object.keys(item).sort().join(",") === "end,field,quote,start" &&
      (item.field === "title" || item.field === "bodyPreview") &&
      Number.isSafeInteger(item.start) && Number.isSafeInteger(item.end) &&
      (item.start as number) >= 0 && (item.end as number) >= 1 &&
      typeof item.quote === "string" && item.quote.length > 0 && item.quote.length <= 256;
  });
