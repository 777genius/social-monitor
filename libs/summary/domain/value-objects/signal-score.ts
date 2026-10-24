import type { SummaryEvidenceContentQuality } from "./summary-evidence-item";

export type SignalScore = number;

export const normalizeSignalScore = (value: number): SignalScore =>
  Number.isFinite(value) && value > 0 ? Number(value.toFixed(3)) : 0;

export const engagementOrContentStrengthSignalScore = (params: {
  readonly engagementStrength?: number;
  readonly contentQuality?: SummaryEvidenceContentQuality;
}): number => {
  const engagement = params.engagementStrength ?? 0;
  if (engagement > 0) {
    return normalizeSignalScore(engagement);
  }
  const quality = params.contentQuality;
  return quality === undefined
    ? 0
    : normalizeSignalScore(
        (10 *
          (0.3 * quality.interestRelevanceScore +
            0.15 * quality.qualityScore +
            0.1 * quality.engagementIntegrityScore)) /
          0.55,
      );
};

export const clampConfidenceScore = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
