import { buildAgentRuntimeReaderSummaryTaskCommand } from "./agent-runtime-reader-summary-task-command";
import { isRepairableNarrativeError } from "./reader-summary-narrative-repair-contract";
import { readerSummaryDailyInputReceipt } from "./reader-summary-daily-input-receipt";
import { runAgentRuntimeDailyEditor } from "./agent-runtime-reader-summary-daily-editorial";
import {
  buildReaderSummary,
  primaryReaderSummaryEvidence,
} from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeProvider,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
  ProviderReaderSummaryAttempt,
  ReaderSummaryDailyEditorialAttempt,
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
  buildOpenAiReaderSummaryPromptPayload,
  currentReaderSummaryPromptRelease,
} from "./openai-responses-reader-summary-prompt";
import { parseOpenAiReaderSummaryJsonObject } from "./openai-responses-reader-summary-response-parser";
import { buildReaderSummaryEvidenceCitationMap } from "./reader-summary-evidence-citation-map";
import {
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";
import {
  AgentRuntimeModelProviderError,
  assertReaderSummaryRepairWithinBudget,
  classifyAgentRuntimeError,
  nonEmptyOrFallback,
  parsePositiveInteger,
  positiveIntegerOrFallback,
  readAgentRuntimeObjectOutput,
  usageFromAgentRuntime,
  sumReaderSummaryUsage,
} from "./agent-runtime-model-support";
import {
  type activeReaderSummaryProvider,
  activeReaderSummaryReasoningEffort,
  resolveReaderSummaryBackendEffort,
  resolveReaderSummaryGenerationIdentity,
  resolveReaderSummaryGenerationIdentityFromEnv,
  resolveReaderSummaryReasoningEffortFromEnv,
  type ReaderSummaryGenerationBackend,
  frozenLegacyReaderSummaryRecoveryContract,
  type FrozenLegacyReaderSummaryRecoveryContract,
} from "./active-reader-summary-generation-profile";
import { maxReportedOutputViolations, safeOutputViolationPattern } from
  "./gateway-llm/gateway-llm-output-violations";

export type AgentRuntimeReaderSummaryModelAdapterOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly modelBackend?: ReaderSummaryGenerationBackend;
  /**
   * high for gpt-5.6-sol and MiMo, xhigh for legacy recovery, the route effort
   * for a gateway backend or gateway-only Codex model.
   */
  readonly reasoningEffort?: string;
  readonly legacyRecoveryContract?: FrozenLegacyReaderSummaryRecoveryContract;
  readonly evalDatasetVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly inputTokenDivisor?: number;
  readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;
};
const provider = "agent-runtime";
const defaultReasoningEffort = activeReaderSummaryReasoningEffort;
const defaultEvalDatasetVersion = "reader_summary.eval.mvp.v1";
export const defaultTimeoutMs = 600_000;
export const readerSummaryNarrativeAttempts = ["primary", "repair"] as const;
const defaultMaxOutputTokens = 16_000;
const defaultInputTokenDivisor = 4;

