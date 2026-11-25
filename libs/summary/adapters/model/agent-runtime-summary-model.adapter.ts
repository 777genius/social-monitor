import { runAgentRuntimeSummaryExecution } from "./agent-runtime-summary-execution";
import {
  estimateAgentRuntimeSummaryUsage,
} from "./agent-runtime-summary-budget-policy";
import {
  type AgentRuntimeSummaryModelAdapterOptions,
} from "./agent-runtime-summary-options";
import { resolveAgentRuntimeSummaryRuntimeSettings, type AgentRuntimeSummaryRuntimeSettings } from "./agent-runtime-summary-runtime-settings";
import { validateAgentRuntimeSummaryProviderResponse } from "./agent-runtime-summary-response-validation";
export { resolveAgentRuntimeSummaryModelOptions } from "./agent-runtime-summary-options";
export type { AgentRuntimeSummaryModelAdapterOptions } from "./agent-runtime-summary-options";
import { buildSummaryNoSignalAttempt } from "./summary-no-signal-attempt";
import { admitAgentRuntimeSummaryRoute } from "./agent-runtime-summary-route-policy";
import type {
  AgentRuntimeClientPort,
  ProviderSummaryAttempt,
  SummaryModelBudget,
  SummaryModelEstimate,
  SummaryModelFailure,
  SummaryModelInput,
  SummaryModelPolicy,
  SummaryModelPort,
  SummaryModelRoute,
  SummaryModelValidationResult,
} from "../../ports";
import {
  classifyAgentRuntimeError,
} from "./agent-runtime-model-support";

export class AgentRuntimeSummaryModelAdapter implements SummaryModelPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly settings: AgentRuntimeSummaryRuntimeSettings;

  constructor(options: AgentRuntimeSummaryModelAdapterOptions) {
    this.client = options.client;
    this.settings = resolveAgentRuntimeSummaryRuntimeSettings(options);
  }

  route(
    input: SummaryModelInput,
    policy: SummaryModelPolicy,
    budget: SummaryModelBudget,
  ): SummaryModelRoute {
    return admitAgentRuntimeSummaryRoute({
      input, policy, budget, settings: this.settings,
    });
  }

  estimate(
    input: SummaryModelInput,
    selectedRoute: SummaryModelRoute,
  ): SummaryModelEstimate {
    void selectedRoute;

    return estimateAgentRuntimeSummaryUsage(input, this.settings.inputTokenDivisor, this.settings.maxOutputTokens);
  }

  async summarize(
    input: SummaryModelInput,
    selectedRoute: SummaryModelRoute,
  ): Promise<ProviderSummaryAttempt> {
    if (input.evidence.items.length === 0) {
      return this.buildNoSignalAttempt(input, selectedRoute);
    }

    return runAgentRuntimeSummaryExecution({
      client: this.client,
      input,
      selectedRoute,
      settings: this.settings,
      estimateUsage: () => this.estimate(input, selectedRoute),
    });
  }

  validateRawProviderResponse(
    attempt: ProviderSummaryAttempt,
  ): SummaryModelValidationResult {
    return validateAgentRuntimeSummaryProviderResponse(attempt);
  }

  classifyError(error: unknown): SummaryModelFailure {
    return classifyAgentRuntimeError(
      error,
      "Unknown agent-runtime summary model error",
    );
  }

  private buildNoSignalAttempt(
    input: SummaryModelInput,
    selectedRoute: SummaryModelRoute,
  ): ProviderSummaryAttempt {
    return buildSummaryNoSignalAttempt({
      input,
      selectedRoute,
      evalDatasetVersion: this.settings.evalDatasetVersion,
      usage: this.estimate(input, selectedRoute),
    });
  }
}

