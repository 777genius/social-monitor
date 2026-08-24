import {
  buildReaderSummary,
  primaryReaderSummaryEvidence,
  readerSummaryScopeKey,
} from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeProvider,
  AgentRuntimeTaskCommand,
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
  assertNoReaderSummaryPromptReleaseOverride,
  buildOpenAiReaderSummaryInstructions,
  buildOpenAiReaderSummaryPromptPayload,
  currentReaderSummaryPromptRelease,
} from "./openai-responses-reader-summary-prompt";
import { parseOpenAiReaderSummaryJsonObject } from "./openai-responses-reader-summary-response-parser";
import { openAiReaderSummaryJsonSchema } from "./openai-responses-reader-summary-schema";
import { buildReaderSummaryEvidenceCitationMap } from "./reader-summary-evidence-citation-map";
import {
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";
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
import {
  activeReaderSummaryModel,
  activeReaderSummaryProvider,
  activeReaderSummaryPurposes,
  activeReaderSummaryReasoningEffort,
  assertActiveReaderSummaryProvider,
  parseActiveReaderSummaryModel,
  parseActiveReaderSummaryReasoningEffort,
  frozenLegacyReaderSummaryRecoveryContract,
  type FrozenLegacyReaderSummaryRecoveryContract,
} from "./active-reader-summary-generation-profile";

export type AgentRuntimeReaderSummaryModelAdapterOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly reasoningEffort?: "high" | "xhigh";
  readonly legacyRecoveryContract?: FrozenLegacyReaderSummaryRecoveryContract;
  readonly evalDatasetVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly inputTokenDivisor?: number;
  readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;
};

const provider = "agent-runtime";
const defaultAgentProvider = activeReaderSummaryProvider;
const defaultModel = activeReaderSummaryModel;
const defaultReasoningEffort = activeReaderSummaryReasoningEffort;
const defaultEvalDatasetVersion = "reader_summary.eval.mvp.v1";
const defaultTimeoutMs = 600_000;
const defaultMaxOutputTokens = 16_000;
const defaultInputTokenDivisor = 4;

