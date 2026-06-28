import type { SourceMixEntry } from "../entities/source-mix-entry";
import type { TopRead } from "../entities/top-read";
import type { ReaderSummaryQualityFlag } from "../value-objects/summary-quality";

export const buildOpenQuestions = (
  qualityFlags: readonly ReaderSummaryQualityFlag[],
  sourceMix: readonly SourceMixEntry[],
  topReads: readonly TopRead[],
): readonly string[] => {
  const questions: string[] = [];
  if (qualityFlags.includes("limited_sources")) {
    questions.push(
      "Is this signal confirmed outside the currently monitored sources?",
    );
  }
  if (sourceMix.length === 1) {
    questions.push(
      `Is this signal confirmed outside ${providerNameForKey(sourceMix[0]?.providerKey, topReads)}?`,
    );
  }
  if (
    sourceMix.length > 1 &&
    sourceMix.every((source) => source.singleSourceOnly)
  ) {
    questions.push(
      "Which top reads need confirmation from another monitored source?",
    );
  }
  if (qualityFlags.includes("conflicting_evidence")) {
    questions.push(
      "Which source is the most reliable when evidence conflicts?",
    );
  }
  if (qualityFlags.includes("context_unavailable")) {
    questions.push(
      "Did missing context change the interpretation of this summary?",
    );
  }

  return questions;
};

export const providerNameForKey = (
  providerKey: string | undefined,
  topReads: readonly TopRead[],
): string => {
  if (providerKey === undefined) {
    return "the current source";
  }

  return (
    topReads.find((item) => item.providerKey === providerKey)?.providerName ??
    providerKey
  );
};
