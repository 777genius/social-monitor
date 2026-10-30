import type { Prepare, SafeError } from "@agent-teams/account-gateway/contracts";
import { GatewayError } from "@agent-teams/account-gateway/http";
import type { NativeResponse } from "@agent-teams/account-gateway/http";
import { createLlmClient } from "@agent-teams/account-gateway/llm";
import type { ConsumerControlPort, ExecutionPort } from "@agent-teams/account-gateway/llm";
import { isAttestedRuntimeIdentity } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { AgentRuntimeTaskCommand, ReaderSummaryTopicLabelerInput } from "../../../ports";
import { activeReaderSummaryPurposes } from "../active-reader-summary-generation-profile";
import {
  AgentRuntimeReaderSummaryTopicLabeler,
  resolveAgentRuntimeReaderSummaryTopicLabelerOptions,
} from "../agent-runtime-reader-summary-topic-labeler.adapter";
import { verifyAndRecordReaderSummaryExecution } from "../reader-summary-execution-attestation";
import { CooldownRotatingAccountSelector } from "./gateway-llm-account-selector";
import { RunScopedGatewayLlmAttempts } from "./gateway-llm-attempts";
import { GatewayLlmClient, type GatewayLlmRoute } from "./gateway-llm-client";
import { approvedGatewayLlmSdkIdentity } from "./gateway-llm-sdk-identity";

type Access = Awaited<ReturnType<ConsumerControlPort["runAccess"]>>;
type Script = {
  readonly access?: (intent: Prepare) => Promise<Access>;
  readonly request?: (call: number) => Promise<NativeResponse>;
};

const accountA = "00000000-0000-4000-8000-00000000000a";
const accountB = "00000000-0000-4000-8000-00000000000b";
// One required and one optional property: strict mode must make both required.
const schema = { type: "object", properties: { label: { type: "string" },
  note: { type: "string" } }, required: ["label"], additionalProperties: false };
const kimiRoute: GatewayLlmRoute = { profileId: "kimi-code-global-responses-apikey-v1",
  modelBackend: "kimi-code", model: "k3-256k", accountRefs: [accountA, accountB],
  minOutputTokens: 32_768 };

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

const completedStream = (text: string, model = "k3-256k"): NativeResponse => {
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

const harness = (script: Script = {}, runId = "run-1", route: GatewayLlmRoute = kimiRoute) => {
  const prepares: Prepare[] = [];
  const bodies: Record<string, unknown>[] = [];
  const sleeps: number[] = [];
  let requests = 0;
  const execution: ExecutionPort = {
    request: async (_ref, input) => {
      requests += 1;
      bodies.push(JSON.parse(new TextDecoder().decode(input.body)) as Record<string, unknown>);
      return script.request ? script.request(requests) : completedStream('{"label":"AI agents","note":null}');
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
    policy: { subjectRef: "social-monitor", policyRevision: 1, bindingRevision: 1 },
    route,
    attempts: new RunScopedGatewayLlmAttempts(runId),
    accounts: new CooldownRotatingAccountSelector({ busyCooldownMs: 30_000,
      unauthorizedCooldownMs: 3_600_000 }),
    sdk: approvedGatewayLlmSdkIdentity,
    clock: { now: () => new Date() },
    sleep: async (ms) => { sleeps.push(ms); },
  });
  return { client, prepares, bodies, sleeps, requests: () => requests };
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
  controls: { model: "k3-256k", modelBackend: "kimi-code", maxOutputTokens: 6_000 },
  timeoutMs: 60_000,
  ...overrides,
});

