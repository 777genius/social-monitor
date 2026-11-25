import {
  AgentRuntimeReaderSummaryModelAdapter,
  resolveAgentRuntimeReaderSummaryModelOptions,
} from "./agent-runtime-reader-summary-model.adapter";
import {
  CapturingAgentRuntimeClient,
  readerSummaryInput,
  validReaderProviderDraft,
} from "./agent-runtime-reader-summary-model.spec-support";
import { resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions } from
  "./agent-runtime-reader-summary-story-relation-verifier.adapter";
import { frozenLegacyReaderSummaryRecoveryContract } from "./active-reader-summary-generation-profile";
import type { VerifiedReaderSummaryExecutionAttestation } from "./reader-summary-execution-attestation";
import { currentReaderSummaryPromptRelease } from "./openai-responses-reader-summary-prompt";

describe("AgentRuntimeReaderSummaryModelAdapter", () => {
  it("selects MiMo daily work through the explicit reader summary backend", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: validReaderProviderDraft(),
      warnings: [],
    });
    const options = resolveAgentRuntimeReaderSummaryModelOptions({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
      AGENT_RUNTIME_READER_SUMMARY_MODEL: "gpt-5.6-sol",
      AGENT_RUNTIME_READER_SUMMARY_GENERATION_MODEL: "mimo-v2.6-pro",
    }, client);
    const adapter = new AgentRuntimeReaderSummaryModelAdapter(options);
    const input = readerSummaryInput();
    const route = adapter.route(input, {
      preferredProvider: "agent-runtime",
      maxInputTokens: 24_000,
      maxOutputTokens: 16_000,
      maxEstimatedCostUsd: 1,
    }, { remainingTokens: 40_000, remainingCostUsd: 1 });

    await adapter.generate(input, route);

    expect(route.model).toBe("codex:mimo-v2.6-pro:high");
    expect(client.commands[0]).toMatchObject({
      provider: "codex",
      purpose: "social_monitor.reader_summary.generate.v2",
      controls: { model: "mimo-v2.6-pro", modelBackend: "xiaomi-mimo-token-plan", reasoningEffort: "high" },
    });
    const sharedEnv = {
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
      AGENT_RUNTIME_READER_SUMMARY_MODEL: "gpt-5.6-sol",
    };
    expect(resolveAgentRuntimeReaderSummaryModelOptions(sharedEnv, client).model)
      .toBe("mimo-v2.6-pro");
    expect(resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions(
      sharedEnv, client,
    ).model).toBe("mimo-v2.6-pro");
    expect(() => resolveAgentRuntimeReaderSummaryModelOptions({
      ...sharedEnv,
      AGENT_RUNTIME_READER_SUMMARY_GENERATION_MODEL: "gpt-5.6-sol",
    }, client)).toThrow("MiMo reader summary model conflicts with purpose policy");
    expect(() => resolveAgentRuntimeReaderSummaryModelOptions({
      AGENT_RUNTIME_READER_SUMMARY_GENERATION_MODEL: "mimo-v2.6-pro",
    }, client)).toThrow("AGENT_RUNTIME_READER_SUMMARY_MODEL must be gpt-5.6-sol");
    expect(() => resolveAgentRuntimeReaderSummaryModelOptions({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
      AGENT_RUNTIME_READER_SUMMARY_MODEL: "mimo-v2.6-pro",
    }, client)).toThrow("AGENT_RUNTIME_READER_SUMMARY_MODEL must be gpt-5.6-sol");
    expect(() => new AgentRuntimeReaderSummaryModelAdapter({
      client,
      modelBackend: "xiaomi-mimo-token-plan",
      model: "mimo-v2.6-pro",
      legacyRecoveryContract: frozenLegacyReaderSummaryRecoveryContract,
    })).toThrow("MiMo reader summary model conflicts with purpose policy");
  });

  it("renders the canonical narrative when the duplicate executive summary is empty", async () => {
    const providerDraft = validReaderProviderDraft();
    providerDraft.executiveSummary = "";
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: providerDraft,
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

    expect(attempt.draft.executiveSummary).toContain(
      "Developers are comparing agent runtime reliability",
    );
    expect(client.commands).toHaveLength(1);
  });

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

    expect(route.model).toBe("codex:gpt-5.6-sol:high");
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
      "its concrete product or workflow impact",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "each topStories summary 140-300 characters",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "Keep source validation out of topStories summary prose",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "Return at most 8 topStories, matching editorialSlate.top exactly",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "evidencePack.confidence as a ceiling",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "RSS is a delivery mechanism",
    );
    expect(client.commands[0]?.controls).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      toolsEnabled: false,
      toolPolicy: "none",
    });
    expect(client.commands[0]?.timeoutMs).toBe(600_000);
    expect(client.commands[0]?.metadata).toMatchObject({
      reasoningEffort: "high",
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

    expect(route.model).toBe("codex:gpt-5.6-sol:high");
    expect(client.commands[0]?.controls).toMatchObject({
      model: "gpt-5.6-sol",
    });
  });

  it("keeps the frozen xhigh purpose available only to explicit recovery", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: validReaderProviderDraft(),
      warnings: [],
    });
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client,
      legacyRecoveryContract: frozenLegacyReaderSummaryRecoveryContract,
      reasoningEffort: "xhigh",
    });
    const input = readerSummaryInput();
    const route = adapter.route(input, {
      preferredProvider: "agent-runtime",
      maxInputTokens: 24_000,
      maxOutputTokens: 16_000,
      maxEstimatedCostUsd: 1,
    }, { remainingTokens: 40_000, remainingCostUsd: 1 });

    await adapter.generate(input, route);

    expect(route.model).toBe("codex:gpt-5.6-sol:xhigh");
    expect(client.commands[0]).toMatchObject({
      purpose: "social_monitor.reader_summary.generate",
      controls: { reasoningEffort: "xhigh" },
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
        usage: {
          inputTokens: 101,
          outputTokens: 11,
          totalTokens: 112,
          estimatedCostUsd: 0.01,
        },
      },
      {
        status: "completed",
        structuredOutput: validReaderProviderDraft(),
        warnings: [],
        usage: {
          inputTokens: 202,
          outputTokens: 22,
          totalTokens: 224,
          estimatedCostUsd: 0.02,
        },
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

    const attempt = await adapter.generate(input, route);

    expect(client.commands).toHaveLength(2);
    expect(client.commands[1]).toMatchObject({
      purpose: "social_monitor.reader_summary.repair.v2",
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
        purpose: "social_monitor.reader_summary.repair.v2",
      },
    });
    expect(attempt.draft.usage).toEqual({
      inputTokens: 303,
      outputTokens: 33,
      estimatedCostUsd: 0.03,
    });
  });
});
