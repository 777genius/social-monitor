import type { PromotionEvidenceReference } from "../../domain/promotion-reader-headline";
import type { SourceContentQualityReviewRequest } from "../../ports";

// Preserve the original quality-verdict reference algorithm exactly. Headline
// validation adds strict own-key and duplicate checks independently.
export const validPromotionReferences = (
  request: SourceContentQualityReviewRequest, refs: readonly PromotionEvidenceReference[],
): boolean => Array.isArray(refs) && refs.length > 0 && refs.length <= 8 &&
  refs.every((ref: PromotionEvidenceReference) => {
    if (ref === null || typeof ref !== "object" ||
        (ref.field !== "title" && ref.field !== "bodyPreview")) return false;
    const text = request[ref.field] ?? "";
    return Number.isSafeInteger(ref.start) && Number.isSafeInteger(ref.end) &&
      ref.start >= 0 && ref.end > ref.start && ref.end <= text.length &&
      typeof ref.quote === "string" && ref.quote.trim().length > 0 &&
      ref.quote === text.slice(ref.start, ref.end);
  });
