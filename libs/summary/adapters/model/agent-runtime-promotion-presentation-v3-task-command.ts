import { readerPostPresentationV3OutputSchema as baseSchema, readerPostPresentationCandidates } from "../../domain/services/reader-post-presentation-v3-proposal";
import { readerPostCanonicalPresentationInstructions } from "./reader-post-canonical-presentation-instructions";
import { mimoQualifiedHeadlineOutputSchema } from "../../domain/services/mimo-qualified-headline-codec";
import {
  readerPostPresentationV3InputDigest,
  type ReaderPostPresentationV3Input,
} from "../../domain/services/reader-post-presentation-v3";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { canonicalPromotionPayload, promotionPayloadDigest } from
  "../../domain/services/reader-post-promotion-attestation";
import type { AgentRuntimeTaskCommand } from "../../ports";
import { buildAgentRuntimeRequestId } from "./agent-runtime-model-support";
import {
  type activeReaderSummaryProvider,
  mimoReaderSummaryBackend,
  activeReaderSummaryPurposes,
  isGatewayReaderSummaryBackend,
  readerSummaryRouteControls,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";
import { usesSourceCopyOptions, mimoPresentationInstructions } from
  "./agent-runtime-promotion-presentation-v3-request";

export type PresentationTaskRoute = {
  readonly provider: typeof activeReaderSummaryProvider;
  readonly providerInstanceId?: string;
  readonly model: string;
  readonly modelBackend: ReaderSummaryGenerationBackend;
  readonly reasoningEffort: string;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
};

/** Owns immutable, scoped, digest-bound wire contract materialization.
 * Task execution and output attestation deliberately remain in the adapter.
 */
export const createPromotionPresentationTaskCommand = (
  inputs: readonly ReaderPostPresentationV3Input[],
  route: PresentationTaskRoute,
): {
  readonly command: AgentRuntimeTaskCommand;
  readonly catalogCandidates: ReturnType<typeof readerPostPresentationCandidates>;
  readonly sourceCopyWire: boolean;
} => {
  const first = inputs[0]!;
  const prompt = JSON.stringify({ candidates: inputs.map((input) => ({
    candidateId: input.candidateId, title: input.title, sourceText: input.body,
  })) });
  const catalogCandidates = readerPostPresentationCandidates(prompt);
  const sourceCopyWire = usesSourceCopyOptions(route.modelBackend);
  // Keep Codex's provider-qualified wire schema; narrow copied references per
  // item below, so one invalid sibling does not discard valid presentations.
  const schema = sourceCopyWire ? mimoQualifiedHeadlineOutputSchema(catalogCandidates) : baseSchema;
  const systemPrompt = sourceCopyWire ? mimoPresentationInstructions(catalogCandidates)
    : readerPostCanonicalPresentationInstructions(catalogCandidates);
  const requestDigest = promotionPayloadDigest(canonicalPromotionPayload({
    purpose: activeReaderSummaryPurposes.promotionPresentation,
    inputs: inputs.map(readerPostPresentationV3InputDigest),
    systemPrompt, prompt, outputSchema: schema,
    provider: route.provider, providerInstanceId: route.providerInstanceId ?? null,
    model: route.model, reasoningEffort: route.reasoningEffort,
    ...(route.modelBackend === mimoReaderSummaryBackend ||
      isGatewayReaderSummaryBackend(route.modelBackend) ? { modelBackend: route.modelBackend } : {}),
    maxOutputTokens: route.maxOutputTokens,
  }));
  const command: AgentRuntimeTaskCommand = {
    requestId: buildAgentRuntimeRequestId(
      "reader-summary-promotion-presentation", first.tenantId,
      first.workspaceId, requestDigest, new Date(0),
    ),
    tenantId: tenantId(first.tenantId),
    workspaceId: workspaceId(first.workspaceId),
    correlationId: buildAgentRuntimeRequestId(
      "reader-summary-promotion-presentation-correlation", first.tenantId,
      first.workspaceId, requestDigest, new Date(0),
    ),
    provider: route.provider,
    providerInstanceId: route.providerInstanceId,
    purpose: activeReaderSummaryPurposes.promotionPresentation,
    systemPrompt,
    prompt,
    outputSchema: schema,
    controls: {
      interactive: false,
      outputSchemaName: "social_monitor_reader_post_presentation_v3",
      schemaVersion: "reader_post_presentation.v3",
      model: route.model,
      ...(route.modelBackend === mimoReaderSummaryBackend ? { modelBackend: route.modelBackend } : {}),
      ...readerSummaryRouteControls(route.modelBackend, route.reasoningEffort),
      maxOutputTokens: route.maxOutputTokens,
    },
    timeoutMs: route.timeoutMs,
    metadata: { adapter: "agent-runtime-promotion-presentation-v3" },
  };
  return { command, catalogCandidates, sourceCopyWire };
};
