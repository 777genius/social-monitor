import { resolveReaderSummaryBackendSelectionFromEnv } from "./reader-summary-backend-selection";
import { gatewayRouteModel, resolveGatewayReaderSummaryRoute } from "./reader-summary-gateway-route-policy";
import type { ReaderSummaryGenerationBackend } from "./reader-summary-gateway-route-policy";
import { mimoReaderSummaryBackend, type activeReaderSummaryProvider } from "./reader-summary-runtime-contract";
import {
  resolveCodexGatewayReaderSummaryRoute,
} from "./codex-reader-summary-route";
import {
  parseActiveReaderSummaryModel,
  parseActiveReaderSummaryReasoningEffort,
  resolveReaderSummaryGenerationIdentity,
} from "./reader-summary-generation-identity-core";

/**
 * Shared effort of daily tasks: a gateway route owns it, CLI backends use the
 * purpose effort. The Codex settings stay validated under a Codex gateway route.
 */
export const resolveReaderSummaryReasoningEffortFromEnv = (
  env: NodeJS.ProcessEnv,
): string | undefined => {
  const gateway = resolveGatewayReaderSummaryRoute(env);
  if (gateway !== undefined) return gateway.reasoningEffort;
  const shared = parseActiveReaderSummaryReasoningEffort(
    env.AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT ?? env.AGENT_RUNTIME_REASONING_EFFORT);
  return resolveCodexGatewayReaderSummaryRoute(env)?.reasoningEffort ?? shared;
};

export const resolveReaderSummaryGenerationIdentityFromEnv = (
  env: NodeJS.ProcessEnv,
): { readonly provider: typeof activeReaderSummaryProvider; readonly model: string;
  readonly backend: ReaderSummaryGenerationBackend } => {
  // The historic shared model remains the Codex default for all daily
  // workflows; MiMo and gateway selection use the backend and
  // purpose-specific models.
  const sharedModel = parseActiveReaderSummaryModel(
    env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
  );
  const generationModel =
    env.AGENT_RUNTIME_READER_SUMMARY_GENERATION_MODEL?.trim() || undefined;
  const selection = resolveReaderSummaryBackendSelectionFromEnv(env);
  if (selection.kind === "codex-gateway") {
    return resolveReaderSummaryGenerationIdentity({
      provider: env.AGENT_RUNTIME_PROVIDER,
      model: gatewayRouteModel(selection.route, generationModel),
    });
  }
  if (selection.kind === "cli") {
    return resolveReaderSummaryGenerationIdentity({
      provider: env.AGENT_RUNTIME_PROVIDER,
      model: generationModel ?? sharedModel,
    });
  }
  if (selection.kind === "gateway") {
    return resolveReaderSummaryGenerationIdentity({
      provider: env.AGENT_RUNTIME_PROVIDER,
      backend: selection.route.backend,
      model: gatewayRouteModel(selection.route, generationModel),
    });
  }
  return resolveReaderSummaryGenerationIdentity({
    provider: env.AGENT_RUNTIME_PROVIDER,
    backend: mimoReaderSummaryBackend,
    model: generationModel,
  });
};

// Preserve historical function identity for direct env-resolution consumers.
export { resolveReaderSummaryDailyTaskIdentityFromEnv } from "./reader-summary-daily-task-env-resolution";