export class AgentRuntimeReaderSummaryModelAdapter implements ReaderSummaryModelPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly agentProvider: typeof activeReaderSummaryProvider;
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly reasoningEffort: "high" | "xhigh";
  private readonly legacyRecovery: boolean;
  private readonly evalDatasetVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly inputTokenDivisor: number;
  private readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;

  constructor(options: AgentRuntimeReaderSummaryModelAdapterOptions) {
    this.client = options.client;
    this.agentProvider =
      assertActiveReaderSummaryProvider(options.agentProvider) ??
      defaultAgentProvider;
    this.providerInstanceId = options.providerInstanceId;
    this.model = parseActiveReaderSummaryModel(options.model) ?? defaultModel;
    this.legacyRecovery = options.legacyRecoveryContract !== undefined;
    if (
      options.legacyRecoveryContract !== undefined &&
      options.legacyRecoveryContract !== frozenLegacyReaderSummaryRecoveryContract
    ) {
      throw new Error("Reader summary legacy recovery contract is not canonical");
    }
    this.reasoningEffort = options.reasoningEffort ??
      (this.legacyRecovery ? "xhigh" : defaultReasoningEffort);
    if (
      (!this.legacyRecovery &&
        this.reasoningEffort !== activeReaderSummaryReasoningEffort) ||
      (this.legacyRecovery &&
        this.reasoningEffort !== "xhigh")
    ) {
      throw new Error("Reader summary execution profile and effort conflict");
    }
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
    this.verifiedAttestationSink = options.verifiedAttestationSink;
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
      primaryReaderSummaryEvidence(input.evidence).selectedEvidence.length === 0
        ? 128
        : Math.min(
            this.maxOutputTokens,
            Math.max(768, input.policy.maxStories * 320),
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
    if (
      primaryReaderSummaryEvidence(input.evidence).selectedEvidence.length === 0
    ) {
      return this.buildNoSignalAttempt(input, selectedRoute);
    }

    let logicalRunUsage: ReaderSummaryModelEstimate | undefined;
    for (const attempt of ["primary", "repair"] as const) {
      const command = this.buildTaskCommand(input, selectedRoute, attempt);
      const result = await this.client.runTask(command);
      const attemptUsage = usageFromAgentRuntime(
        result.usage,
        this.estimate(input, selectedRoute),
      );
      logicalRunUsage = sumReaderSummaryUsage(logicalRunUsage, attemptUsage);
      try {
        const rawDraft = readAgentRuntimeObjectOutput(
          result,
          parseOpenAiReaderSummaryJsonObject,
          "Reader summary",
        );
        const draft = normalizeOpenAiReaderSummaryDraft(
          rawDraft,
          input,
          selectedRoute,
          logicalRunUsage,
          this.evalDatasetVersion,
        );
        await verifyAndRecordReaderSummaryExecution({
          command,
          result,
          taskRole: "summary",
          attempt,
          normalizedOutput: draft,
          legacyRecoveryContract: this.legacyRecovery
            ? frozenLegacyReaderSummaryRecoveryContract
            : undefined,
          sink: this.verifiedAttestationSink,
        });

        return { route: selectedRoute, draft };
      } catch (error) {
        if (attempt === "primary" && isRepairableNarrativeError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("Reader summary repair attempt did not return a result");
  }

  private buildTaskCommand(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
    attempt: "primary" | "repair",
  ): AgentRuntimeTaskCommand {
    const isRepair = attempt === "repair";
    return {
      requestId: buildAgentRuntimeRequestId(
        isRepair ? "reader-summary-repair" : "reader-summary",
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
      purpose: isRepair
        ? this.legacyRecovery
          ? frozenLegacyReaderSummaryRecoveryContract.purposes.repair
          : activeReaderSummaryPurposes.repair
        : this.legacyRecovery
          ? frozenLegacyReaderSummaryRecoveryContract.purposes.generate
          : activeReaderSummaryPurposes.generate,
      systemPrompt: isRepair
        ? `${buildOpenAiReaderSummaryInstructions(input)}\n${narrativeRepairInstruction}`
        : buildOpenAiReaderSummaryInstructions(input),
      prompt: buildOpenAiReaderSummaryPromptPayload(input),
      outputSchema: openAiReaderSummaryJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_reader_summary_artifact",
        schemaVersion: selectedRoute.schemaVersion,
        model: this.model,
        reasoningEffort: this.reasoningEffort,
        toolsEnabled: false,
        toolPolicy: "none",
        maxOutputTokens: this.maxOutputTokens,
      },
      timeoutMs: this.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary",
        promptVersion: selectedRoute.promptVersion,
        reasoningEffort: this.reasoningEffort,
        attempt,
      },
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
      model: `${this.agentProvider}:${this.model}:${this.reasoningEffort}`,
      promptVersion: currentReaderSummaryPromptRelease.id,
      schemaVersion: "reader_summary.artifact.v1",
    };
  }

  private buildNoSignalAttempt(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): ProviderReaderSummaryAttempt {
    const citationMap = buildReaderSummaryEvidenceCitationMap(
      input.evidence.selectedEvidence,
    );
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
      citationMap,
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

const narrativeRepairInstruction =
  "Repair the complete JSON response. Every narrativeSections item must use the non-empty string fields title and text, never summary, body or description. If coveragePlan.lead is null, return empty topStories and narrativeSections plus a concrete noSignalReason. For single_story, narrativeSections[0] must have kind lead and cite coveragePlan.lead. For daily_synthesis, it must have kind lead, set storyClusterId to null, and cite both coveragePlan.lead and at least one coveragePlan.secondary cluster. Return exactly one secondary_signal for every coveragePlan.secondary entry. Omit any watch that is not self-contained and backed by high engagement, first-party authority or cross-provider support. Do not change facts or invent citations.";

const isRepairableNarrativeError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.startsWith("Reader summary narrative");

export const resolveAgentRuntimeReaderSummaryModelOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeReaderSummaryModelAdapterOptions => {
  assertNoReaderSummaryPromptReleaseOverride({
    environmentName: "AGENT_RUNTIME_READER_SUMMARY_PROMPT_VERSION",
    value: env.AGENT_RUNTIME_READER_SUMMARY_PROMPT_VERSION,
  });

  return {
    client,
    agentProvider: parseAgentRuntimeProvider(env.AGENT_RUNTIME_PROVIDER),
    providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
    model: parseActiveReaderSummaryModel(
      env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
    ),
    reasoningEffort: parseActiveReaderSummaryReasoningEffort(
      env.AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT ??
        env.AGENT_RUNTIME_REASONING_EFFORT,
    ),
    evalDatasetVersion: env.READER_SUMMARY_EVAL_DATASET_VERSION,
    timeoutMs: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_TIMEOUT_MS ??
        env.AGENT_RUNTIME_TIMEOUT_MS,
    ),
    maxOutputTokens: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_MAX_OUTPUT_TOKENS,
    ),
  };
};

const parseAgentRuntimeProvider = (
  value: string | undefined,
): typeof activeReaderSummaryProvider | undefined =>
  assertActiveReaderSummaryProvider(value);

const sumReaderSummaryUsage = (
  accumulated: ReaderSummaryModelEstimate | undefined,
  attempt: ReaderSummaryModelEstimate,
): ReaderSummaryModelEstimate => accumulated === undefined
  ? attempt
  : {
      inputTokens: accumulated.inputTokens + attempt.inputTokens,
      outputTokens: accumulated.outputTokens + attempt.outputTokens,
      estimatedCostUsd:
        accumulated.estimatedCostUsd + attempt.estimatedCostUsd,
    };
