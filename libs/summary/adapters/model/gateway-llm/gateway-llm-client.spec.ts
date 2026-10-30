import type { Prepare, SafeError } from "@agent-teams/account-gateway/contracts";
import { GatewayError } from "@agent-teams/account-gateway/http";
import type { NativeResponse } from "@agent-teams/account-gateway/http";
import { createLlmClient } from "@agent-teams/account-gateway/llm";
import type { ConsumerControlPort, ExecutionPort } from "@agent-teams/account-gateway/llm";
import { isAttestedRuntimeIdentity } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { AgentRuntimeTaskCommand } from "../../../ports";
import { activeReaderSummaryPurposes } from "../active-reader-summary-generation-profile";
import { verifyAndRecordReaderSummaryExecution } from "../reader-summary-execution-attestation";
import { CooldownRotatingAccountSelector } from "./gateway-llm-account-selector";
import { RunScopedGatewayLlmAttempts } from "./gateway-llm-attempts";
import { GatewayLlmClient } from "./gateway-llm-client";
import { approvedGatewayLlmSdkIdentity } from "./gateway-llm-sdk-identity";

type Access = Awaited<ReturnType<ConsumerControlPort["runAccess"]>>;
type Script = {
  readonly access?: (intent: Prepare) => Promise<Access>;
  readonly request?: (call: number) => Promise<NativeResponse>;
};

const accountA = "00000000-0000-4000-8000-00000000000a";
const accountB = "00000000-0000-4000-8000-00000000000b";
const schema = { type: "object", properties: { label: { type: "string" } },
  required: ["label"], additionalProperties: false };

const grant = (intent: Prepare, accountRef = intent.accountRefs[0]!): Access => ({
  operation: { operationRef: intent.operationId, state: "applied", result: {
    kind: "execution", executionRef: `execution-${intent.attemptRef}`, accountRef,
    authorizationEpoch: 3, deadline: intent.deadline, state: "active" } },
  bearer: "fixture-execution-bearer",
  admission: { invocationRef: intent.invocationRef, attemptRef: intent.attemptRef, accountRef,
    authorizationEpoch: 3, subjectRef: intent.subjectRef, policyRevision: intent.policyRevision,
    bindingRevision: intent.bindingRevision, profileId: intent.profileId, limits: intent.limits,
    expiresAt: intent.deadline },
});

