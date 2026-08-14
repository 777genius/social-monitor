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
  AgentRuntimeProvider,
  AgentRuntimeTaskCommand,
} from "../../libs/summary/ports/agent-runtime-client.port";

import { readerSummaryWeeklySubscriptionRuntimeFailureFromResult } from "./reader-summary-weekly-execution-receipt";

export const readerSummaryWeeklyProductionModel = "gpt-5.6-sol" as const;

export type ReaderSummaryWeeklyAgentRuntimeModelParams = Readonly<{
  client: AgentRuntimeClientPort;
  provider?: AgentRuntimeProvider;
  model?: string;
  reasoningEffort?: "xhigh";
  timeoutMs?: number;
  maxOutputTokens?: number;
}>;

export class AgentRuntimeReaderSummaryWeeklyTextModel
  implements ReaderSummaryWeeklyModelPort
{
  private readonly provider: AgentRuntimeProvider;
  private readonly model: string;
  private readonly reasoningEffort: "xhigh";
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(private readonly params: ReaderSummaryWeeklyAgentRuntimeModelParams) {
    this.provider = params.provider ?? "codex";
    this.model = params.model ?? readerSummaryWeeklyProductionModel;
    this.reasoningEffort = params.reasoningEffort ?? "xhigh";
    this.timeoutMs = params.timeoutMs ?? 600_000;
    this.maxOutputTokens = params.maxOutputTokens ?? 16_000;
  }

  async generate(
    input: ReaderSummaryWeeklyModelInput,
  ): Promise<ReaderSummaryWeeklyModelOutput> {
    const command = this.command(input);
    const result = await this.params.client.runTask(command);
    if (result.status !== "completed") {
      throw readerSummaryWeeklySubscriptionRuntimeFailureFromResult(
        result.failure,
        result.status,
      );
    }
    const outputText = result.outputText;
    if (outputText === undefined || outputText.trim().length === 0) {
      throw new Error("Reader summary weekly agent-runtime returned no text");
    }
    if (
      result.executionAttestation === undefined ||
      result.executionAttestation.provider !== "codex" ||
      result.executionAttestation.model !== readerSummaryWeeklyProductionModel ||
      result.executionAttestation.reasoningEffort !== "xhigh" ||
      result.executionAttestation.selectedOutputKind !== "output_text"
    ) {
      throw new Error(
        "Reader summary weekly agent-runtime attestation must prove codex gpt-5.6-sol xhigh output_text",
      );
    }
    return parseOpenAiReaderSummaryWeeklyResponse(input, outputText);
  }

  private command(input: ReaderSummaryWeeklyModelInput): AgentRuntimeTaskCommand {
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
      provider: this.provider,
      purpose: "social_monitor.reader_summary.weekly.generate",
      systemPrompt: buildOpenAiReaderSummaryWeeklyInstructions(),
      prompt: buildOpenAiReaderSummaryWeeklyPromptPayload(input),
      outputSchema: buildOpenAiReaderSummaryWeeklyJsonSchema(input),
      controls: {
        interactive: false,
        outputSchemaName: "reader_summary_weekly_output_v1",
        schemaVersion: "reader_summary.weekly_model_output.v1",
        model: this.model,
        maxOutputTokens: this.maxOutputTokens,
      },
      timeoutMs: this.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary-weekly-production",
        promptVersion: currentReaderSummaryWeeklyPromptRelease.id,
        reasoningEffort: this.reasoningEffort,
        runtimeOutput: "output_text",
      },
    };
  }
}
