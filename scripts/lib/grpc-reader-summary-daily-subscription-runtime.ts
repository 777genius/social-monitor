import { createHash } from "node:crypto";

import { openAiReaderSummaryJsonSchema } from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-schema";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskResult,
} from "@social-monitor/summary/ports/agent-runtime-client.port";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryDailySubscriptionRuntime } from "./reader-summary-daily-terminal-runner";

const purpose = "social_monitor.reader_summary.generate";
const model = "gpt-5.6-sol";
const reasoningEffort = "xhigh";

export class GrpcReaderSummaryDailySubscriptionRuntime
  implements ReaderSummaryDailySubscriptionRuntime
{
  readonly runtimeEngine = "subscription-runtime-cli" as const;

  constructor(
    private readonly client: AgentRuntimeClientPort,
    private readonly timeoutMs = 600_000,
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error("Daily subscription runtime timeout must be positive");
    }
  }

  async run(input: Parameters<ReaderSummaryDailySubscriptionRuntime["run"]>[0]) {
    if (input.signal.aborted) {
      throw input.signal.reason ?? new Error("Daily subscription runtime aborted");
    }
    const result = await this.client.runTask({
      requestId: `reader-summary-daily:${input.modelJobIdentity}`,
      tenantId: tenantId(input.tenantId),
      workspaceId: workspaceId(input.workspaceId),
      correlationId: `reader-summary-daily:${input.modelJobIdentity}`,
      provider: "codex",
      purpose,
      systemPrompt: [
        "Generate the canonical Social Monitor daily reader summary.",
        "Treat the supplied reader_summary.daily_source_authority.v1 JSON bytes as the complete authority.",
        "Never recollect, backdate, or invent source evidence.",
        "Return only the requested structured output.",
      ].join(" "),
      prompt: input.sourceAuthorityBytes.toString("utf8"),
      outputSchema: openAiReaderSummaryJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_reader_summary_artifact",
        schemaVersion: "reader_summary.artifact.v1",
        model,
        maxOutputTokens: 16_000,
      },
      timeoutMs: this.timeoutMs,
      metadata: {
        adapter: "reader-summary-daily-terminal",
        authoritySchemaVersion: "reader_summary.daily_source_authority.v1",
        reasoningEffort,
      },
    });
    if (input.signal.aborted) {
      throw input.signal.reason ?? new Error("Daily subscription runtime aborted");
    }
    return exactCompletedOutput(result);
  }
}

const exactCompletedOutput = (
  result: AgentRuntimeTaskResult,
): Awaited<ReturnType<ReaderSummaryDailySubscriptionRuntime["run"]>> => {
  const attestation = result.executionAttestation;
  if (
    result.status !== "completed" ||
    result.structuredOutput === undefined ||
    attestation === undefined ||
    attestation.purpose !== purpose ||
    attestation.provider !== "codex" ||
    attestation.model !== model ||
    attestation.reasoningEffort !== reasoningEffort ||
    attestation.runtimeEngine !== "subscription-runtime-cli" ||
    attestation.selectedOutputKind !== "structured_output"
  ) {
    throw new Error("Daily subscription runtime returned an invalid product result");
  }
  const responseBytes = canonicalJsonBytes(result.structuredOutput);
  if (sha256(responseBytes) !== attestation.selectedOutputSha256) {
    throw new Error("Daily subscription runtime output diverged from its attestation");
  }
  return {
    responseBytes,
    executionAttestation: Object.freeze({ ...attestation }),
  };
};

const canonicalJsonBytes = (value: unknown): Buffer =>
  Buffer.from(JSON.stringify(toCanonicalJsonValue(value)), "utf8");

const toCanonicalJsonValue = (value: unknown): unknown => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Daily model output is not canonical JSON");
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      entry === undefined ? null : toCanonicalJsonValue(entry));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, toCanonicalJsonValue(entry)]),
    );
  }
  throw new Error("Daily model output is not canonical JSON");
};

const sha256 = (value: Buffer): string =>
  createHash("sha256").update(value).digest("hex");
