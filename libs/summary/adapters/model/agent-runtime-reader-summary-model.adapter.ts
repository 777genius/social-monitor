import { withReaderSummaryInputPromptVersion } from "./reader-summary-input-prompt-route";
import type { AgentRuntimeReaderSummaryModelAdapterOptions } from "./agent-runtime-reader-summary-options";
import { runAgentRuntimeReaderSummaryGeneration } from "./agent-runtime-reader-summary-generation";
export { resolveAgentRuntimeReaderSummaryModelOptions } from "./agent-runtime-reader-summary-options";
export type { AgentRuntimeReaderSummaryModelAdapterOptions } from "./agent-runtime-reader-summary-options";
import {
  estimateReaderSummaryTokenUsage,
  isReaderSummaryBudgetExceeded,
} from "./reader-summary-token-budget";
import { buildAgentRuntimeReaderSummaryTaskCommand } from "./agent-runtime-reader-summary-task-command";
import { runAgentRuntimeDailyEditor } from "./agent-runtime-reader-summary-daily-editorial";
import { primaryReaderSummaryEvidence } from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
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
import { validateAgentRuntimeReaderSummaryProviderResponse } from "./agent-runtime-reader-summary-response-validation";
import {
  currentReaderSummaryPromptRelease,
} from "./openai-responses-reader-summary-prompt";
import { buildReaderSummaryNoSignalAttempt } from "./reader-summary-no-signal-attempt";
import type { VerifiedReaderSummaryExecutionAttestationSink } from "./reader-summary-execution-attestation";
import {
  AgentRuntimeModelProviderError,
  classifyAgentRuntimeError,
  nonEmptyOrFallback,
  positiveIntegerOrFallback,
} from "./agent-runtime-model-support";
import {
  type activeReaderSummaryProvider,
  activeReaderSummaryReasoningEffort,
  resolveReaderSummaryBackendEffort,
  resolveReaderSummaryGenerationIdentity,
  type ReaderSummaryGenerationBackend,
  frozenLegacyReaderSummaryRecoveryContract,
} from "./active-reader-summary-generation-profile";

const provider = "agent-runtime";
const defaultReasoningEffort = activeReaderSummaryReasoningEffort;
const defaultEvalDatasetVersion = "reader_summary.eval.mvp.v1";
export const defaultTimeoutMs = 600_000;
export { readerSummaryNarrativeAttempts } from "./agent-runtime-reader-summary-generation";
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
    const route = withReaderSummaryInputPromptVersion(this.buildRoute(), input);
    const estimate = this.estimate(input, route);
    if (isReaderSummaryBudgetExceeded(estimate, policy, budget)) {
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
    return estimateReaderSummaryTokenUsage(input, {
      inputTokenDivisor: this.inputTokenDivisor,
      maxOutputTokens: this.maxOutputTokens,
    });
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

    return runAgentRuntimeReaderSummaryGeneration({
      client: this.client,
      input,
      selectedRoute,
      writerBudget,
      buildTaskCommand: (attempt, schemaViolations) =>
        this.buildTaskCommand(input, selectedRoute, attempt, schemaViolations),
      estimate: () => this.estimate(input, selectedRoute),
      evalDatasetVersion: this.evalDatasetVersion,
      legacyRecovery: this.legacyRecovery,
      verifiedAttestationSink: this.verifiedAttestationSink,
    });
  }
  /**
   * Output the gateway strict decode rejects gets one repair that names every
   * broken path and limit, never the rejected text, on every backend the
   * gateway serves (Codex included). Only the gateway client reports
   * outputValidationViolations; the CLI runtime enforces the schema itself
   * and keeps failing such output.
   */
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
    return validateAgentRuntimeReaderSummaryProviderResponse(attempt);
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
    return buildReaderSummaryNoSignalAttempt({
      input,
      selectedRoute,
      evalDatasetVersion: this.evalDatasetVersion,
      usage: this.estimate(input, selectedRoute),
    });
  }
}
