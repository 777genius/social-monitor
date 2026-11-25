import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { AgentRuntimeTaskCommand } from "../../ports";
import { buildPromotionPresentationWireContract } from "./agent-runtime-promotion-presentation-v3-wire-contract";
import { assertPromotionPresentationBatchScope } from "./promotion-presentation-batch-scope";
import { promotionPresentationRequestIdentity } from "./agent-runtime-promotion-presentation-v3-request-identity";
import {
  type activeReaderSummaryProvider,
  mimoReaderSummaryBackend,
  activeReaderSummaryPurposes,
  readerSummaryRouteControls,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";

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
  readonly catalogCandidates: ReturnType<typeof buildPromotionPresentationWireContract>["catalogCandidates"];
  readonly sourceCopyWire: boolean;
} => {
  assertPromotionPresentationBatchScope(inputs);
  const first = inputs[0]!;
  const { prompt, catalogCandidates, sourceCopyWire, schema, systemPrompt } =
    buildPromotionPresentationWireContract(inputs, route.modelBackend);
  const { requestId, correlationId } = promotionPresentationRequestIdentity(
    inputs, route, { systemPrompt, prompt, schema, sourceCopyWire },
  );
  const command: AgentRuntimeTaskCommand = {
    requestId,
    tenantId: tenantId(first.tenantId),
    workspaceId: workspaceId(first.workspaceId),
    correlationId,
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