const labelInput = {
  tenantId: tenantId("tenant-topic-labeler"),
  workspaceId: workspaceId("workspace-topic-labeler"),
  scope: { type: "workspace" },
  period: { cadence: "daily", startedAt: new Date("2026-06-01T00:00:00.000Z"),
    endedAt: new Date("2026-06-02T00:00:00.000Z"), timezone: "UTC", periodKey: "2026-06-01" },
  requestedAt: new Date("2026-06-02T01:00:00.000Z"),
  clusters: [{ id: "story:codex", storyKey: "codex-agents",
    representativeFeedItemId: "feed-codex-1", duplicateFeedItemIds: [],
    interestIds: ["ai-agents"], providerKeys: ["hacker-news"], score: 0.8,
    observedAtRange: { startedAt: new Date("2026-06-01T00:00:00.000Z"),
      endedAt: new Date("2026-06-01T01:00:00.000Z") },
    whyImportant: ["Developer tooling signal"] }],
  selectedEvidence: [{ feedItemId: "feed-codex-1", sourceItemId: "source-codex-1",
    sourceBindingId: "binding-codex", interestId: "ai-agents", providerKey: "hacker-news",
    canonicalUrl: "https://example.test/codex", title: "Codex adds local agent workflows",
    bodyPreview: "Developers discuss local agent usage.",
    publishedAt: new Date("2026-06-01T00:00:00.000Z"),
    observedAt: new Date("2026-06-01T00:10:00.000Z"), score: 0.8, whyImportant: [] }],
  topStories: [],
  candidates: [{ nodeId: "topic:story:codex", storyClusterId: "story:codex",
    fallbackLabel: "Codex", score: 80, evidenceCount: 1, providerKeys: ["hacker-news"],
    interestIds: ["ai-agents"], keywords: ["codex"], labelCandidates: [] }],
} satisfies ReaderSummaryTopicLabelerInput;

