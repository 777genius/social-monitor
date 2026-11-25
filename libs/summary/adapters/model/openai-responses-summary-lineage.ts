import type { SummaryModelInput, SummaryModelRoute } from "../../ports";

/** Preserve route, prompt, policy and evaluation identity in the published draft. */
export const buildOpenAiSummaryLineage = (
  input: SummaryModelInput,
  selectedRoute: SummaryModelRoute,
  evalDatasetVersion: string,
) =>
  ({
    promptVersion: selectedRoute.promptVersion,
    schemaVersion: selectedRoute.schemaVersion,
    modelVersion: selectedRoute.model,
    providerVersion: selectedRoute.provider,
    rulesVersion: input.policy.rulesVersion,
    evalDatasetVersion,
  }) as const;
