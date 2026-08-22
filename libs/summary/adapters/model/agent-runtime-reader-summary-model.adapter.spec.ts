import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { buildReaderSummaryCoveragePlan } from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
  ReaderSummaryModelInput,
} from "../../ports";
import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
import {
  eligiblePromotionQuality,
  redditPromotionFacts,
} from "./reader-summary-model-promotion.spec-support";
import { withTestExecutionAttestation } from "./reader-summary-execution-attestation.spec-support";
import type { VerifiedReaderSummaryExecutionAttestation } from "./reader-summary-execution-attestation";
import { currentReaderSummaryPromptRelease } from "./openai-responses-reader-summary-prompt";

describe("AgentRuntimeReaderSummaryModelAdapter", () => {
  it("uses the strict production Codex model and effort by default", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: validReaderProviderDraft(),
      warnings: [],
    });
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client,
      agentProvider: "codex",
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 24_000,
        maxOutputTokens: 16_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 40_000,
        remainingCostUsd: 1,
      },
    );

    await adapter.generate(input, route);

    expect(route.model).toBe("codex:gpt-5.6-sol:xhigh");
    expect(route.promptVersion).toBe(currentReaderSummaryPromptRelease.id);
    expect(client.commands).toHaveLength(1);
    expect(adapter.estimate(input, route).outputTokens).toBe(3_200);
    expect(client.commands[0]?.systemPrompt).toContain(
      "Return narrativeSections as the canonical reader narrative",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "one secondary_signal for every entry in coveragePlan.secondary",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "complete narrative 220-320 words",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "Rewrite conversational, question-style or truncated source titles",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "Preserve material qualifiers exactly as stated",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "must explain why the item matters",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "each topStories summary 420-650 characters",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "Keep source validation out of topStories summary prose",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "return 12-15 topStories",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "evidencePack.confidence as a ceiling",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "RSS is a delivery mechanism",
    );
    expect(client.commands[0]?.controls).toMatchObject({
      model: "gpt-5.6-sol",
    });
    expect(client.commands[0]?.timeoutMs).toBe(600_000);
    expect(client.commands[0]?.metadata).toMatchObject({
      reasoningEffort: "xhigh",
    });
  });

  it("keeps an explicitly source-framed generated headline grounded", async () => {
    const providerDraft = validReaderProviderDraft();
    providerDraft.headline =
      "Reddit discussion highlights developers routing GPT-5.6 Sol through Claude Code.";
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client: new CapturingAgentRuntimeClient({
        status: "completed",
        structuredOutput: providerDraft,
        warnings: [],
      }),
      agentProvider: "codex",
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 24_000,
        maxOutputTokens: 16_000,
        maxEstimatedCostUsd: 1,
      },
      { remainingTokens: 40_000, remainingCostUsd: 1 },
    );

    const attempt = await adapter.generate(input, route);

    expect(attempt.draft.headline).toBe(
      "Reddit discussion highlights developers routing GPT-5.6 Sol through Claude Code",
    );
    expect(attempt.draft.content?.headline).not.toMatch(/[.\u2026\u3002]$/u);
  });

  it("publishes the final grounded content headline at the draft top level", async () => {
    const providerDraft = validReaderProviderDraft();
    providerDraft.headline =
      "Agent runtime reports lead a day of reliability signals";
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client: new CapturingAgentRuntimeClient({
        status: "completed",
        structuredOutput: providerDraft,
        warnings: [],
      }),
      agentProvider: "codex",
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 24_000,
        maxOutputTokens: 16_000,
        maxEstimatedCostUsd: 1,
      },
      { remainingTokens: 40_000, remainingCostUsd: 1 },
    );

    const attempt = await adapter.generate(input, route);

    expect(attempt.draft.headline).toBe(attempt.draft.content?.headline);
    expect(attempt.draft.headline).not.toBe(providerDraft.headline);
  });

  it("passes an explicit real runtime model through controls", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: validReaderProviderDraft(),
      warnings: [],
    });
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client,
      agentProvider: "codex",
      model: "gpt-5.6-sol",
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 24_000,
        maxOutputTokens: 16_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 40_000,
        remainingCostUsd: 1,
      },
    );

    await adapter.generate(input, route);

    expect(route.model).toBe("codex:gpt-5.6-sol:xhigh");
    expect(client.commands[0]?.controls).toMatchObject({
      model: "gpt-5.6-sol",
    });
  });

  it("rejects output-text attestations on the daily structured route", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      outputText: JSON.stringify(validReaderProviderDraft()),
      warnings: [],
    });
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client,
      agentProvider: "codex",
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 24_000,
        maxOutputTokens: 16_000,
        maxEstimatedCostUsd: 1,
      },
      { remainingTokens: 40_000, remainingCostUsd: 1 },
    );

    await expect(adapter.generate(input, route)).rejects.toThrow(
      "Reader summary execution attestation is invalid",
    );
  });

  it("promotes a cited main signal to lead without changing its evidence", async () => {
    const draft = validReaderProviderDraft();
    draft.narrativeSections = [
      {
        kind: "main_signal",
        title: "Main signal",
        text: "Agent runtime reliability is the strongest daily signal.",
        citationIds: ["c1"],
        storyClusterId: null,
      },
    ];
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client: new CapturingAgentRuntimeClient({
        status: "completed",
        structuredOutput: draft,
        warnings: [],
      }),
      agentProvider: "codex",
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 24_000,
        maxOutputTokens: 16_000,
        maxEstimatedCostUsd: 1,
      },
      { remainingTokens: 40_000, remainingCostUsd: 1 },
    );

    const attempt = await adapter.generate(input, route);

    expect(attempt.draft.content?.narrativeSections).toEqual([
      expect.objectContaining({
        kind: "lead",
        citationIds: ["c1"],
        text: "Agent runtime reliability is the strongest daily signal.",
      }),
    ]);
  });

  it("repairs blank structural titles without another model request", async () => {
    const draft = validReaderProviderDraft();
    const sections = draft.narrativeSections as Record<string, unknown>[];
    sections[0] = { ...sections[0], title: "" };
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: draft,
      warnings: [],
    });
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client,
      agentProvider: "codex",
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 24_000,
        maxOutputTokens: 16_000,
        maxEstimatedCostUsd: 1,
      },
      { remainingTokens: 40_000, remainingCostUsd: 1 },
    );

    const attempt = await adapter.generate(input, route);

    expect(client.commands).toHaveLength(1);
    expect(attempt.draft.content?.narrativeSections?.[0]?.title).toBe(
      "Agent runtime reliability tradeoffs",
    );
  });

  it("recovers blank narrative text from the cited normalized story", async () => {
    const draft = validReaderProviderDraft();
    const sections = draft.narrativeSections as Record<string, unknown>[];
    sections[0] = { ...sections[0], text: "" };
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: draft,
      warnings: [],
    });
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client,
      agentProvider: "codex",
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 24_000,
        maxOutputTokens: 16_000,
        maxEstimatedCostUsd: 1,
      },
      { remainingTokens: 40_000, remainingCostUsd: 1 },
    );

    const attempt = await adapter.generate(input, route);

    expect(client.commands).toHaveLength(1);
    expect(attempt.draft.content?.narrativeSections?.[0]?.text).toBe(
      "The current discussion focuses on reliability and operational control.",
    );
  });

  it("runs one bounded repair task for an invalid narrative contract", async () => {
    const captured: VerifiedReaderSummaryExecutionAttestation[] = [];
    const invalidDraft = validReaderProviderDraft();
    invalidDraft.narrativeSections = [
      {
        kind: "watch",
        title: "Watch",
        text: "Runtime reliability still needs monitoring.",
        citationIds: ["c1"],
        storyClusterId: null,
      },
    ];
    const client = new CapturingAgentRuntimeClient([
      {
        status: "completed",
        structuredOutput: invalidDraft,
        warnings: [],
      },
      {
        status: "completed",
        structuredOutput: validReaderProviderDraft(),
        warnings: [],
      },
    ]);
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client,
      agentProvider: "codex",
      verifiedAttestationSink: {
        record: (value) => {
          captured.push(value);
        },
      },
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 24_000,
        maxOutputTokens: 16_000,
        maxEstimatedCostUsd: 1,
      },
      { remainingTokens: 40_000, remainingCostUsd: 1 },
    );

    await adapter.generate(input, route);

    expect(client.commands).toHaveLength(2);
    expect(client.commands[1]).toMatchObject({
      purpose: "social_monitor.reader_summary.repair",
      metadata: expect.objectContaining({ attempt: "repair" }),
    });
    expect(client.commands[1]?.systemPrompt).toContain(
      "narrativeSections[0] must have kind lead",
    );
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      taskRole: "summary",
      attempt: "repair",
      attestation: {
        requestId: client.commands[1]?.requestId,
        purpose: "social_monitor.reader_summary.repair",
      },
    });
  });
});