describe("GatewayLlmClient", () => {
  it("serves a Kimi topic label task configured from env end to end", async () => {
    // A strict provider returns every property, with null for the optional ones.
    const output = { nodeLabels: [{ nodeId: "topic:story:codex", topicId: null,
      subject: "Codex", parentSubject: "OpenAI", claimType: "other", qualifier: null,
      confidenceScore: 0.92, groupId: "group:agent-tools", keywords: ["codex"],
      rationale: null }], groups: [{ id: "group:agent-tools", label: "Agent tools",
      semanticAnchors: ["Codex"], nodeIds: ["topic:story:codex"], confidenceScore: 0.92,
      rationale: null }], warnings: null };
    const fake = harness({ request: async () => completedStream(JSON.stringify(output)) });
    const recorded: unknown[] = [];
    const labeler = new AgentRuntimeReaderSummaryTopicLabeler({
      ...resolveAgentRuntimeReaderSummaryTopicLabelerOptions({
        AGENT_RUNTIME_READER_SUMMARY_BACKEND: "kimi-code",
        AGENT_RUNTIME_READER_SUMMARY_MODEL: "gpt-5.6-sol",
        AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT: "high",
      }, fake.client),
      verifiedAttestationSink: { record: (value) => { recorded.push(value); } },
    });

    await expect(labeler.label(labelInput)).resolves.toMatchObject({
      nodeLabels: [expect.objectContaining({ nodeId: "topic:story:codex" })] });
    expect(fake.bodies[0]).toMatchObject({ model: "k3-256k", max_output_tokens: 32_768 });
    expect(fake.bodies[0]).not.toHaveProperty("reasoning");
    expect(recorded).toEqual([expect.objectContaining({ taskRole: "topic_label",
      attestation: expect.objectContaining({ model: "k3-256k", reasoningEffort: "default",
        runtimeEngine: "gateway-llm" }) })]);
  });

  it("runs a Kimi task without reasoning and with an attestation the verifier accepts", async () => {
    const fake = harness();
    const task = command();
    const result = await fake.client.runTask(task);

    // decode removed the null the strict schema added for the optional field
    expect(result).toMatchObject({ status: "completed", structuredOutput: { label: "AI agents" },
      usage: { inputTokens: 40, outputTokens: 9, totalTokens: 49, estimatedCostUsd: 0 } });
    expect(result.structuredOutput).not.toHaveProperty("note");
    const body = fake.bodies[0]!;
    expect(body).not.toHaveProperty("reasoning");
    expect(body).toMatchObject({ model: "k3-256k", max_output_tokens: 32_768, stream: true,
      text: { format: { type: "json_schema", strict: true, schema: {
        required: ["label", "note"], additionalProperties: false,
        properties: { note: { anyOf: [{ type: "string" }, { type: "null" }] } } } } } });
    const attestation = result.executionAttestation!;
    expect(attestation).toMatchObject({ runtimeEngine: "gateway-llm", model: "k3-256k",
      reasoningEffort: "default", launcherSha256: approvedGatewayLlmSdkIdentity.archiveSha256,
      gateway: { attempt: 1, observedModel: "k3-256k",
        profileId: "kimi-code-global-responses-apikey-v1",
        requestRef: `${fake.prepares[0]!.invocationRef}-a1-r` } });
    expect(isAttestedRuntimeIdentity(attestation)).toBe(true);
    expect(fake.prepares[0]).toMatchObject({ profileId: "kimi-code-global-responses-apikey-v1",
      subjectRef: "social-monitor", limits: { tokens: 32_768 } });
    const recorded: unknown[] = [];
    await verifyAndRecordReaderSummaryExecution({ command: task, result, taskRole: "topic_label",
      attempt: "1", normalizedOutput: result.structuredOutput,
      sink: { record: (value) => { recorded.push(value); } } });
    expect(recorded).toHaveLength(1);
  });

  it("sends an OpenRouter route effort and keeps a larger product budget", async () => {
    const fake = harness({ request: async () => completedStream('{"label":"x","note":"y"}',
      "openai/gpt-oss-120b") }, "run-1", { profileId: "openrouter-openai-responses-apikey-v1",
      modelBackend: "openrouter", model: "openai/gpt-oss-120b", reasoningEffort: "medium",
      accountRefs: [accountA], minOutputTokens: 4_096 });
    const task = command({ controls: { model: "openai/gpt-oss-120b", modelBackend: "openrouter",
      reasoningEffort: "medium", maxOutputTokens: 6_000 } });
    const result = await fake.client.runTask(task);

    expect(fake.bodies[0]).toMatchObject({ reasoning: { effort: "medium" }, max_output_tokens: 6_000 });
    expect(result.executionAttestation).toMatchObject({ model: "openai/gpt-oss-120b",
      reasoningEffort: "medium" });
    await expect(verifyAndRecordReaderSummaryExecution({ command: task, result,
      taskRole: "topic_label", attempt: "1", normalizedOutput: result.structuredOutput }))
      .resolves.toBeUndefined();
  });

  it("refuses tasks outside the route before any gateway call", async () => {
    const fake = harness();
    const codex = await fake.client.runTask(command({ controls: { model: "gpt-5.6-sol",
      reasoningEffort: "high" } }));
    const mimo = await fake.client.runTask(command({ controls: { model: "mimo-v2.6-pro",
      modelBackend: "xiaomi-mimo-token-plan", reasoningEffort: "high" } }));
    const effort = await fake.client.runTask(command({ controls: { model: "k3-256k",
      modelBackend: "kimi-code", reasoningEffort: "high" } }));
    const unsupportedSchema = await fake.client.runTask(command({
      outputSchema: { type: "object", properties: {}, patternProperties: {} } }));

    expect(codex.failure).toMatchObject({ code: "unsupported_route", retryable: false });
    expect(mimo.failure).toMatchObject({ code: "unsupported_route", retryable: false });
    expect(effort.failure).toMatchObject({ code: "invalid_request", retryable: false });
    expect(unsupportedSchema.failure).toMatchObject({ code: "invalid_schema",
      details: { gatewayEffect: "not_dispatched" } });
    expect(fake.prepares).toHaveLength(0);
  });

  it("degrades output outside the product schema like a CLI schema normalization failure", async () => {
    for (const text of ["not json", '{"label":7,"note":null}']) {
      const fake = harness({ request: async () => completedStream(text) });
      const result = await fake.client.runTask(command());

      expect(result.failure).toMatchObject({ code: "provider_output_invalid", details: {
        outputValidationStage: "schema_normalization",
        outputValidationCode: "schema_normalization_failed" } });
      expect(fake.requests()).toBe(1);
    }
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
      return completedStream('{"label":"AI agents","note":null}');
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

  it("discards output from a model other than the requested one", async () => {
    const fake = harness({ request: async () => completedStream('{"label":"x"}', "kimi-k2") });
    const result = await fake.client.runTask(command());

    expect(result).toMatchObject({ status: "failed", failure: { code: "provider_model_mismatch" } });
    expect(result.executionAttestation).toBeUndefined();
  });

  it("reports the vendored SDK as the runtime identity", async () => {
    await expect(harness().client.checkHealth()).resolves.toEqual({ status: "serving",
      runtimeEngine: "gateway-llm", runtimeVersion: approvedGatewayLlmSdkIdentity.packageVersion,
      launcherSha256: approvedGatewayLlmSdkIdentity.archiveSha256, warnings: [] });
  });
});
