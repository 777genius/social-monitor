import { createHash } from "node:crypto";

import { openAiReaderSummaryJsonSchema } from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-schema";
import {
  activeReaderSummaryModel,
  activeReaderSummaryPurposes,
  activeReaderSummaryReasoningEffort,
} from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskResult,
} from "@social-monitor/summary/ports/agent-runtime-client.port";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryDailySubscriptionRuntime } from "./reader-summary-daily-terminal-runner";
import {
  DailyCanonicalRecoveryRuntimeAbortedError,
  DailyCanonicalRecoveryRuntimeFailureError,
  DailyCanonicalRecoveryRuntimeTransportError,
  sha256 as recoverySha256,
} from "./reader-summary-daily-canonical-recovery-v4";
import {
  assertDailyCanonicalRecoveryOutputSemanticValidity,
  parseDailyCanonicalRecoveryOutputText,
} from "./reader-summary-daily-canonical-recovery-v4-semantic-output";
import {
  verifyReaderSummaryDailyCanonicalRecoveryRawAttestation,
} from "./reader-summary-daily-model-job-receipt";
import {
  isReaderSummaryDailySourceAuthorityV2,
  verifyReaderSummaryDailySourceAuthority,
} from "./reader-summary-daily-source-authority-snapshot";

const purpose = activeReaderSummaryPurposes.generate;
const model = activeReaderSummaryModel;
const reasoningEffort = activeReaderSummaryReasoningEffort;
const canonicalRecoveryPurpose =
  "social_monitor.reader_summary.weekly.generate";
const canonicalRecoveryReasoningEffort = "xhigh";
const canonicalRecoveryOutputSchema = JSON.stringify(
  openAiReaderSummaryJsonSchema,
);

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

/**
 * The recovery uses the subscription-only Codex route, but requests canonical
 * `output_text` so its exact bytes can be bound to the durable consumption row.
 */
export class GrpcReaderSummaryDailyCanonicalRecoveryRuntime
  implements ReaderSummaryDailySubscriptionRuntime
{
  readonly runtimeEngine = "subscription-runtime-cli" as const;

  constructor(
    private readonly client: AgentRuntimeClientPort,
    private readonly timeoutMs = 600_000,
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error("Daily canonical recovery runtime timeout must be positive");
    }
  }

  async run(input: Parameters<ReaderSummaryDailySubscriptionRuntime["run"]>[0]) {
    if (input.signal.aborted) {
      throw new DailyCanonicalRecoveryRuntimeAbortedError();
    }
    assertCanonicalRecoveryAuthorityV2(input);
    let result: AgentRuntimeTaskResult;
    try {
      result = await this.client.runTask({
        requestId: `reader-summary-daily-recovery-v4:${input.modelJobIdentity}`,
        tenantId: tenantId(input.tenantId),
        workspaceId: workspaceId(input.workspaceId),
        correlationId: `reader-summary-daily-recovery-v4:${input.modelJobIdentity}`,
        provider: "codex",
        purpose: canonicalRecoveryPurpose,
        systemPrompt: [
          "Generate exactly one canonical daily Social Monitor reader summary.",
          "The supplied immutable daily source authority v2 is complete.",
          "Do not recollect, backdate, duplicate, or invent evidence.",
          "Citation cN means the Nth authority item; cite only the first 200 items.",
          "Return one JSON object as output_text with no surrounding text.",
          "Do not echo the authority envelope, its schemaVersion, date, or ingestionCutoff.",
          `The output must conform exactly to this JSON Schema: ${canonicalRecoveryOutputSchema}`,
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
          adapter: "reader-summary-daily-canonical-recovery-v4",
          authoritySchemaVersion: "reader_summary.daily_source_authority.v2",
          reasoningEffort: canonicalRecoveryReasoningEffort,
          runtimeOutput: "output_text",
        },
      });
    } catch {
      if (input.signal.aborted) {
        throw new DailyCanonicalRecoveryRuntimeAbortedError();
      }
      throw new DailyCanonicalRecoveryRuntimeTransportError();
    }
    if (input.signal.aborted) {
      throw new DailyCanonicalRecoveryRuntimeAbortedError();
    }
    try {
      const attestation = result.executionAttestation;
      if (
        result.status !== "completed" ||
        result.structuredOutput !== undefined ||
        result.outputText === undefined ||
        attestation === undefined
      ) {
        throw new DailyCanonicalRecoveryRuntimeFailureError(false);
      }
      // The selected provider bytes are transient. Verify their exact digest
      // against the complete 12-key attestation before decoding or sorting any
      // JSON members, then admit and retain only canonical server bytes.
      const rawOutputBytes = Buffer.from(result.outputText, "utf8");
      const rawOutputSha256 = recoverySha256(rawOutputBytes);
      const verifiedAttestation =
        verifyReaderSummaryDailyCanonicalRecoveryRawAttestation(
          attestation,
          rawOutputSha256,
        );
      const admission = parseDailyCanonicalRecoveryOutputText(rawOutputBytes);
      assertDailyCanonicalRecoveryOutputSemanticValidity({
        output: admission.output,
        sourceAuthorityBytes: input.sourceAuthorityBytes,
        schema: openAiReaderSummaryJsonSchema,
        citationSelectionLimit: 200,
      });
      return Object.freeze({
        responseBytes: admission.canonicalBytes,
        rawOutputSha256,
        rawOutputByteLength: rawOutputBytes.length,
        executionAttestation: verifiedAttestation,
      });
    } catch {
      if (input.signal.aborted) {
        throw new DailyCanonicalRecoveryRuntimeAbortedError();
      }
      throw new DailyCanonicalRecoveryRuntimeFailureError(false);
    }
  }
}

const assertCanonicalRecoveryAuthorityV2 = (
  input: Parameters<ReaderSummaryDailySubscriptionRuntime["run"]>[0],
): void => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(input.sourceAuthorityBytes.toString("utf8")) as unknown;
  } catch {
    throw new Error("Daily canonical recovery source authority is not JSON");
  }
  if (
    decoded === null ||
    typeof decoded !== "object" ||
    Array.isArray(decoded) ||
    typeof (decoded as Record<string, unknown>).ingestionCutoff !== "string"
  ) {
    throw new Error("Daily canonical recovery source authority shape is invalid");
  }
  const authority = verifyReaderSummaryDailySourceAuthority({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    requestedUtcDate: input.requestedUtcDate,
    authority: {
      requestedUtcDate: input.requestedUtcDate,
      ingestionCutoff: (decoded as Record<string, unknown>).ingestionCutoff as string,
      canonicalBytes: input.sourceAuthorityBytes,
      canonicalSha256: recoverySha256(input.sourceAuthorityBytes),
    },
  });
  if (!isReaderSummaryDailySourceAuthorityV2(authority)) {
    throw new Error("Daily canonical recovery requires immutable authority v2");
  }
};

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
