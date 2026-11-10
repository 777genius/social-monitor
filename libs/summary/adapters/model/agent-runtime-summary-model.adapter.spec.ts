import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
  SummaryModelInput,
} from "../../ports";
import {
  AgentRuntimeSummaryModelAdapter,
  resolveAgentRuntimeSummaryModelOptions,
} from "./agent-runtime-summary-model.adapter";
import { gatewayModelTaskFixture } from "../composition/gateway-model-task.spec-support";
import { resolveGatewayLlmTransportConfig } from "../composition/reader-summary-agent-runtime-transport";

describe("AgentRuntimeSummaryModelAdapter", () => {
  it("executes an ordinary summary through the real gateway SDK request contract", async () => {
    const env = { AGENT_RUNTIME_TRANSPORT: "gateway-llm", AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
      AGENT_RUNTIME_GATEWAY_LLM_CONTROL_ORIGIN: "https://gateway.example.test",
      AGENT_RUNTIME_GATEWAY_LLM_CONTROL_TOKEN_FILE: "/fixture/control-token",
      AGENT_RUNTIME_GATEWAY_LLM_ACCOUNT_REFS: "synthetic-account",
      AGENT_RUNTIME_GATEWAY_LLM_POLICY_SUBJECT_REF: "synthetic-social-monitor",
      AGENT_RUNTIME_GATEWAY_LLM_POLICY_REVISION: "1", AGENT_RUNTIME_GATEWAY_LLM_BINDING_REVISION: "0" };
    const fixture = gatewayModelTaskFixture(resolveGatewayLlmTransportConfig(env).route, validProviderDraft());
    const adapter = new AgentRuntimeSummaryModelAdapter(resolveAgentRuntimeSummaryModelOptions(env, fixture.client));
    const input = buildInput();
    const route = adapter.route(input, { preferredProvider: "agent-runtime", maxInputTokens: 12_000,
      maxOutputTokens: 4_000, maxEstimatedCostUsd: 1 }, { remainingTokens: 20_000, remainingCostUsd: 1 });
    const attempt = await adapter.summarize(input, route);
    expect(attempt.route.model).toBe("codex:gpt-6.1-sol");
    expect(attempt.draft.headline).toBe("Backend signals are converging");
    expect(fixture.bodies).toHaveLength(1);
    expect(fixture.bodies[0]).toMatchObject({ model: "gpt-6.1-sol", reasoning: { effort: "low" },
      max_output_tokens: 16_384, text: { format: { type: "json_schema", strict: true } } });
  });

  it.each([
    ["openai-chatgpt", undefined, "gpt-6.1-sol", "low"],
    ["openai-chatgpt", "agent-runtime-summary", "gpt-6.1-sol", "low"],
    ["kimi-code", undefined, "k3-256k", undefined],
  ])("binds %s summary lineage and task controls to the gateway model", async (backend, alias, model, effort) => {
    const client = new CapturingAgentRuntimeClient({ status: "completed",
      structuredOutput: validProviderDraft(), warnings: [] });
    const adapter = new AgentRuntimeSummaryModelAdapter(resolveAgentRuntimeSummaryModelOptions({
      AGENT_RUNTIME_TRANSPORT: "gateway-llm", AGENT_RUNTIME_READER_SUMMARY_BACKEND: backend,
      AGENT_RUNTIME_SUMMARY_MODEL: alias,
    }, client));
    const input = buildInput();
    const route = adapter.route(input, { preferredProvider: "agent-runtime", maxInputTokens: 12_000, maxOutputTokens: 4_000,
      maxEstimatedCostUsd: 1 }, { remainingTokens: 20_000, remainingCostUsd: 1 });
    const result = await adapter.summarize(input, route);
    expect(result.route.model).toBe(`codex:${model}`);
    expect(client.commands[0]).toMatchObject({ tenantId: input.tenantId, workspaceId: input.workspaceId,
      purpose: "social_monitor.summary.generate", controls: { model } });
    expect(client.commands[0]!.controls.reasoningEffort).toBe(effort);
    expect(client.commands[0]!.controls.modelBackend).toBe(backend === "kimi-code" ? backend : undefined);
  });

  it.each([
    { AGENT_RUNTIME_SUMMARY_MODEL: "gpt-5.6-sol" },
    { AGENT_RUNTIME_SUMMARY_REASONING_EFFORT: "high" },
    { AGENT_RUNTIME_PROVIDER: "claude" },
  ])("rejects a conflicting gateway summary identity: %o", (extra) => {
    expect(() => resolveAgentRuntimeSummaryModelOptions({
      AGENT_RUNTIME_TRANSPORT: "gateway-llm", AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt", ...extra,
    }, new CapturingAgentRuntimeClient({ status: "completed", warnings: [] }))).toThrow();
  });

  it("runs a generic agent task and normalizes structured summary output", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: validProviderDraft(),
      warnings: [],
      usage: {
        inputTokens: 101,
        outputTokens: 55,
        totalTokens: 156,
        estimatedCostUsd: 0,
      },
    });
    const adapter = new AgentRuntimeSummaryModelAdapter({
      client,
      agentProvider: "codex",
      model: "summary-test",
    });
    const input = buildInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 12_000,
        maxOutputTokens: 4_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 20_000,
        remainingCostUsd: 1,
      },
    );

    const attempt = await adapter.summarize(input, route);
    const command = client.commands[0];

    expect(route).toMatchObject({
      provider: "agent-runtime",
      model: "codex:summary-test",
      schemaVersion: "summary.artifact.v1",
    });
    expect(command).toMatchObject({
      provider: "codex",
      purpose: "social_monitor.summary.generate",
      timeoutMs: 120_000,
      controls: expect.objectContaining({
        interactive: false,
        model: "summary-test",
        outputSchemaName: "social_monitor_summary_artifact",
      }),
    });
    expect(command?.requestId).toContain(String(input.tenantId));
    expect(command?.requestId).toContain(String(input.workspaceId));
    expect(command?.correlationId).toContain("summary-correlation");
    expect(command?.metadata).toMatchObject({
      adapter: "agent-runtime-summary",
      promptVersion: route.promptVersion,
    });
    expect(command?.systemPrompt).toContain("Social Monitor");
    expect(command?.prompt).toContain("Backend signals are converging");
    expect(attempt.draft).toMatchObject({
      headline: "Backend signals are converging",
      usage: {
        inputTokens: 101,
        outputTokens: 55,
      },
    });
    expect(adapter.validateRawProviderResponse(attempt)).toEqual({ ok: true });
  });

  it("does not send the default lineage alias as a Codex runtime model", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: validProviderDraft(),
      warnings: [],
    });
    const adapter = new AgentRuntimeSummaryModelAdapter({
      client,
      agentProvider: "codex",
    });
    const input = buildInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 12_000,
        maxOutputTokens: 4_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 20_000,
        remainingCostUsd: 1,
      },
    );

    await adapter.summarize(input, route);

    expect(route.model).toBe("codex:agent-runtime-summary");
    expect(client.commands[0]?.controls).not.toHaveProperty("model");
  });

  it("classifies interactive agent tasks as unsafe_or_refused", async () => {
    const adapter = new AgentRuntimeSummaryModelAdapter({
      client: new CapturingAgentRuntimeClient({
        status: "waiting_for_input",
        warnings: [],
      }),
    });
    const input = buildInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 12_000,
        maxOutputTokens: 4_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 20_000,
        remainingCostUsd: 1,
      },
    );

    await expect(adapter.summarize(input, route)).rejects.toThrow(
      "requested interactive input",
    );

    try {
      await adapter.summarize(input, route);
    } catch (error) {
      expect(adapter.classifyError(error)).toMatchObject({
        kind: "unsafe_or_refused",
        retryable: false,
      });
    }
  });

  it("uses the generic agent runtime timeout as a summary fallback", () => {
    const options = resolveAgentRuntimeSummaryModelOptions(
      {
        AGENT_RUNTIME_TIMEOUT_MS: "90000",
      },
      new CapturingAgentRuntimeClient({
        status: "completed",
        warnings: [],
      }),
    );

    expect(options.timeoutMs).toBe(90_000);
  });
});

