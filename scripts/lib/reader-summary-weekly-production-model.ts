import type { ReaderSummaryWeeklyGatewayProductionProof } from "./reader-summary-weekly-production-execution-proof";
import { createHash } from "node:crypto";

import {
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  buildOpenAiReaderSummaryWeeklyInstructions,
  buildOpenAiReaderSummaryWeeklyPromptPayload,
  currentReaderSummaryWeeklyPromptRelease,
} from "../../libs/summary/adapters/model/openai-responses-reader-summary-weekly-prompt";
import { parseOpenAiReaderSummaryWeeklyResponse } from "../../libs/summary/adapters/model/openai-responses-reader-summary-weekly-response-parser";
import { buildOpenAiReaderSummaryWeeklyJsonSchema } from "../../libs/summary/adapters/model/openai-responses-reader-summary-weekly-schema";
import type {
  ReaderSummaryWeeklyModelInput,
  ReaderSummaryWeeklyModelOutput,
  ReaderSummaryWeeklyModelPort,
} from "../../libs/summary/ports/reader-summary-weekly-model.port";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
} from "../../libs/summary/ports/agent-runtime-client.port";
import {
  activeReaderSummaryModel,
  activeReaderSummaryProvider,
  activeReaderSummaryPurposes,
  activeReaderSummaryReasoningEffort,
} from "../../libs/summary/adapters/model/active-reader-summary-generation-profile";

import { deepFreezeReaderSummaryWeekly } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { verifyAndRecordReaderSummaryExecution } from "../../libs/summary/adapters/model/reader-summary-execution-attestation";
import {
  assertReaderSummaryWeeklyCommandExecution,
  legacyReaderSummaryWeeklyExecutionProfile,
  type ReaderSummaryWeeklyExecutionProfile,
} from "./reader-summary-weekly-execution-profile";

import { readerSummaryWeeklySubscriptionRuntimeFailureFromResult } from "./reader-summary-weekly-execution-receipt";

export const readerSummaryWeeklyProductionModel = activeReaderSummaryModel;

export type ReaderSummaryWeeklyAgentRuntimeModelParams = Readonly<{
  client: AgentRuntimeClientPort;
  provider?: typeof activeReaderSummaryProvider;
  model?: string;
  executionProfile?: ReaderSummaryWeeklyExecutionProfile;
  reasoningEffort?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
}>;

