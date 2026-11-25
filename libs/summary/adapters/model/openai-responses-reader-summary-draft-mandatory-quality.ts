import type { GeneratedReaderSummaryDraft, ReaderSummaryQualityFlag } from "../../domain";
import { asRecord } from "./openai-responses-reader-summary-raw-values";
import { uniqueNonEmptyStrings } from "./openai-responses-reader-summary-text-values";
import {
  normalizeConfidence,
  normalizeQualityFlags,
} from "./openai-responses-reader-summary-quality";

/** Always validate quality and confidence, irrespective of optional publication switches. */
export const normalizeOpenAiReaderSummaryMandatoryQuality = (
  raw: Record<string, unknown>,
  topStoryCount: number,
): {
  readonly normalizedQualityFlags: GeneratedReaderSummaryDraft["qualityFlags"];
  readonly confidence: GeneratedReaderSummaryDraft["confidence"];
} => {
  const rawQualityFlags = normalizeQualityFlags(raw.qualityFlags);
  const normalizedQualityFlags =
    topStoryCount === 0
      ? (uniqueNonEmptyStrings([
          ...rawQualityFlags,
          "no_signal",
          "limited_sources",
        ]) as readonly ReaderSummaryQualityFlag[])
      : rawQualityFlags.filter((flag) => flag !== "no_signal");
  const confidence = normalizeConfidence(
    asRecord(raw.confidence) ?? {},
    topStoryCount,
  );
  return { normalizedQualityFlags, confidence };
};
