import type { AgentRuntimeTaskCommand, ReaderSummaryModelRoute } from "../../ports";
import {
  readerSummaryRouteControls,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";

/** The execution policy owns model controls; task assembly owns identity, prompts and transport. */
export const readerSummaryTaskControls = (params: Readonly<{
  selectedRoute: ReaderSummaryModelRoute;
  model: string;
  modelBackend: ReaderSummaryGenerationBackend;
  reasoningEffort: string;
  maxOutputTokens: number;
}>): AgentRuntimeTaskCommand["controls"] => {
  const { selectedRoute } = params;
  return {
  interactive: false,
  outputSchemaName: "social_monitor_reader_summary_artifact",
  schemaVersion: selectedRoute.schemaVersion,
  model: params.model,
  ...(params.modelBackend === "xiaomi-mimo-token-plan"
    ? { modelBackend: params.modelBackend }
    : {}),
  ...readerSummaryRouteControls(params.modelBackend, params.reasoningEffort),
  toolsEnabled: false,
  toolPolicy: "none",
  maxOutputTokens: params.maxOutputTokens,
  };
};