export class AgentRuntimeReaderSummaryWeeklyTextModel
  implements ReaderSummaryWeeklyModelPort
{
  private lastGatewayProof: ReaderSummaryWeeklyGatewayProductionProof | undefined;

  getGatewayExecutionProof(): ReaderSummaryWeeklyGatewayProductionProof | undefined {
    if (this.params.executionProfile?.transport === "gateway-llm" && this.lastGatewayProof === undefined) {
      throw new Error("Weekly gateway generation lacks verified execution proof");
    }
    return this.lastGatewayProof;
  }

  private readonly provider: typeof activeReaderSummaryProvider;
  private readonly model: string;
  private readonly reasoningEffort: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(private readonly params: ReaderSummaryWeeklyAgentRuntimeModelParams) {
    this.provider = params.provider ?? activeReaderSummaryProvider;
    this.model = params.model ?? params.executionProfile?.model ?? readerSummaryWeeklyProductionModel;
    this.reasoningEffort =
      params.reasoningEffort ?? params.executionProfile?.reasoningEffort ?? activeReaderSummaryReasoningEffort;
    this.timeoutMs = params.timeoutMs ?? 600_000;
    this.maxOutputTokens = params.maxOutputTokens ?? 16_000;
  }

  async generate(
    input: ReaderSummaryWeeklyModelInput,
  ): Promise<ReaderSummaryWeeklyModelOutput> {
    this.lastGatewayProof = undefined;
    const command = this.command(input);
    const result = await this.params.client.runTask(command);
    if (result.status !== "completed") {
      throw readerSummaryWeeklySubscriptionRuntimeFailureFromResult(
        result.failure,
        result.status,
      );
    }
    const profile = this.params.executionProfile ?? legacyReaderSummaryWeeklyExecutionProfile;
    const outputText = profile.transport === "gateway-llm"
      ? result.structuredOutput === undefined ? undefined : JSON.stringify(result.structuredOutput)
      : result.outputText;
    if (outputText === undefined || outputText.trim().length === 0) {
      throw new Error("Reader summary weekly agent-runtime returned no text");
    }
    if (result.executionAttestation === undefined) {
      throw new Error("Reader summary weekly execution attestation is absent");
    }
    assertReaderSummaryWeeklyCommandExecution(command, result.executionAttestation, profile);
    const output = parseOpenAiReaderSummaryWeeklyResponse(input, outputText);
    await verifyAndRecordReaderSummaryExecution({ command, result,
      taskRole: "weekly_generate", attempt: "1", normalizedOutput: output,
      selectedOutputKind: profile.transport === "gateway-llm" ? "structured_output" : "output_text",
    });
    if (profile.transport === "gateway-llm" && result.executionAttestation.runtimeEngine === "gateway-llm") {
      this.lastGatewayProof = deepFreezeReaderSummaryWeekly({
        provider: "gateway-llm", agentProvider: "codex", model: this.model,
        reasoningEffort: this.reasoningEffort, runtimeOutput: "structured_output",
        gatewayMinOutputTokens: profile.gatewayMinOutputTokens!, maxOutputTokens: this.maxOutputTokens,
        executionAttestation: JSON.parse(JSON.stringify(result.executionAttestation)),
        rawStructuredOutput: JSON.parse(JSON.stringify(result.structuredOutput)),
      });
    }
    return output;
  }

  private command(input: ReaderSummaryWeeklyModelInput): AgentRuntimeTaskCommand {
    return buildReaderSummaryWeeklyGenerationCommand(input, {
      provider: this.provider, model: this.model, reasoningEffort: this.reasoningEffort,
      maxOutputTokens: this.maxOutputTokens, timeoutMs: this.timeoutMs,
      transport: this.params.executionProfile?.transport ?? "agent-runtime",
    });
  }
}

export const buildReaderSummaryWeeklyGenerationCommand = (
  input: ReaderSummaryWeeklyModelInput,
  config: Readonly<{ provider: "codex"; model: string; reasoningEffort: string;
    maxOutputTokens: number; timeoutMs: number; transport: "agent-runtime" | "gateway-llm" }>,
): AgentRuntimeTaskCommand => {
    const requestId = [
      "reader-summary-weekly",
      input.tenantId,
      input.workspaceId,
      input.weekStartedOn,
      createHash("sha256")
        .update(`${input.sealSha}:${currentReaderSummaryWeeklyPromptRelease.id}`)
        .digest("hex")
        .slice(0, 24),
    ].join(":");
    return {
      requestId,
      tenantId: tenantId(input.tenantId),
      workspaceId: workspaceId(input.workspaceId),
      correlationId: `${requestId}:correlation`,
      provider: config.provider,
      purpose: activeReaderSummaryPurposes.weeklyGenerate,
      systemPrompt: buildOpenAiReaderSummaryWeeklyInstructions(),
      prompt: buildOpenAiReaderSummaryWeeklyPromptPayload(input),
      outputSchema: buildOpenAiReaderSummaryWeeklyJsonSchema(input),
      controls: {
        interactive: false,
        outputSchemaName: "reader_summary_weekly_output_v1",
        schemaVersion: "reader_summary.weekly_model_output.v1",
        model: config.model,
        reasoningEffort: config.reasoningEffort,
        maxOutputTokens: config.maxOutputTokens,
      },
      timeoutMs: config.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary-weekly-production",
        promptVersion: currentReaderSummaryWeeklyPromptRelease.id,
        reasoningEffort: config.reasoningEffort,
        runtimeOutput: config.transport === "gateway-llm"
          ? "structured_output" : "output_text",
      },
    };
};
