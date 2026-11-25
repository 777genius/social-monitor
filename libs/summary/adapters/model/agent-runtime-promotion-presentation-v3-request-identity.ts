import {
  readerPostPresentationV3InputDigest,
  type ReaderPostPresentationV3Input,
} from "../../domain/services/reader-post-presentation-v3";
import { canonicalPromotionPayload, promotionPayloadDigest } from
  "../../domain/services/reader-post-promotion-attestation";
import { buildAgentRuntimeRequestId } from "./agent-runtime-model-support";
import {
  activeReaderSummaryPurposes,
  type activeReaderSummaryProvider,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";
import type { buildPromotionPresentationWireContract } from "./agent-runtime-promotion-presentation-v3-wire-contract";

type IdentityRoute = Readonly<{
  provider: typeof activeReaderSummaryProvider;
  providerInstanceId?: string;
  model: string;
  modelBackend: ReaderSummaryGenerationBackend;
  reasoningEffort: string;
  maxOutputTokens: number;
}>;
type IdentityWire = Pick<
  ReturnType<typeof buildPromotionPresentationWireContract>,
  "systemPrompt" | "prompt" | "schema" | "sourceCopyWire"
>;

/**
 * Own the deterministic, scope-bound identities of the entire attested request.
 * Deadline and transport do not affect identity; instance and wire format do.
 */
export const promotionPresentationRequestIdentity = (
  inputs: readonly ReaderPostPresentationV3Input[],
  route: IdentityRoute,
  { systemPrompt, prompt, schema, sourceCopyWire }: IdentityWire,
): Readonly<{ requestId: string; correlationId: string }> => {
  const first = inputs[0]!;
  const requestDigest = promotionPayloadDigest(canonicalPromotionPayload({
    purpose: activeReaderSummaryPurposes.promotionPresentation,
    inputs: inputs.map(readerPostPresentationV3InputDigest),
    systemPrompt, prompt, outputSchema: schema,
    provider: route.provider, providerInstanceId: route.providerInstanceId ?? null,
    model: route.model, reasoningEffort: route.reasoningEffort,
    ...(sourceCopyWire ? { modelBackend: route.modelBackend } : {}),
    maxOutputTokens: route.maxOutputTokens,
  }));
  return {
    requestId: buildAgentRuntimeRequestId(
      "reader-summary-promotion-presentation", first.tenantId,
      first.workspaceId, requestDigest, new Date(0),
    ),
    correlationId: buildAgentRuntimeRequestId(
      "reader-summary-promotion-presentation-correlation", first.tenantId,
      first.workspaceId, requestDigest, new Date(0),
    ),
  };
};
