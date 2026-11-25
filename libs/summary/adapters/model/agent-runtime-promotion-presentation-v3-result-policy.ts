import { readerPostPresentationCatalogReferenceFailure,
  type ReaderPostPresentationCatalogReferences } from "../../domain/services/reader-post-presentation-reference-catalog";
import type { readerPostPresentationCandidates } from "../../domain/services/reader-post-presentation-v3-proposal";
import { decodeReaderPostPresentationBatch } from "../../domain/services/reader-post-presentation-batch-decode";
import {
  sealReaderPostPresentationV3,
  type ReaderPostPresentationV3Input,
  type ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import { contractProposals, bind } from "./agent-runtime-promotion-presentation-v3-proposal";

// Preserve the legacy API with the identical policy function object.
export { runtimePresentationValidationRejection } from "./agent-runtime-promotion-presentation-v3-runtime-output-rejection";

/**
 * Per-candidate contract acceptance is pure: an invalid sibling must not
 * contaminate a valid story. Provider output reaches this policy only after
 * runtime/attestation checks and strict object decoding in the task adapter.
 */
export const completedPromotionPresentationResults = (params: {
  readonly rawOutput: Record<string, unknown>;
  readonly inputs: readonly ReaderPostPresentationV3Input[];
  readonly catalogCandidates: ReturnType<typeof readerPostPresentationCandidates>;
  readonly sourceCopyWire: boolean;
}): readonly ReaderPostPresentationV3Result[] => {
  const { rawOutput, inputs, catalogCandidates, sourceCopyWire } = params;
  const decoded = sourceCopyWire ? decodeReaderPostPresentationBatch(rawOutput, catalogCandidates) : undefined;
  const proposals = decoded === undefined ? contractProposals(rawOutput.presentations, inputs) :
    new Map(decoded.flatMap((row) => row.proposal === undefined ? [] :
      [[row.candidateId, row.proposal] as const]));
  const failures = new Map(decoded?.flatMap((row) => row.failure === undefined ? [] :
    [[row.candidateId, row.failure] as const]));
  return inputs.map((input, index): ReaderPostPresentationV3Result => {
    const proposal = proposals.get(input.candidateId);
    if (proposal === undefined) return { status: "unavailable", reason: "invalid_presentation",
      validation: { stage: decoded === undefined ? "proposal_contract" : "source_copy_decode",
        code: failures.get(input.candidateId)?.code ?? "proposal_missing_or_invalid" } };
    // contractProposals already checked the canonical reference-array shape.
    const catalogFailure = sourceCopyWire ? null : readerPostPresentationCatalogReferenceFailure(
      proposal as unknown as ReaderPostPresentationCatalogReferences, catalogCandidates[index]!);
    if (catalogFailure !== null) return { status: "unavailable", reason: "invalid_presentation",
      validation: { stage: "proposal_contract", code: catalogFailure } };
    if (proposal.status === "unavailable") {
      return { status: "unavailable", reason: "insufficient_support" };
    }
    return sealReaderPostPresentationV3({ input, headline: bind(input, proposal) });
  });
};