export class AgentRuntimeReaderSummaryModelAdapter implements ReaderSummaryModelPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly agentProvider: typeof activeReaderSummaryProvider;
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly modelBackend: ReaderSummaryGenerationBackend;
  private readonly reasoningEffort: string;
  private readonly legacyRecovery: boolean;
  private readonly evalDatasetVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly inputTokenDivisor: number;
  private readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;

  constructor(options: AgentRuntimeReaderSummaryModelAdapterOptions) {
    this.client = options.client;
    const generationIdentity = resolveReaderSummaryGenerationIdentity({
      provider: options.agentProvider,
      model: options.model,
      backend: options.modelBackend,
      legacyRecovery: options.legacyRecoveryContract !== undefined,
    });
    this.agentProvider = generationIdentity.provider;
    this.modelBackend = generationIdentity.backend;
    this.providerInstanceId = options.providerInstanceId;
    this.model = generationIdentity.model;
    this.legacyRecovery = options.legacyRecoveryContract !== undefined;
    if (
      options.legacyRecoveryContract !== undefined &&
      options.legacyRecoveryContract !== frozenLegacyReaderSummaryRecoveryContract
    ) {
      throw new Error("Reader summary legacy recovery contract is not canonical");
    }
    this.reasoningEffort = resolveReaderSummaryBackendEffort(
      this.modelBackend,
      options.reasoningEffort,
      this.legacyRecovery ? "xhigh" : defaultReasoningEffort,
      this.model,
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
    this.verifiedAttestationSink = options.verifiedAttestationSink;
  }

  route(
    input: ReaderSummaryModelInput,
    policy: ReaderSummaryModelPolicy,
    budget: ReaderSummaryModelBudget,
  ): ReaderSummaryModelRoute {
    const route = { ...this.buildRoute(), ...(input.dailyEditorialPlan !== undefined
      ? { promptVersion: "reader_summary.prompt.2026-11-03.daily_editorial_v1" }
      : input.evidence.dailyGenerationInput === undefined ? {} :
        { promptVersion: "reader_summary.prompt.2026-11-03.daily_likes_digest" }) };
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

  async planDaily(input: ReaderSummaryModelInput, route: ReaderSummaryModelRoute):
    Promise<ReaderSummaryDailyEditorialAttempt> {
    if (this.legacyRecovery || input.evidence.dailyGenerationInput === undefined)
      throw new Error("Daily editorial planning is not available for this profile");
    return runAgentRuntimeDailyEditor({ input, client: this.client,
      baseCommand: this.buildTaskCommand(input, route, "primary"),
      inputTokenDivisor: this.inputTokenDivisor, maxOutputTokens: this.maxOutputTokens,
      sink: this.verifiedAttestationSink });
  }
  async generate(input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute, writerBudget?: ReaderSummaryModelBudget,
  ): Promise<ProviderReaderSummaryAttempt> {
    if (
      primaryReaderSummaryEvidence(input.evidence).selectedEvidence.length === 0
    ) {
      return this.buildNoSignalAttempt(input, selectedRoute);
    }

    let logicalRunUsage: ReaderSummaryModelEstimate | undefined;
    let schemaViolations: readonly string[] | undefined;
    // Two attempts at most: the repair runs once, for either cause.
    for (const attempt of readerSummaryNarrativeAttempts) {
      const command = this.buildTaskCommand(input, selectedRoute, attempt, schemaViolations);
      const dailyGenerationReceipt = readerSummaryDailyInputReceipt(command.prompt, input.evidence.dailyGenerationInput, input.dailyEditorialPlan);
      const result = await this.client.runTask(command);
      const estimate = this.estimate(input, selectedRoute);
      const attemptUsage = usageFromAgentRuntime(result.usage, estimate);
      logicalRunUsage = sumReaderSummaryUsage(logicalRunUsage, attemptUsage);
      if (attempt === "primary") {
        schemaViolations = this.gatewaySchemaViolations(result);
        if (schemaViolations !== undefined) {
          assertReaderSummaryRepairWithinBudget(logicalRunUsage, estimate, writerBudget);
          continue;
        }
      }
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

        return { route: selectedRoute, draft, ...(dailyGenerationReceipt === undefined ? {} : { dailyGenerationReceipt }) };
      } catch (error) {
        if (attempt === "primary" && isRepairableNarrativeError(error)) {
          assertReaderSummaryRepairWithinBudget(logicalRunUsage, estimate, writerBudget);
          continue;
        }
        throw error;
      }
    }

    throw new Error("Reader summary repair attempt did not return a result");
  }
  /**
   * Output the gateway strict decode rejects gets one repair that names every
   * broken path and limit, never the rejected text, on every backend the
   * gateway serves (Codex included). Only the gateway client reports
   * outputValidationViolations; the CLI runtime enforces the schema itself
   * and keeps failing such output.
   */
  private gatewaySchemaViolations(result: AgentRuntimeTaskResult): readonly string[] | undefined {
    const failure = result.status === "failed" ? result.failure : undefined;
    if (failure?.code !== "provider_output_invalid" ||
        failure.details?.outputValidationStage !== "schema_normalization" ||
        failure.details.outputValidationViolations === undefined) return undefined;
    const reported = (failure.details.outputValidationViolations ?? "").split(" ")
      .filter((entry) => safeOutputViolationPattern.test(entry));
    const first = failure.details.outputValidationPath;
    return (reported.length > 0 ? reported : [first ?? "json_parse_or_empty"])
      .slice(0, maxReportedOutputViolations);
  }

  private buildTaskCommand(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
    attempt: "primary" | "repair",
    schemaViolations?: readonly string[],
  ): AgentRuntimeTaskCommand {
    return buildAgentRuntimeReaderSummaryTaskCommand({
      input,
      selectedRoute,
      attempt,
      schemaViolations,
      agentProvider: this.agentProvider,
      providerInstanceId: this.providerInstanceId,
      legacyRecovery: this.legacyRecovery,
      modelBackend: this.modelBackend,
      reasoningEffort: this.reasoningEffort,
      model: this.model,
      maxOutputTokens: this.maxOutputTokens,
      timeoutMs: this.timeoutMs,
    });
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
          editorialSlate: input.evidence.editorialSlate,
        }),
      },
    };
  }
}


export const resolveAgentRuntimeReaderSummaryModelOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeReaderSummaryModelAdapterOptions => {
  assertNoReaderSummaryPromptReleaseOverride({
    environmentName: "AGENT_RUNTIME_READER_SUMMARY_PROMPT_VERSION",
    value: env.AGENT_RUNTIME_READER_SUMMARY_PROMPT_VERSION,
  });

  const generationIdentity = resolveReaderSummaryGenerationIdentityFromEnv(env);
  return {
    client,
    agentProvider: generationIdentity.provider,
    providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
    model: generationIdentity.model,
    modelBackend: generationIdentity.backend,
    reasoningEffort: resolveReaderSummaryReasoningEffortFromEnv(env),
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
