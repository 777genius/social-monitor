import { buildReaderSummary, readerSummaryScopeKey } from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeProvider,
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelBudget,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelFailure,
  ReaderSummaryModelInput,
  ReaderSummaryModelPolicy,
  ReaderSummaryModelPort,
  ReaderSummaryModelRoute,
  ReaderSummaryModelValidationResult,
} from "../../ports";
import {
  assertOpenAiReaderSummaryDraftShape,
  buildOpenAiReaderSummaryLineage,
  normalizeOpenAiReaderSummaryDraft,
} from "./openai-responses-reader-summary-draft-normalizer";
import {
  buildOpenAiReaderSummaryInstructions,
  buildOpenAiReaderSummaryPromptPayload,
} from "./openai-responses-reader-summary-prompt";
import { parseOpenAiReaderSummaryJsonObject } from "./openai-responses-reader-summary-response-parser";
import { openAiReaderSummaryJsonSchema } from "./openai-responses-reader-summary-schema";
import {
  AgentRuntimeModelProviderError,
  buildAgentRuntimeRequestId,
  classifyAgentRuntimeError,
  nonEmptyOrFallback,
  parsePositiveInteger,
  positiveIntegerOrFallback,
  readAgentRuntimeObjectOutput,
  usageFromAgentRuntime,
} from "./agent-runtime-model-support";

export type AgentRuntimeReaderSummaryModelAdapterOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly promptVersion?: string;
  readonly evalDatasetVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly inputTokenDivisor?: number;
};

const provider = "agent-runtime";
const defaultAgentProvider: AgentRuntimeProvider = "codex";
const defaultModel = "agent-runtime-reader-summary";
const defaultPromptVersion = "reader_summary.prompt.agent_runtime.v2";
const defaultEvalDatasetVersion = "reader_summary.eval.mvp.v1";
const defaultTimeoutMs = 180_000;
const defaultMaxOutputTokens = 16_000;
const defaultInputTokenDivisor = 4;

export class AgentRuntimeReaderSummaryModelAdapter implements ReaderSummaryModelPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly agentProvider: AgentRuntimeProvider;
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly promptVersion: string;
  private readonly evalDatasetVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly inputTokenDivisor: number;

  constructor(options: AgentRuntimeReaderSummaryModelAdapterOptions) {
    this.client = options.client;
    this.agentProvider = options.agentProvider ?? defaultAgentProvider;
    this.providerInstanceId = options.providerInstanceId;
    this.model = nonEmptyOrFallback(options.model, defaultModel);
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
    input: ReaderSummaryModelInput,
    policy: ReaderSummaryModelPolicy,
    budget: ReaderSummaryModelBudget,
  ): ReaderSummaryModelRoute {
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
        message: "Reader summary model budget exceeded",
      });
    }

    return route;
  }

  estimate(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): ReaderSummaryModelEstimate {
    void selectedRoute;

    const inputTokens = Math.ceil(
      buildOpenAiReaderSummaryPromptPayload(input).length /
        this.inputTokenDivisor,
    );
    const outputTokens =
      input.evidence.selectedEvidence.length === 0
        ? 128
        : Math.min(
            this.maxOutputTokens,
            Math.max(512, input.policy.maxStories * 260),
          );

    return {
      inputTokens,
      outputTokens,
      estimatedCostUsd: 0,
    };
  }

  async generate(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt> {
    if (input.evidence.selectedEvidence.length === 0) {
      return this.buildNoSignalAttempt(input, selectedRoute);
    }

    const result = await this.client.runTask({
      requestId: buildAgentRuntimeRequestId(
        "reader-summary",
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      correlationId: buildAgentRuntimeRequestId(
        "reader-summary-correlation",
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      provider: this.agentProvider,
      providerInstanceId: this.providerInstanceId,
      purpose: "social_monitor.reader_summary.generate",
      systemPrompt: buildOpenAiReaderSummaryInstructions(input),
      prompt: buildOpenAiReaderSummaryPromptPayload(input),
      outputSchema: openAiReaderSummaryJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_reader_summary_artifact",
        schemaVersion: selectedRoute.schemaVersion,
        ...runtimeModelControl(this.model, defaultModel),
        maxOutputTokens: this.maxOutputTokens,
      },
      timeoutMs: this.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary",
        promptVersion: selectedRoute.promptVersion,
      },
    });
    const rawDraft = readAgentRuntimeObjectOutput(
      result,
      parseOpenAiReaderSummaryJsonObject,
      "Reader summary",
    );
    const usage = usageFromAgentRuntime(
      result.usage,
      this.estimate(input, selectedRoute),
    );
    const draft = normalizeOpenAiReaderSummaryDraft(
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
    attempt: ProviderReaderSummaryAttempt,
  ): ReaderSummaryModelValidationResult {
    try {
      assertOpenAiReaderSummaryDraftShape(attempt.draft);
      if (attempt.route.schemaVersion !== "reader_summary.artifact.v1") {
        throw new Error("Unsupported reader summary schema version");
      }
      if (attempt.route.provider !== provider) {
        throw new Error("Unexpected reader summary provider route");
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
              : "Invalid agent-runtime reader summary provider response",
        },
      };
    }
  }

  classifyError(error: unknown): ReaderSummaryModelFailure {
    return classifyAgentRuntimeError(
      error,
      "Unknown agent-runtime reader summary model error",
    );
  }

  private buildRoute(): ReaderSummaryModelRoute {
    return {
      provider,
      model: `${this.agentProvider}:${this.model}`,
      promptVersion: this.promptVersion,
      schemaVersion: "reader_summary.artifact.v1",
    };
  }

  private buildNoSignalAttempt(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): ProviderReaderSummaryAttempt {
    const noSignalDraft = {
      headline: "No reliable workspace signal yet",
      executiveSummary:
        "No eligible evidence items were available for this summary window.",
      topStories: [],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [
        {
          description:
            "The summary window did not contain enough primary evidence to produce claims.",
          reason: "insufficient_evidence" as const,
        },
      ],
      citationMap: [],
      qualityFlags: ["no_signal", "limited_sources"] as const,
      confidence: {
        level: "none" as const,
        score: 0,
        rationale: "No primary evidence was selected for the summary window.",
      },
      lineage: buildOpenAiReaderSummaryLineage(
        input,
        selectedRoute,
        this.evalDatasetVersion,
      ),
      usage: this.estimate(input, selectedRoute),
      noSignalReason:
        "No eligible evidence items selected for this summary scope.",
    };

    return {
      route: selectedRoute,
      draft: {
        ...noSignalDraft,
        content: buildReaderSummary({
          ...noSignalDraft,
          storyClusters: input.evidence.clusters,
          sourceWindow: input.evidence.sourceWindow,
          selectedEvidence: input.evidence.selectedEvidence,
        }),
      },
    };
  }
}

export const resolveAgentRuntimeReaderSummaryModelOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeReaderSummaryModelAdapterOptions => ({
  client,
  agentProvider: parseAgentRuntimeProvider(env.AGENT_RUNTIME_PROVIDER),
  providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
  model: env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
  promptVersion: env.AGENT_RUNTIME_READER_SUMMARY_PROMPT_VERSION,
  evalDatasetVersion: env.READER_SUMMARY_EVAL_DATASET_VERSION,
  timeoutMs: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_TIMEOUT_MS ?? env.AGENT_RUNTIME_TIMEOUT_MS,
  ),
  maxOutputTokens: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_MAX_OUTPUT_TOKENS,
  ),
});

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

const runtimeModelControl = (
  model: string,
  defaultModelAlias: string,
): { readonly model?: string } =>
  model === defaultModelAlias ? {} : { model };
