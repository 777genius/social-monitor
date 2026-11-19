import type { SummaryEvidenceItem } from "../../domain";
import { compactText } from "./openai-responses-reader-summary-fragment-chunking";

/** Keep untrusted quality diagnostics bounded and separate from source evidence mapping. */
export const projectReaderSummaryContentQuality = (
  item: SummaryEvidenceItem,
): Record<string, unknown> | undefined =>
  item.contentQuality === undefined
    ? undefined
    : {
        decision: item.contentQuality.decision,
        reason: compactText(item.contentQuality.reason, 140),
        flags: item.contentQuality.flags.slice(0, 6),
        eligibleForTopRead: item.contentQuality.eligibleForTopRead,
        qualityScore: item.contentQuality.qualityScore,
        interestRelevanceScore: item.contentQuality.interestRelevanceScore,
        engagementIntegrityScore:
          item.contentQuality.engagementIntegrityScore,
      };