class CapturingAgentRuntimeClient implements AgentRuntimeClientPort {
  readonly commands: AgentRuntimeTaskCommand[] = [];

  constructor(private readonly result: AgentRuntimeTaskResult) {}

  async runTask(
    command: AgentRuntimeTaskCommand,
  ): Promise<AgentRuntimeTaskResult> {
    this.commands.push(command);
    return this.result;
  }

  async checkHealth(): Promise<AgentRuntimeHealthResult> {
    return {
      status: "serving",
      runtimeEngine: "test",
      runtimeVersion: "test",
      warnings: [],
    };
  }
}

const buildInput = (): SummaryModelInput => {
  const now = new Date("2026-06-21T10:00:00.000Z");
  const evidenceItems = [
    {
      feedItemId: "feed-1",
      sourceItemId: "source-1",
      sourceBindingId: "binding-reddit",
      providerKey: "reddit",
      title: "Backend signals are converging",
      bodyPreview:
        "Queues, scans and summaries passed through the durable runtime.",
      canonicalUrl: "https://example.test/reddit/backend-signals",
      observedAt: now,
    },
    {
      feedItemId: "feed-2",
      sourceItemId: "source-2",
      sourceBindingId: "binding-github",
      providerKey: "github",
      title: "GitHub issues show API hardening work",
      bodyPreview:
        "Source bindings and queue drains are the active engineering focus.",
      canonicalUrl: "https://example.test/github/api-hardening",
      observedAt: now,
    },
  ];

  return {
    tenantId: tenantId("tenant-agent-runtime-summary-adapter"),
    workspaceId: workspaceId("workspace-agent-runtime-summary-adapter"),
    interestId: "interest-backend-mvp",
    evidence: {
      sourceWindow: {
        windowId: "summary-window-1",
        startedAt: new Date("2026-06-21T09:00:00.000Z"),
        endedAt: now,
        selectedFeedItemIds: evidenceItems.map((item) => item.feedItemId),
      },
      items: evidenceItems,
    },
    policy: {
      language: "en",
      format: "executive_brief",
      tone: "concise",
      maxKeyPoints: 3,
      includeRisks: true,
      includeSourceHighlights: true,
      customInstructions: "Highlight backend MVP readiness.",
      rulesVersion: "summary.rules.policy.v1",
    },
    requestedAt: now,
  };
};

const validProviderDraft = (): Record<string, unknown> => ({
  headline: "Backend signals are converging",
  executiveSummary:
    "The backend monitoring loop has enough evidence to summarize durable provider activity.",
  keyPoints: [
    {
      claim: "Durable backend scan and summary signals are present.",
      citationIds: ["c1"],
    },
  ],
  risksAndUnknowns: [
    {
      description: "Live provider quotas can still limit scan frequency.",
      citationIds: ["c2"],
      reason: "source_limit",
    },
  ],
  sourceHighlights: [
    "Backend durable runtime evidence",
    "Provider smoke coverage",
  ],
  citationMap: [
    {
      citationId: "c1",
      feedItemId: "feed-1",
      sourceItemId: "source-1",
      providerKey: "reddit",
      field: "title",
    },
    {
      citationId: "c2",
      feedItemId: "feed-2",
      sourceItemId: "source-2",
      providerKey: "github",
      field: "bodyPreview",
    },
  ],
  qualityFlags: ["limited_sources"],
  confidence: {
    level: "medium",
    score: 0.62,
    rationale: "Evidence covers two independent source bindings.",
  },
  noSignalReason: null,
});
