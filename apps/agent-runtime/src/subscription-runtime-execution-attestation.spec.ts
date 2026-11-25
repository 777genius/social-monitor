import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import type {
  AgentRuntimeExecutionRequest,
  AgentRuntimeExecutionResult,
} from "./agent-runtime-executor.port";
import { attachExecutorOwnedExecutionAttestation } from "./subscription-runtime-execution-attestation";
import {
  admitSubscriptionRuntimeRequest,
  type SubscriptionRuntimePurposeProfile,
} from "./subscription-runtime-purpose-model-policy";

describe("executor-owned subscription runtime attestation", () => {
  it("ignores provider/stdout attestation claims and binds the selected output", async () => {
    const canonicalRequest = admitSubscriptionRuntimeRequest(request())
      .canonicalRequest;
    const structuredOutput = {
      headline: "verified",
      executionAttestation: { provider: "forged-provider" },
    };
    const result = await attach({ canonicalRequest, structuredOutput });

    expect(result.status).toBe("completed");
    expect(result.executionAttestation).toMatchObject({
      requestId: "request-1",
      purpose: "social_monitor.reader_summary.generate.v2",
      canonicalRequestSha256: canonicalJsonSha256(canonicalRequest),
      provider: "codex",
      selectedOutputSha256: canonicalJsonSha256(structuredOutput),
    });
  });

  it("binds canonical recovery to its exact text profile", async () => {
    const result = await attach({
      purpose: "social_monitor.reader_summary.daily.canonical_recovery.v2",
      controlsJson: '{"model":"gpt-5.6-sol"}',
      metadata: { runtimeOutput: "output_text" },
      outputText: '{"headline":"weekly"}',
    });

    expect(result.executionAttestation).toMatchObject({
      purpose: "social_monitor.reader_summary.daily.canonical_recovery.v2",
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      selectedOutputKind: "output_text",
    });
  });

  it.each([
    ["direct launcher", { inspectorRejects: true }],
    ["wrong provider", { provider: "claude" }],
    ["wrong model", { model: "gpt-4" }],
    ["unknown version", { runtimePackageVersion: "unknown" }],
    ["wrong launcher hash", { launcherSha256: "wrong" }],
    ["missing output", { missingOutput: true }],
    ["wrong daily output kind", { outputText: "{}" }],
  ] as const)("fails closed for %s", async (_label, options) => {
    const result = await attach(options);

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "agent_runtime.execution_attestation_invalid" },
    });
    expect(result.executionAttestation).toBeUndefined();
  });
});

const attach = async (options: {
  readonly canonicalRequest?: Record<string, unknown>;
  readonly structuredOutput?: Record<string, unknown>;
  readonly outputText?: string;
  readonly provider?: "codex" | "claude";
  readonly model?: string;
  readonly purpose?: string;
  readonly controlsJson?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly runtimePackageVersion?: string;
  readonly launcherSha256?: string;
  readonly inspectorRejects?: boolean;
  readonly missingOutput?: boolean;
}): Promise<AgentRuntimeExecutionResult> =>
  attachWithRequest(options, request(options));

const attachWithRequest = (
  options: Parameters<typeof attach>[0],
  executionRequest: AgentRuntimeExecutionRequest,
): Promise<AgentRuntimeExecutionResult> => {
  const admitted = safelyAdmit(executionRequest);
  const profile = {
    ...admitted.profile,
    ...(options.model === undefined ? {} : { model: options.model }),
  } as SubscriptionRuntimePurposeProfile;
  return attachExecutorOwnedExecutionAttestation({
    command: "approved-launcher",
    request: executionRequest,
    canonicalRequest:
      options.canonicalRequest ?? admitted.canonicalRequest,
    result: {
      status: "completed",
      structuredOutput:
        options.missingOutput === true || options.outputText !== undefined
          ? undefined
          : (options.structuredOutput ?? { headline: "ok" }),
      outputText: options.missingOutput === true ? undefined : options.outputText,
      warnings: [],
    },
    profile,
    admittedInstallation: {
      executablePath: "/approved/runtime/bin/approved-launcher",
      packageRootRealpath: "/approved/runtime",
      runtimePackageVersion: options.runtimePackageVersion ?? "0.1.0-main.2",
      launcherSha256: options.launcherSha256 ?? "a".repeat(64),
    },
    installationInspector: {
      inspect: async () => {
        if (options.inspectorRejects === true) {
          throw new Error("unapproved launcher");
        }
        return {
          executablePath: "/approved/runtime/bin/approved-launcher",
          packageRootRealpath: "/approved/runtime",
          runtimePackageVersion:
            options.runtimePackageVersion ?? "0.1.0-main.2",
          launcherSha256: options.launcherSha256 ?? "a".repeat(64),
        };
      },
    },
  });
};

const safelyAdmit = (requestValue: AgentRuntimeExecutionRequest) => {
  try {
    return admitSubscriptionRuntimeRequest(requestValue);
  } catch {
    return admitSubscriptionRuntimeRequest(request());
  }
};

const request = (options: {
  readonly provider?: "codex" | "claude";
  readonly purpose?: string;
  readonly controlsJson?: string;
  readonly metadata?: Readonly<Record<string, string>>;
} = {}): AgentRuntimeExecutionRequest => ({
  requestId: "request-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  correlationId: "correlation-1",
  provider: options.provider ?? "codex",
  purpose: options.purpose ?? "social_monitor.reader_summary.generate.v2",
  systemPrompt: "Return JSON.",
  prompt: "Summarize.",
  outputSchemaJson: "{}",
  controlsJson: options.controlsJson ?? "{}",
  timeoutMs: 1_000,
  metadata: options.metadata ?? {},
});
