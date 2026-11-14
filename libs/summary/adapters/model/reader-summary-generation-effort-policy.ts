import {
  gatewayDefaultReasoningEffort,
  isGatewayReaderSummaryBackend,
  isGatewayReaderSummaryReasoningEffort,
} from "./reader-summary-gateway-route-policy";
import type {
  GatewayReaderSummaryBackend,
  ReaderSummaryGenerationBackend,
} from "./reader-summary-gateway-route-policy";
import {
  codexGatewayReaderSummaryReasoningEffort,
  codexReaderSummaryBackend,
  isCodexGatewayOnlyReaderSummaryModel,
  isCodexGatewayReaderSummaryRoute,
} from "./codex-reader-summary-route";

// Pure route control and effort admission. Model identity and env parsing are
// separate owners; the historical identity module reexports these functions.
/** A gateway task names its backend; the default effort sends no reasoning control. */
export const readerSummaryRouteControls = (
  backend: ReaderSummaryGenerationBackend,
  reasoningEffort: string,
): { readonly modelBackend?: GatewayReaderSummaryBackend; readonly reasoningEffort?: string } => ({
  ...(isGatewayReaderSummaryBackend(backend) ? { modelBackend: backend } : {}),
  ...(reasoningEffort === gatewayDefaultReasoningEffort ? {} : { reasoningEffort }),
});

/**
 * Effort of one adapter: a gateway backend defaults to sending none and
 * accepts only gateway efforts, a gateway-only Codex model takes one of its
 * allowed efforts, and every other CLI model keeps its fixed effort.
 */
export const resolveReaderSummaryBackendEffort = (
  backend: ReaderSummaryGenerationBackend,
  requested: string | undefined,
  cliEffort: string,
  model: string,
): string => {
  if (isGatewayReaderSummaryBackend(backend)) {
    const effort = requested ?? gatewayDefaultReasoningEffort;
    if (isGatewayReaderSummaryReasoningEffort(effort)) return effort;
  } else if (backend === codexReaderSummaryBackend && isCodexGatewayOnlyReaderSummaryModel(model)) {
    const effort = requested ?? codexGatewayReaderSummaryReasoningEffort(model);
    if (isCodexGatewayReaderSummaryRoute(model, effort)) return effort;
  } else if ((requested ?? cliEffort) === cliEffort) {
    return cliEffort;
  }
  throw new Error("Reader summary execution profile and effort conflict");
};