class CapturingAgentRuntimeClient implements AgentRuntimeClientPort {
  readonly commands: AgentRuntimeTaskCommand[] = [];
  private readonly results: readonly AgentRuntimeTaskResult[];
  private resultIndex = 0;

  constructor(
    result: AgentRuntimeTaskResult | readonly AgentRuntimeTaskResult[],
  ) {
    this.results = Array.isArray(result) ? result : [result];
  }

  async runTask(
    command: AgentRuntimeTaskCommand,
  ): Promise<AgentRuntimeTaskResult> {
    this.commands.push(command);
    const result = this.results[this.resultIndex] ?? this.results.at(-1);
    this.resultIndex += 1;
    if (result === undefined) {
      throw new Error("No captured agent-runtime result configured");
    }
    return withTestExecutionAttestation(command, result);
  }

  async checkHealth(service: string): Promise<AgentRuntimeHealthResult> {
    void service;

    return {
      status: "serving",
      runtimeEngine: "test",
      runtimeVersion: "test",
      warnings: [],
    };
  }
}

const readerSummaryInput = (): ReaderSummaryModelInput => {
  const observedAt = new Date("2026-06-23T08:01:00.000Z");
  const selectedEvidence = [
    {
      feedItemId: "feed-reddit",
      sourceItemId: "source-reddit",
      sourceBindingId: "binding-reddit",
      interestId: "interest-ai",
      providerKey: "reddit",
      canonicalUrl: "https://example.test/reddit/agent-runtime",
      title: "Agent runtime discussions are accelerating",
      bodyPreview: "Developers compare agent runtime reliability tradeoffs.",
      publishedAt: new Date("2026-06-23T08:00:00.000Z"),
      observedAt,
      score: 2.4,
      whyImportant: ["Fresh item in the current monitoring window"],
      contentQuality: eligiblePromotionQuality(),
      promotionFacts: redditPromotionFacts(
        "https://example.test/reddit/agent-runtime",
        observedAt,
      ),
    },
  ];

  const evidence = {
    rankingPolicyVersion: "story_ranking_v1",
    sourceWindow: {
      windowId: "workspace:agent-runtime-reader-summary",
      startedAt: observedAt,
      endedAt: observedAt,
      periodStartedAt: new Date("2026-06-23T00:00:00.000Z"),
      periodEndedAt: new Date("2026-06-24T00:00:00.000Z"),
      ingestionCutoff: observedAt,
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: ["story:agent-runtime-reader"],
    },
    clusters: [
      {
        id: "story:agent-runtime-reader",
        storyKey: "url:example.test/reddit/agent-runtime",
        representativeFeedItemId: "feed-reddit",
        duplicateFeedItemIds: [],
        interestIds: ["interest-ai"],
        providerKeys: ["reddit"],
        score: 2.4,
        observedAtRange: {
          startedAt: observedAt,
          endedAt: observedAt,
        },
        whyImportant: ["Fresh item"],
      },
    ],
    selectedEvidence,
  };

  return {
    tenantId: tenantId("tenant-agent-runtime-reader-summary-adapter"),
    workspaceId: workspaceId("workspace-agent-runtime-reader-summary-adapter"),
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt: new Date("2026-06-23T00:00:00.000Z"),
      endedAt: new Date("2026-06-24T00:00:00.000Z"),
      timezone: "UTC",
      periodKey: "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
    },
    evidence,
    coveragePlan: buildReaderSummaryCoveragePlan(evidence),
    contextArtifacts: [],
    policy: {
      language: "auto",
      format: "executive_brief",
      tone: "analytical",
      maxStories: 10,
      includeRisks: true,
      includeInterestHighlights: true,
      includeRepeatedSignals: true,
      dedupeStrategy: "canonical_url_then_title",
      rulesVersion: "reader_summary.rules.test.v1",
    },
    requestedAt: new Date("2026-06-23T08:31:00.000Z"),
  };
};

