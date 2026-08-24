import { createHash } from "node:crypto";

import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { openAiReaderSummaryJsonSchema } from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-schema";
import type { AgentRuntimeClientPort } from "@social-monitor/summary/ports/agent-runtime-client.port";

import {
  GrpcReaderSummaryDailyCanonicalRecoveryRuntime,
  GrpcReaderSummaryDailySubscriptionRuntime,
} from "./grpc-reader-summary-daily-subscription-runtime";
import { canonicalJsonBytes } from "./reader-summary-daily-canonical-recovery-v4";
import {
  readerSummaryDailyCanonicalHistoricalGithubOmissionReason,
} from "./reader-summary-daily-source-authority-snapshot";

const scope = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000002",
};

describe("GrpcReaderSummaryDailySubscriptionRuntime", () => {
  it("sends v1 authority bytes once through gpt-5.6-sol high subscription runtime", async () => {
    const output = { z: 1, a: "exact" };
    const client = fakeClient(output);
    const runtime = new GrpcReaderSummaryDailySubscriptionRuntime(client);
    const authority = Buffer.from('{"schemaVersion":1,"items":[]}', "utf8");

    const result = await runtime.run({
      ...scope,
      modelJobIdentity: "a".repeat(64),
      requestedUtcDate: "2026-07-31",
      sourceAuthorityBytes: authority,
      signal: new AbortController().signal,
    });

    expect(client.runTask).toHaveBeenCalledTimes(1);
    const command = jest.mocked(client.runTask).mock.calls[0]![0];
    expect(command.prompt).toBe(authority.toString("utf8"));
    expect(command.provider).toBe("codex");
    expect(command.controls).toMatchObject({ model: "gpt-5.6-sol" });
    expect(command.metadata).toMatchObject({
      authoritySchemaVersion: "reader_summary.daily_source_authority.v1",
      reasoningEffort: "high",
    });
    expect(result.responseBytes.toString("utf8")).toBe('{"a":"exact","z":1}');
    expect(result.modelTelemetry).toEqual({
      provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "xhigh",
      inputTokens: 120, outputTokens: 30,
      usageSource: "PROVIDER_REPORTED", durationMs: 25,
    });
  });

  it("rejects non-attested, wrong-model, and aborted executions", async () => {
    const output = { value: true };
    const wrongModel = fakeClient(output, "wrong");
    await expect(new GrpcReaderSummaryDailySubscriptionRuntime(wrongModel).run(
      runtimeInput(),
    )).rejects.toThrow(/invalid product result/u);

    const aborted = new AbortController();
    aborted.abort(new Error("lease lost"));
    const client = fakeClient(output);
    await expect(new GrpcReaderSummaryDailySubscriptionRuntime(client).run({
      ...runtimeInput(), signal: aborted.signal,
    })).rejects.toThrow("lease lost");
    expect(client.runTask).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", { usage: undefined }],
    ["partial", { usage: { inputTokens: 1, outputTokens: 2 } }],
    ["malformed", {
      usage: {
        inputTokens: 1, outputTokens: -2, totalTokens: -1,
        estimatedCostUsd: 0,
      },
    }],
    ["missing duration", { durationMs: undefined }],
  ])("blocks completed live publication for %s usage", async (_label, patch) => {
    const client = fakeClient({ value: true }, "gpt-5.6-sol", patch);
    await expect(new GrpcReaderSummaryDailySubscriptionRuntime(client).run(
      runtimeInput(),
    )).rejects.toThrow(/usage is unavailable/u);
  });

  it("preserves a genuine provider-reported zero usage result", async () => {
    const client = fakeClient({ value: true }, "gpt-5.6-sol", {
      usage: {
        inputTokens: 0, outputTokens: 0, totalTokens: 0,
        estimatedCostUsd: 0,
      },
    });
    await expect(new GrpcReaderSummaryDailySubscriptionRuntime(client).run(
      runtimeInput(),
    )).resolves.toMatchObject({
      modelTelemetry: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it("uses the admitted output_text Codex subscription route for V4", async () => {
    const outputText = canonicalJsonBytes(validOutput()).toString("utf8");
    const client = {
      runTask: jest.fn(async () => ({
        status: "completed" as const,
        outputText,
        warnings: [],
        executionAttestation: {
          schemaVersion: 1 as const,
          requestId: "recovery",
          purpose: "social_monitor.reader_summary.weekly.generate",
          canonicalRequestSha256: "a".repeat(64),
          provider: "codex" as const,
          model: "gpt-5.6-sol",
          reasoningEffort: "xhigh",
          runtimeEngine: "subscription-runtime-cli" as const,
          runtimePackageVersion: "1.2.3",
          launcherSha256: "b".repeat(64),
          selectedOutputKind: "output_text" as const,
          selectedOutputSha256: createHash("sha256")
            .update(outputText)
            .digest("hex"),
        },
      })),
      checkHealth: jest.fn(),
    } as unknown as jest.Mocked<AgentRuntimeClientPort>;
    const result = await new GrpcReaderSummaryDailyCanonicalRecoveryRuntime(client)
      .run(canonicalRecoveryInput());
    expect(result.responseBytes.toString("utf8")).toBe(outputText);
    expect(client.runTask).toHaveBeenCalledWith(expect.objectContaining({
      provider: "codex",
      purpose: "social_monitor.reader_summary.weekly.generate",
      systemPrompt: expect.stringContaining(
        `The output must conform exactly to this JSON Schema: ${JSON.stringify(
          openAiReaderSummaryJsonSchema,
        )}`,
      ),
      metadata: expect.objectContaining({
        authoritySchemaVersion: "reader_summary.daily_source_authority.v2",
        runtimeOutput: "output_text",
      }),
    }));
  });

  it("attests raw output_text before canonicalizing reordered outer-whitespace JSON", async () => {
    const output = validOutput();
    const rawOutputText = `\n ${JSON.stringify(
      Object.fromEntries(Object.entries(output).reverse()),
    )}\t`;
    const client = canonicalRecoveryClient(rawOutputText);

    const result = await new GrpcReaderSummaryDailyCanonicalRecoveryRuntime(client)
      .run(canonicalRecoveryInput());

    expect(result.responseBytes).toEqual(canonicalJsonBytes(output));
    expect(result.rawOutputSha256).toBe(hash(rawOutputText));
    expect(result.rawOutputByteLength).toBe(Buffer.byteLength(rawOutputText, "utf8"));
    expect(Object.keys(result)).not.toContain("rawOutputBytes");
  });

  it("rejects a raw output_text attestation mismatch before semantic admission", async () => {
    const outputText = canonicalJsonBytes(validOutput()).toString("utf8");
    const client = canonicalRecoveryClient(outputText, "0".repeat(64));

    await expect(new GrpcReaderSummaryDailyCanonicalRecoveryRuntime(client)
      .run(canonicalRecoveryInput())).rejects.toThrow(/invalid product result/u);
  });

  it("rejects V1 authority before the output_text model call", async () => {
    const client = fakeClient(validOutput());
    const legacy = {
      ...canonicalRecoveryInput(),
      sourceAuthorityBytes: canonicalJsonBytes({
        schemaVersion: 1,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        requestedUtcDate: "2026-07-23",
        ingestionCutoff: "2026-07-24T00:00:00.000Z",
        items: [],
      }),
    };

    await expect(new GrpcReaderSummaryDailyCanonicalRecoveryRuntime(client).run(legacy))
      .rejects.toThrow(/immutable authority v2/u);
    expect(client.runTask).not.toHaveBeenCalled();
  });
});

const runtimeInput = () => ({
  ...scope,
  modelJobIdentity: "a".repeat(64),
  requestedUtcDate: "2026-07-31",
  sourceAuthorityBytes: Buffer.from("{}"),
  signal: new AbortController().signal,
});

const fakeClient = (
  output: Record<string, unknown>,
  selectedModel = "gpt-5.6-sol",
  resultPatch: Readonly<Record<string, unknown>> = {},
) => ({
  runTask: jest.fn(async () => ({
    status: "completed" as const,
    structuredOutput: output,
    warnings: [],
    usage: {
      inputTokens: 120, outputTokens: 30, totalTokens: 150,
      estimatedCostUsd: 0,
    },
    durationMs: 25,
    executionAttestation: {
      schemaVersion: 1 as const,
      requestId: "daily",
      purpose: "social_monitor.reader_summary.generate.v2",
      canonicalRequestSha256: "a".repeat(64),
      provider: "codex" as const,
      model: selectedModel,
      reasoningEffort: "high",
      runtimeEngine: "subscription-runtime-cli" as const,
      runtimePackageVersion: "1.2.3",
      launcherSha256: "b".repeat(64),
      selectedOutputKind: "structured_output" as const,
      selectedOutputSha256: canonicalJsonSha256(output),
    },
    ...resultPatch,
  })),
  checkHealth: jest.fn(),
}) as unknown as jest.Mocked<AgentRuntimeClientPort>;

const canonicalRecoveryInput = () => ({
  ...scope,
  modelJobIdentity: "a".repeat(64),
  requestedUtcDate: "2026-07-23",
  sourceAuthorityBytes: canonicalJsonBytes({
    schemaVersion: 2,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    requestedUtcDate: "2026-07-23",
    ingestionCutoff: "2026-07-24T00:00:00.000Z",
    items: [],
    githubProjection: {
      mode: "historical_omission",
      reason: readerSummaryDailyCanonicalHistoricalGithubOmissionReason,
      authorizedAt: "2026-07-24T00:00:00.000Z",
    },
  }),
  signal: new AbortController().signal,
});

const validOutput = () => ({
  headline: "Canonical day",
  executiveSummary: "Immutable evidence only.",
  narrativeSections: [],
  content: {
    headline: "Canonical day",
    oneLineTakeaway: "Immutable evidence only.",
    bullets: [],
    interestSections: [],
    sourceMix: [],
    topReads: [],
    claimBoard: [],
    reliabilityReport: {
      mode: "shadow",
      policyVersion: "reader_summary.reliability.v1",
      riskLevel: "low",
      riskScore: 0,
      risks: [],
    },
    trendDelta: {
      newSignals: [], growingSignals: [], repeatedSignals: [], fadingSignals: [],
    },
    openQuestions: [],
    risks: [],
    nextActions: [],
  },
  topStories: [],
  interestHighlights: [],
  repeatedSignals: [],
  risksAndUnknowns: [],
  citationMap: [],
  qualityFlags: ["no_signal"],
  confidence: { level: "low", score: 0, rationale: "No invention." },
  noSignalReason: "No immutable signal.",
});

const canonicalRecoveryClient = (outputText: string, selectedOutputSha256 = hash(outputText)) => ({
  runTask: jest.fn(async () => ({
    status: "completed" as const,
    outputText,
    warnings: [],
    executionAttestation: {
      schemaVersion: 1 as const,
      requestId: "recovery",
      purpose: "social_monitor.reader_summary.weekly.generate",
      canonicalRequestSha256: "a".repeat(64),
      provider: "codex" as const,
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      runtimeEngine: "subscription-runtime-cli" as const,
      runtimePackageVersion: "1.2.3",
      launcherSha256: "b".repeat(64),
      selectedOutputKind: "output_text" as const,
      selectedOutputSha256,
    },
  })),
  checkHealth: jest.fn(),
}) as unknown as jest.Mocked<AgentRuntimeClientPort>;

const hash = (value: string): string => createHash("sha256")
  .update(value, "utf8")
  .digest("hex");
