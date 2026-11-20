export const assertPresentationShape = (proposal: Record<string, unknown>): void => {
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