const validReaderProviderDraft = (): Record<string, unknown> => ({
  headline: "Agent runtime discussions are accelerating",
  executiveSummary:
    "Developers are comparing agent runtime reliability and production tradeoffs.",
  narrativeSections: [
    {
      kind: "lead",
      title: "Overview",
      text: "Developers are comparing agent runtime reliability and production tradeoffs.",
      citationIds: ["c1"],
      storyClusterId: null,
    },
  ],
  topStories: [
    {
      storyClusterId: "story:agent-runtime-reader",
      title: "Agent runtime reliability tradeoffs",
      summary:
        "The current discussion focuses on reliability and operational control.",
      interestIds: ["interest-ai"],
      providerKeys: ["reddit"],
      citationIds: ["c1"],
    },
  ],
  interestHighlights: [
    {
      interestId: "interest-ai",
      title: "Agent runtime reliability",
      summary: "Reliability is the active comparison point.",
      citationIds: ["c1"],
    },
  ],
  repeatedSignals: [
    {
      storyClusterId: "story:agent-runtime-reader",
      title: "Agent runtime reliability",
      interestIds: ["interest-ai"],
      citationIds: ["c1"],
    },
  ],
  risksAndUnknowns: [
    {
      description: "Provider runtime failures can still require fallback.",
      citationIds: ["c1"],
      reason: "source_limit",
    },
  ],
  citationMap: [
    {
      citationId: "c1",
      feedItemId: "feed-reddit",
      sourceItemId: "source-reddit",
      providerKey: "reddit",
      field: "title",
      canonicalUrl: "https://example.test/reddit/agent-runtime",
    },
  ],
  qualityFlags: ["limited_sources"],
  confidence: {
    level: "medium",
    score: 0.7,
    rationale: "The draft is grounded in one selected evidence item.",
  },
  noSignalReason: null,
});
