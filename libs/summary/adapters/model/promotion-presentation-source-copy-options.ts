import type { ReaderPostPresentationCandidate } from "../../domain/services/reader-post-presentation-v3-proposal";
import { readerPostPresentationReferenceCatalog } from "../../domain/services/reader-post-presentation-reference-catalog";

/**
 * Single source-of-truth for model-visible, machine-derived copy affordances.
 * Both the canonical and source-copy prompts must serialize identical,
 * ordered candidate catalogs; neither may re-interpret untrusted evidence.
 */
export const promotionPresentationSourceCopyOptionsJson = (
  inputs: readonly ReaderPostPresentationCandidate[],
): string =>
  JSON.stringify(inputs.map(input => ({
    candidateId: input.candidateId,
    references: readerPostPresentationReferenceCatalog(input),
  })));
