import { buildAgentRuntimeSummaryTaskCommand } from "./agent-runtime-summary-task-command";
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
import { buildPromptPayload } from "./openai-responses-summary-prompt";
import {
  assertOpenAiSummaryDraftShape,
  normalizeOpenAiSummaryDraft,
} from "./openai-responses-summary-draft-normalizer";
import {
  parseOpenAiSummaryJsonObject,
} from "./openai-responses-summary-response-parser";
import {
  resolveReaderSummaryDailyTaskIdentityFromEnv,
  resolveReaderSummaryGenerationIdentityFromEnv,
  resolveReaderSummaryReasoningEffortFromEnv,
  readerSummaryRouteControls,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";
import {
  AgentRuntimeModelProviderError,
  classifyAgentRuntimeError,
  nonEmptyOrFallback,
  parsePositiveInteger,
  positiveIntegerOrFallback,
  readAgentRuntimeObjectOutput,
  usageFromAgentRuntime,
} from "./agent-runtime-model-support";

export type AgentRuntimeSummaryModelAdapterOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly modelBackend?: ReaderSummaryGenerationBackend;
  readonly reasoningEffort?: string;
  readonly promptVersion?: string;
  readonly evalDatasetVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly inputTokenDivisor?: number;
};

const provider = "agent-runtime";
const defaultAgentProvider: AgentRuntimeProvider = "codex";
const defaultModel = "agent-runtime-summary";
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
    this.model = nonEmptyOrFallback(options.model, defaultModel);
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

    if (
      estimate.inputTokens > policy.maxInputTokens ||
      estimate.outputTokens > policy.maxOutputTokens ||
      estimate.estimatedCostUsd > policy.maxEstimatedCostUsd ||
      estimate.inputTokens + estimate.outputTokens > budget.remainingTokens ||
      estimate.estimatedCostUsd > budget.remainingCostUsd
    ) {
      throw new AgentRuntimeModelProviderError({
        kind: "budget_exceeded",
        retryable: false,
        message: "Summary model budget exceeded",
      });
    }

    return route;
  }

  estimate(
    input: SummaryModelInput,
    selectedRoute: SummaryModelRoute,
  ): SummaryModelEstimate {
    void selectedRoute;

    const inputTokens = Math.ceil(
      buildPromptPayload(input).length / this.inputTokenDivisor,
    );
    const outputTokens =
      input.evidence.items.length === 0
        ? 96
        : Math.min(
            this.maxOutputTokens,
            Math.max(256, input.policy.maxKeyPoints * 220),
          );

    return {
      inputTokens,
      outputTokens,
      estimatedCostUsd: 0,
    };
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
      defaultModelAlias: defaultModel,
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
    try {
      assertOpenAiSummaryDraftShape(attempt.draft);
      if (attempt.route.schemaVersion !== "summary.artifact.v1") {
        throw new Error("Unsupported summary schema version");
      }
      if (attempt.route.provider !== provider) {
        throw new Error("Unexpected summary provider route");
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "invalid_schema",
          retryable: false,
          message:
            error instanceof Error
              ? error.message
              : "Invalid agent-runtime summary provider response",
        },
      };
    }
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

export const resolveAgentRuntimeSummaryModelOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeSummaryModelAdapterOptions => ({
  client,
  agentProvider: parseAgentRuntimeProvider(env.AGENT_RUNTIME_PROVIDER),
  providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
  model: env.AGENT_RUNTIME_SUMMARY_MODEL,
  ...resolveSummaryGatewayIdentity(env),
  promptVersion: env.AGENT_RUNTIME_SUMMARY_PROMPT_VERSION,
  evalDatasetVersion: env.SUMMARY_EVAL_DATASET_VERSION,
  timeoutMs: parsePositiveInteger(
    env.AGENT_RUNTIME_SUMMARY_TIMEOUT_MS ?? env.AGENT_RUNTIME_TIMEOUT_MS,
  ),
  maxOutputTokens: parsePositiveInteger(
    env.AGENT_RUNTIME_SUMMARY_MAX_OUTPUT_TOKENS,
  ),
});

const resolveSummaryGatewayIdentity = (env: NodeJS.ProcessEnv): Partial<AgentRuntimeSummaryModelAdapterOptions> => {
  if (env.AGENT_RUNTIME_TRANSPORT?.trim() !== "gateway-llm") return {};
  const identity = resolveReaderSummaryGenerationIdentityFromEnv(env);
  const purposeModel = env.AGENT_RUNTIME_SUMMARY_MODEL?.trim();
  const route = resolveReaderSummaryDailyTaskIdentityFromEnv(env,
    purposeModel === defaultModel ? undefined : purposeModel);
  const reasoningEffort = resolveReaderSummaryReasoningEffortFromEnv(env) ?? "default";
  const requestedEffort = env.AGENT_RUNTIME_SUMMARY_REASONING_EFFORT?.trim();
  if (requestedEffort && requestedEffort !== reasoningEffort) {
    throw new Error("Gateway summary reasoning effort conflicts with purpose policy");
  }
  return { agentProvider: identity.provider, model: route.model,
    modelBackend: route.modelBackend, reasoningEffort };
};

const parseAgentRuntimeProvider = (
  value: string | undefined,
): AgentRuntimeProvider | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  if (value === "codex" || value === "claude") {
    return value;
  }

  throw new Error('AGENT_RUNTIME_PROVIDER must be "codex" or "claude"');
};

