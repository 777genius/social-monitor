import { buildAgentRuntimeSummaryTaskCommand } from "./agent-runtime-summary-task-command";
import {
  assertAgentRuntimeSummaryWithinBudget,
  estimateAgentRuntimeSummaryUsage,
} from "./agent-runtime-summary-budget-policy";
import {
  defaultAgentRuntimeSummaryModel,
  type AgentRuntimeSummaryModelAdapterOptions,
} from "./agent-runtime-summary-options";
import { validateAgentRuntimeSummaryProviderResponse } from "./agent-runtime-summary-response-validation";
export { resolveAgentRuntimeSummaryModelOptions } from "./agent-runtime-summary-options";
export type { AgentRuntimeSummaryModelAdapterOptions } from "./agent-runtime-summary-options";
import { buildSummaryNoSignalAttempt } from "./summary-no-signal-attempt";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeProvider,
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
import { readerSummaryRouteControls } from "./active-reader-summary-generation-profile";
import {
  classifyAgentRuntimeError,
  nonEmptyOrFallback,
  positiveIntegerOrFallback,
  readAgentRuntimeObjectOutput,
  usageFromAgentRuntime,
} from "./agent-runtime-model-support";

const provider = "agent-runtime";
const defaultAgentProvider: AgentRuntimeProvider = "codex";
const defaultPromptVersion = "summary.prompt.agent_runtime.v1";
const defaultEvalDatasetVersion = "summary.eval.mvp.v1";
const defaultTimeoutMs = 120_000;
const defaultMaxOutputTokens = 4_000;
const defaultInputTokenDivisor = 4;

export class AgentRuntimeSummaryModelAdapter implements SummaryModelPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly agentProvider: AgentRuntimeProvider;
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly routeControls: Readonly<Record<string, unknown>>;
  private readonly promptVersion: string;
  private readonly evalDatasetVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly inputTokenDivisor: number;

  constructor(options: AgentRuntimeSummaryModelAdapterOptions) {
    this.client = options.client;
    this.agentProvider = options.agentProvider ?? defaultAgentProvider;
    this.providerInstanceId = options.providerInstanceId;
    this.model = nonEmptyOrFallback(options.model, defaultAgentRuntimeSummaryModel);
    this.routeControls = options.modelBackend === undefined ? {} :
      readerSummaryRouteControls(options.modelBackend, options.reasoningEffort ?? "default");
    this.promptVersion = nonEmptyOrFallback(
      options.promptVersion,
      defaultPromptVersion,
    );
    this.evalDatasetVersion = nonEmptyOrFallback(
      options.evalDatasetVersion,
      defaultEvalDatasetVersion,
    );
    this.timeoutMs = positiveIntegerOrFallback(
      options.timeoutMs,
      defaultTimeoutMs,
    );
    this.maxOutputTokens = positiveIntegerOrFallback(
      options.maxOutputTokens,
      defaultMaxOutputTokens,
    );
    this.inputTokenDivisor = positiveIntegerOrFallback(
      options.inputTokenDivisor,
      defaultInputTokenDivisor,
    );
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

    return estimateAgentRuntimeSummaryUsage(input, this.inputTokenDivisor, this.maxOutputTokens);
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
      agentProvider: this.agentProvider,
      providerInstanceId: this.providerInstanceId,
      model: this.model,
      defaultModelAlias: defaultAgentRuntimeSummaryModel,
      routeControls: this.routeControls,
      maxOutputTokens: this.maxOutputTokens,
      timeoutMs: this.timeoutMs,
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
      this.evalDatasetVersion,
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
      model: `${this.agentProvider}:${this.model}`,
      promptVersion: this.promptVersion,
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
      evalDatasetVersion: this.evalDatasetVersion,
      usage: this.estimate(input, selectedRoute),
    });
  }
}

