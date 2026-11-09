import type {
  ReaderSummaryModelBudget,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelPolicy,
} from "../../ports";
import { primaryReaderSummaryEvidence } from "../../domain";

/** Local estimates are deterministic and never initiate provider calls. */
export const estimateDeterministicReaderSummaryTokens = (
  input: ReaderSummaryModelInput,
): ReaderSummaryModelEstimate => {
  const evidenceTextLength = primaryReaderSummaryEvidence(
    input.evidence,
  ).selectedEvidence.reduce(
    (total, item) =>
      total + item.title.length + (item.bodyPreview?.length ?? 0),
    0,
  );
  const contextTextLength = input.contextArtifacts.reduce(
    (total, artifact) => total + artifact.summaryText.length,
    0,
  );
  const inputTokens = Math.ceil((evidenceTextLength + contextTextLength) / 4);
  const outputTokens =
    primaryReaderSummaryEvidence(input.evidence).selectedEvidence.length === 0
      ? 64
      : 260;

  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: 0,
  };
};

/** Preserve all five policy and remaining-budget limits, including equality admission. */
export const assertDeterministicReaderSummaryBudget = (
  estimate: ReaderSummaryModelEstimate,
  policy: ReaderSummaryModelPolicy,
  budget: ReaderSummaryModelBudget,
): void => {
  if (
    estimate.inputTokens > policy.maxInputTokens ||
    estimate.outputTokens > policy.maxOutputTokens ||
    estimate.estimatedCostUsd > policy.maxEstimatedCostUsd ||
    estimate.inputTokens + estimate.outputTokens > budget.remainingTokens ||
    estimate.estimatedCostUsd > budget.remainingCostUsd
  ) {
    throw new Error("Reader summary model budget exceeded");
  }
};
