import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import type {
  AgentRuntimeExecutionRequest,
  AgentRuntimeExecutionResult,
} from "./agent-runtime-executor.port";
import { attachExecutorOwnedExecutionAttestation } from "./subscription-runtime-execution-attestation";

describe("executor-owned subscription runtime attestation", () => {
  it("ignores provider/stdout attestation claims and binds the selected output", async () => {
    const canonicalRequest = { task: { prompt: "summarize" }, runId: "r1" };
    const structuredOutput = {
      headline: "verified",
      executionAttestation: { provider: "forged-provider" },
    };
    const result = await attach({ canonicalRequest, structuredOutput });

    expect(result.status).toBe("completed");
    expect(result.executionAttestation).toMatchObject({
      requestId: "request-1",
      purpose: "social_monitor.reader_summary.generate",
      canonicalRequestSha256: canonicalJsonSha256(canonicalRequest),
      provider: "codex",
      selectedOutputSha256: canonicalJsonSha256(structuredOutput),
    });
  });

  it.each([
    ["direct launcher", { inspectorRejects: true }],
    ["wrong provider", { provider: "claude" }],
    ["wrong model", { model: "gpt-4" }],
    ["unknown version", { runtimePackageVersion: "unknown" }],
    ["wrong launcher hash", { launcherSha256: "wrong" }],
    ["missing output", { missingOutput: true }],
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
  readonly provider?: "codex" | "claude";
  readonly model?: string;
  readonly runtimePackageVersion?: string;
  readonly launcherSha256?: string;
  readonly inspectorRejects?: boolean;
  readonly missingOutput?: boolean;
}): Promise<AgentRuntimeExecutionResult> =>
  attachExecutorOwnedExecutionAttestation({
    command: "approved-launcher",
    request: request(options.provider),
    canonicalRequest: options.canonicalRequest ?? { runId: "request-1" },
    result: {
      status: "completed",
      structuredOutput: options.missingOutput
        ? undefined
        : (options.structuredOutput ?? { headline: "ok" }),
      warnings: [],
    },
    model: options.model ?? "gpt-5.5",
    reasoningEffort: "xhigh",
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

const request = (
  provider: "codex" | "claude" = "codex",
): AgentRuntimeExecutionRequest => ({
  requestId: "request-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  correlationId: "correlation-1",
  provider,
  purpose: "social_monitor.reader_summary.generate",
  systemPrompt: "Return JSON.",
  prompt: "Summarize.",
  outputSchemaJson: "{}",
  controlsJson: "{}",
  timeoutMs: 1_000,
  metadata: {},
});