const completedStream = (text: string, model = "gpt-5.6-sol-2026"): NativeResponse => {
  const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ type: "response.completed",
    response: { id: "resp-1", model, status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
      usage: { input_tokens: 40, output_tokens: 9 } } })}\n\n`);
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(bytes);
    controller.close();
  } });
  return { kind: "stream", requestRef: "fixture", body, cancel: async () => {} };
};

const safe = (effect: SafeError["effect"], code: SafeError["code"],
  retry: SafeError["retry"] = { kind: "never" }): GatewayError =>
  new GatewayError("safe_error", effect, undefined, undefined,
    { code, traceRef: "trace-fixture", effect, retry });

const harness = (script: Script = {}, runId = "run-1") => {
  const prepares: Prepare[] = [];
  const sleeps: number[] = [];
  let requests = 0;
  const execution: ExecutionPort = {
    request: async () => {
      requests += 1;
      return script.request ? script.request(requests) : completedStream('{"label":"AI agents"}');
    },
    status: async () => { throw new GatewayError("transport", "effect_unknown"); },
    close: async (_ref, input) => ({ operationRef: input.operationId, state: "applied" }),
  };
  const llm = createLlmClient({
    control: { runAccess: async (intent) => {
      prepares.push(intent);
      return script.access ? script.access(intent) : grant(intent);
    } },
    connectExecution: () => execution,
  });
  const client = new GatewayLlmClient({
    llm,
    policy: { subjectRef: "social-monitor-summary", policyRevision: 1, bindingRevision: 1 },
    routes: { codex: { profileId: "openai-codex-oauth-responses-v1", models: ["gpt-5.6-sol"],
      accountRefs: [accountA, accountB], defaultMaxOutputTokens: 8_000 } },
    attempts: new RunScopedGatewayLlmAttempts(runId),
    accounts: new CooldownRotatingAccountSelector({ busyCooldownMs: 30_000,
      unauthorizedCooldownMs: 3_600_000 }),
    structuredOutput: { plan: (value) => ({ schema: value, decode: (output) => {
      if (output === null || typeof output !== "object" || Array.isArray(output)) {
        throw new Error("not an object");
      }
      return output as Record<string, unknown>;
    } }) },
    sdk: approvedGatewayLlmSdkIdentity,
    clock: { now: () => new Date() },
    sleep: async (ms) => { sleeps.push(ms); },
  });
  return { client, prepares, sleeps, requests: () => requests };
};

const command = (overrides: Partial<AgentRuntimeTaskCommand> = {}): AgentRuntimeTaskCommand => ({
  requestId: "social_monitor.reader_summary.topic_map.label.v2:t:w:digest:1970-01-01T00:00:00.000Z",
  tenantId: tenantId("00000000-0000-7000-8000-000000000901"),
  workspaceId: workspaceId("00000000-0000-7000-8000-000000000902"),
  correlationId: "correlation-1",
  provider: "codex",
  purpose: activeReaderSummaryPurposes.topicLabel,
  systemPrompt: "Label the topic.",
  prompt: '{"posts":["agents"]}',
  outputSchema: schema,
  controls: { model: "gpt-5.6-sol", reasoningEffort: "high" },
  timeoutMs: 60_000,
  ...overrides,
});

describe("GatewayLlmClient", () => {
  it("completes through the gateway with an attestation the summary verifier accepts", async () => {
    const fake = harness();
    const task = command();
    const result = await fake.client.runTask(task);

    expect(result).toMatchObject({ status: "completed", structuredOutput: { label: "AI agents" },
      usage: { inputTokens: 40, outputTokens: 9, totalTokens: 49, estimatedCostUsd: 0 } });
    const attestation = result.executionAttestation!;
    expect(attestation).toMatchObject({ runtimeEngine: "gateway-llm", model: "gpt-5.6-sol",
      reasoningEffort: "high", launcherSha256: approvedGatewayLlmSdkIdentity.archiveSha256,
      gateway: { attempt: 1, observedModel: "gpt-5.6-sol-2026",
        profileId: "openai-codex-oauth-responses-v1",
        requestRef: `${fake.prepares[0]!.invocationRef}-a1-r` } });
    expect(isAttestedRuntimeIdentity(attestation)).toBe(true);
    expect(fake.prepares[0]).toMatchObject({ profileId: "openai-codex-oauth-responses-v1",
      subjectRef: "social-monitor-summary", limits: { tokens: 8_000 } });
    const recorded: unknown[] = [];
    await verifyAndRecordReaderSummaryExecution({ command: task, result, taskRole: "topic_label",
      attempt: "primary", normalizedOutput: result.structuredOutput,
      sink: { record: (value) => { recorded.push(value); } } });
    expect(recorded).toHaveLength(1);
  });

  it("never reuses an attempt identity across calls or runs", async () => {
    const first = harness({}, "run-1");
    await first.client.runTask(command());
    await first.client.runTask(command());
    const second = harness({}, "run-2");
    await second.client.runTask(command());

    expect(first.prepares.map((value) => value.attemptRef)).toEqual(["a1", "a2"]);
    expect(first.prepares[0]!.invocationRef).toBe(first.prepares[1]!.invocationRef);
    expect(second.prepares[0]!.invocationRef).not.toBe(first.prepares[0]!.invocationRef);
  });

  it("moves to the next account after a capacity refusal that cost nothing", async () => {
    const fake = harness({ request: async (call) => {
      if (call === 1) {
        throw safe("not_dispatched", "admission_limited", { kind: "after", milliseconds: 1_500 });
      }
      return completedStream('{"label":"AI agents"}');
    } });
    const result = await fake.client.runTask(command());

    expect(result.status).toBe("completed");
    expect(fake.sleeps).toEqual([1_500]);
    const [firstPrepare, secondPrepare] = fake.prepares;
    expect(secondPrepare!.attemptRef).toBe("a2");
    expect(secondPrepare!.accountRefs[0]).not.toBe(firstPrepare!.accountRefs[0]);
    expect(result.executionAttestation?.gateway?.accountRef).toBe(secondPrepare!.accountRefs[0]);
  });

  it("leaves a possibly paid failure to the caller", async () => {
    const fake = harness({ request: async () => { throw safe("dispatch_started", "upstream_failure"); } });
    const result = await fake.client.runTask(command());

    expect(fake.requests()).toBe(1);
    expect(fake.sleeps).toEqual([]);
    expect(result).toMatchObject({ status: "failed", failure: { code: "provider_failed",
      retryable: true, details: { gatewayMayDuplicateCost: "true", gatewayAttempt: "1" } } });
  });

  it("degrades unparsable output like a CLI schema normalization failure", async () => {
    const fake = harness({ request: async () => completedStream("not json") });
    const result = await fake.client.runTask(command());

    expect(result.failure).toMatchObject({ code: "provider_output_invalid", details: {
      outputValidationStage: "schema_normalization",
      outputValidationCode: "schema_normalization_failed" } });
    expect(fake.requests()).toBe(1);
  });

  it("discards output from a model other than the requested one", async () => {
    const fake = harness({ request: async () => completedStream('{"label":"x"}', "gpt-5.7-mini") });
    const result = await fake.client.runTask(command());

    expect(result).toMatchObject({ status: "failed", failure: { code: "provider_model_mismatch" } });
    expect(result.executionAttestation).toBeUndefined();
  });

  it("rejects routes the gateway does not serve before any gateway call", async () => {
    const fake = harness();
    const result = await fake.client.runTask(command({ controls: { model: "mimo-v2.6-pro",
      modelBackend: "xiaomi-mimo-token-plan", reasoningEffort: "high" } }));

    expect(result.failure).toMatchObject({ code: "unsupported_route", retryable: false });
    expect(fake.prepares).toHaveLength(0);
  });

  it("reports the vendored SDK as the runtime identity", async () => {
    await expect(harness().client.checkHealth()).resolves.toEqual({ status: "serving",
      runtimeEngine: "gateway-llm", runtimeVersion: approvedGatewayLlmSdkIdentity.packageVersion,
      launcherSha256: approvedGatewayLlmSdkIdentity.archiveSha256, warnings: [] });
  });
});
