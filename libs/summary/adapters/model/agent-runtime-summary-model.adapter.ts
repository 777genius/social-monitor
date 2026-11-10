import { buildAgentRuntimeSummaryTaskCommand } from "./agent-runtime-summary-task-command";
import {
  assertAgentRuntimeSummaryWithinBudget,
  estimateAgentRuntimeSummaryUsage,
} from "./agent-runtime-summary-budget-policy";
import {
  defaultAgentRuntimeSummaryModel,
  type AgentRuntimeSummaryModelAdapterOptions,
} from "./agent-runtime-summary-options";
import { resolveAgentRuntimeSummaryRuntimeSettings, type AgentRuntimeSummaryRuntimeSettings } from "./agent-runtime-summary-runtime-settings";
import { validateAgentRuntimeSummaryProviderResponse } from "./agent-runtime-summary-response-validation";
export { resolveAgentRuntimeSummaryModelOptions } from "./agent-runtime-summary-options";
export type { AgentRuntimeSummaryModelAdapterOptions } from "./agent-runtime-summary-options";
import { buildSummaryNoSignalAttempt } from "./summary-no-signal-attempt";
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
import { normalizeOpenAiSummaryDraft } from "./openai-responses-summary-draft-normalizer";
import {
  parseOpenAiSummaryJsonObject,
} from "./openai-responses-summary-response-parser";
import {
  classifyAgentRuntimeError,
  readAgentRuntimeObjectOutput,
  usageFromAgentRuntime,
} from "./agent-runtime-model-support";

const provider = "agent-runtime";
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
    const route = this.buildRoute();
    const estimate = this.estimate(input, route);

    assertAgentRuntimeSummaryWithinBudget(estimate, policy, budget);

    return route;
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

    const result = await this.client.runTask(buildAgentRuntimeSummaryTaskCommand({
      input,
      selectedRoute,
      agentProvider: this.settings.agentProvider,
      providerInstanceId: this.settings.providerInstanceId,
      model: this.settings.model,
      defaultModelAlias: defaultAgentRuntimeSummaryModel,
      routeControls: this.settings.routeControls,
      maxOutputTokens: this.settings.maxOutputTokens,
      timeoutMs: this.settings.timeoutMs,
    }));
    const rawDraft = readAgentRuntimeObjectOutput(
      result,
      parseOpenAiSummaryJsonObject,
      "Summary",
    );
    const usage = usageFromAgentRuntime(
      result.usage,
      this.estimate(input, selectedRoute),
    );
    const draft = normalizeOpenAiSummaryDraft(
      rawDraft,
      input,
      selectedRoute,
      usage,
      this.settings.evalDatasetVersion,
    );

    return {
      route: selectedRoute,
      draft,
    };
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

  private buildRoute(): SummaryModelRoute {
    return {
      provider,
      model: `${this.settings.agentProvider}:${this.settings.model}`,
      promptVersion: this.settings.promptVersion,
      schemaVersion: "summary.artifact.v1",
    };
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

