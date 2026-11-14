import { readerPostPresentationV3OutputSchema as baseSchema, readerPostPresentationCandidates } from "../../domain/services/reader-post-presentation-v3-proposal";
import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";
import { mimoQualifiedHeadlineOutputSchema } from "../../domain/services/mimo-qualified-headline-codec";
import { readerPostCanonicalPresentationInstructions } from "./reader-post-canonical-presentation-instructions";
import type { ReaderSummaryGenerationBackend } from "./active-reader-summary-generation-profile";
import { usesSourceCopyOptions, mimoPresentationInstructions } from "./agent-runtime-promotion-presentation-v3-request";

/** Owns provider-specific prompt/schema construction, not tenant-scoped command identity. */
export const buildPromotionPresentationWireContract = (
  inputs: readonly ReaderPostPresentationV3Input[],
  modelBackend: ReaderSummaryGenerationBackend,
) => {
  const prompt = JSON.stringify({ candidates: inputs.map((input) => ({
    candidateId: input.candidateId, title: input.title, sourceText: input.body,
  })) });
  const catalogCandidates = readerPostPresentationCandidates(prompt);
  const sourceCopyWire = usesSourceCopyOptions(modelBackend);
  // Keep Codex's provider-qualified wire schema; narrow copied references per
  // item below, so one invalid sibling does not discard valid presentations.
  const schema = sourceCopyWire ? mimoQualifiedHeadlineOutputSchema(catalogCandidates) : baseSchema;
  const systemPrompt = sourceCopyWire ? mimoPresentationInstructions(catalogCandidates)
    : readerPostCanonicalPresentationInstructions(catalogCandidates);
  return { prompt, catalogCandidates, sourceCopyWire, schema, systemPrompt };
};
