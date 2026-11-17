import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";

/** Reject cross-tenant/workspace batches before constructing a paid request. */
export const assertPromotionPresentationBatchScope = (
  inputs: readonly ReaderPostPresentationV3Input[],
): void => {
  const first = inputs[0];
  if (first === undefined) {
    throw new Error("V3 presentation requires a configured batch of 1..4");
  }
  if (inputs.some((candidate) =>
    candidate.tenantId !== first.tenantId ||
    candidate.workspaceId !== first.workspaceId)) {
    // Never echo the scoped identifiers into a diagnostic.
    throw new Error("V3 presentation batch mixes tenant or workspace scopes");
  }
};
