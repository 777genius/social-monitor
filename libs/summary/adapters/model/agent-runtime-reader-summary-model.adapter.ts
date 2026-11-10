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
} from "./agent-runtime-model-support";
import {
  resolveAgentRuntimeReaderSummaryRuntimeSettings,
  type AgentRuntimeReaderSummaryRuntimeSettings,
} from "./agent-runtime-reader-summary-runtime-settings";

const provider = "agent-runtime";
export { defaultTimeoutMs } from "./agent-runtime-reader-summary-runtime-settings";
export { readerSummaryNarrativeAttempts } from "./agent-runtime-reader-summary-generation";

export class AgentRuntimeReaderSummaryModelAdapter implements ReaderSummaryModelPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly settings: AgentRuntimeReaderSummaryRuntimeSettings;
  private readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;

  constructor(options: AgentRuntimeReaderSummaryModelAdapterOptions) {
    this.client = options.client;
    this.settings = resolveAgentRuntimeReaderSummaryRuntimeSettings(options);
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
      inputTokenDivisor: this.settings.inputTokenDivisor,
      maxOutputTokens: this.settings.maxOutputTokens,
    });
  }

  async planDaily(input: ReaderSummaryModelInput, route: ReaderSummaryModelRoute):
    Promise<ReaderSummaryDailyEditorialAttempt> {
    if (this.settings.legacyRecovery || input.evidence.dailyGenerationInput === undefined)
      throw new Error("Daily editorial planning is not available for this profile");
    return runAgentRuntimeDailyEditor({ input, client: this.client,
      baseCommand: this.buildTaskCommand(input, route, "primary"),
      inputTokenDivisor: this.settings.inputTokenDivisor, maxOutputTokens: this.settings.maxOutputTokens,
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
      evalDatasetVersion: this.settings.evalDatasetVersion,
      legacyRecovery: this.settings.legacyRecovery,
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
      agentProvider: this.settings.agentProvider,
      providerInstanceId: this.settings.providerInstanceId,
      legacyRecovery: this.settings.legacyRecovery,
      modelBackend: this.settings.modelBackend,
      reasoningEffort: this.settings.reasoningEffort,
      model: this.settings.model,
      maxOutputTokens: this.settings.maxOutputTokens,
      timeoutMs: this.settings.timeoutMs,
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
      model: `${this.settings.agentProvider}:${this.settings.model}:${this.settings.reasoningEffort}`,
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
      evalDatasetVersion: this.settings.evalDatasetVersion,
      usage: this.estimate(input, selectedRoute),
    });
  }
}
