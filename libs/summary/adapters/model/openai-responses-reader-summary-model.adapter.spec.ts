import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryModelInput } from "../../ports";
import {
  OpenAiResponsesReaderSummaryModelAdapter,
  resolveOpenAiResponsesReaderSummaryModelOptions,
} from "./openai-responses-reader-summary-model.adapter";
import {
  buildOpenAiReaderSummaryPromptPayload,
  currentReaderSummaryPromptRelease,
} from "./openai-responses-reader-summary-prompt";
import { coveragePlanLeadFixture } from "./reader-summary-coverage-plan-test-fixture";

describe("OpenAiResponsesReaderSummaryModelAdapter", () => {
  it("calls the Responses API and normalizes a cited reader summary draft", async () => {
    const capturedCalls: {
      readonly url: string | URL;
      readonly init?: RequestInit;
    }[] = [];
    const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
      apiKey: "test-openai-key",
      fetchFn: async (url, init) => {
        capturedCalls.push({ url, init });

        return jsonResponse({
          output_text: JSON.stringify({
            headline: "Workspace AI tooling signal",
            executiveSummary:
              "AI tooling is repeating across monitored sources.",
            topStories: [
              {
                storyClusterId: "story:ai-tooling",
                title: "AI tooling library is trending",
                summary: "Developers are discussing a new AI tooling library.",
                interestIds: ["interest-ai"],
                providerKeys: ["reddit"],
                citationIds: ["c1"],
              },
            ],
            interestHighlights: [
              {
                title: "AI tooling",
                summary: "AI tooling keeps appearing in selected evidence.",
                citationIds: "c1",
              },
            ],
            repeatedSignals: [
              {
                title: "AI tooling repeats across interests",
                interestIds: "interest-ai,interest-dev",
                citationIds: "c1",
              },
            ],
            risksAndUnknowns: [
              {
                risk: "Provider freshness can still vary.",
                citations: "c1",
              },
            ],
            citationMap: [
              {
                citationId: "c1",
                feedItemId: "feed-reddit",
                sourceItemId: "source-reddit",
                providerKey: "reddit",
                field: "title",
              },
            ],
            qualityFlags: [],
            confidence: {
              level: "medium",
              score: 0.7,
              rationale: "Primary evidence is cited.",
            },
            noSignalReason: null,
          }),
          usage: {
            input_tokens: 111,
            output_tokens: 222,
          },
        });
      },
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "openai-responses",
        maxInputTokens: 24_000,
        maxOutputTokens: 4_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 32_000,
        remainingCostUsd: 2,
      },
    );

    const attempt = await adapter.generate(input, route);

    expect(capturedCalls[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(JSON.parse(capturedCalls[0]?.init?.body as string)).toMatchObject({
      model: "gpt-5.4-mini",
      max_output_tokens: 16_000,
      text: {
        format: {
          type: "json_schema",
          name: "social_monitor_reader_summary_artifact",
          strict: true,
        },
      },
    });
    expect(JSON.parse(capturedCalls[0]?.init?.body as string)).toMatchObject({
      instructions: expect.stringContaining(
        "Lead with what happened and why it matters",
      ),
    });
    expect(JSON.parse(capturedCalls[0]?.init?.body as string)).toMatchObject({
      instructions: expect.stringContaining(
        "Return narrativeSections as the canonical reader narrative",
      ),
    });
    expect(JSON.parse(capturedCalls[0]?.init?.body as string)).toMatchObject({
      instructions: expect.stringContaining(
        "Each narrative section must add information not already stated elsewhere",
      ),
    });
    expect(JSON.parse(capturedCalls[0]?.init?.body as string)).toMatchObject({
      instructions: expect.stringContaining(
        "Explain unfamiliar product, model or project names on first mention",
      ),
    });
    expect(JSON.parse(capturedCalls[0]?.init?.body as string)).toMatchObject({
      instructions: expect.stringContaining(
        "Do not use internal workflow language such as source item",
      ),
    });
    expect(JSON.parse(capturedCalls[0]?.init?.body as string)).toMatchObject({
      instructions: expect.stringContaining(
        "Preserve material qualifiers exactly as stated",
      ),
    });
    expect(JSON.parse(capturedCalls[0]?.init?.body as string)).toMatchObject({
      instructions: expect.stringContaining(
        "one secondary_signal for every entry in coveragePlan.secondary",
      ),
      text: {
        format: {
          schema: {
            properties: {
              executiveSummary: expect.objectContaining({
                maxLength: 1_800,
              }),
            },
          },
        },
      },
    });
    expect(route.promptVersion).toBe(currentReaderSummaryPromptRelease.id);
    expect(adapter.estimate(input, route).outputTokens).toBe(3_200);
    expect(attempt.draft).toMatchObject({
      headline: "Reddit discussion: AI tooling library is trending",
      usage: {
        inputTokens: 111,
        outputTokens: 222,
      },
      citationMap: [
        expect.objectContaining({
          feedItemId: "feed-reddit",
        }),
      ],
    });
    expect(adapter.validateRawProviderResponse(attempt)).toEqual({ ok: true });
  });

  it("canonicalizes model citation maps from selected backend evidence", async () => {
    const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
      apiKey: "test-openai-key",
      fetchFn: async () =>
        jsonResponse({
          output_text: JSON.stringify({
            headline: "Workspace AI tooling signal",
            executiveSummary:
              "AI tooling is repeating across monitored sources.",
            topStories: [
              {
                storyClusterId: "story:ai-tooling",
                title: "AI tooling library is trending",
                summary: "Developers are discussing a new AI tooling library.",
                interestIds: ["interest-ai"],
                providerKeys: ["reddit"],
                citationIds: ["c1"],
              },
            ],
            interestHighlights: [],
            repeatedSignals: [],
            risksAndUnknowns: [],
            citationMap: [
              {
                citationId: "c1",
                feedItemId: "feed-outside",
                sourceItemId: "source-outside",
                providerKey: "github-trending-page",
                field: "title",
              },
            ],
            qualityFlags: [],
            confidence: "medium",
            noSignalReason: null,
          }),
        }),
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "openai-responses",
        maxInputTokens: 24_000,
        maxOutputTokens: 4_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 32_000,
        remainingCostUsd: 2,
      },
    );

    const attempt = await adapter.generate(input, route);

    expect(attempt.draft.citationMap).toEqual([
      expect.objectContaining({
        citationId: "c1",
        feedItemId: "feed-reddit",
        sourceItemId: "source-reddit",
        providerKey: "reddit",
        canonicalUrl: "https://example.com/ai-tooling",
      }),
    ]);
    expect(adapter.validateRawProviderResponse(attempt)).toEqual({ ok: true });
  });

  it("falls back to canonical evidence citations when model citation map shape drifts", async () => {
    const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
      apiKey: "test-openai-key",
      fetchFn: async () =>
        jsonResponse({
          output_text: JSON.stringify({
            headline: "Workspace AI tooling signal",
            executiveSummary:
              "AI tooling is repeating across monitored sources.",
            topStories: [
              {
                storyClusterId: "story:ai-tooling",
                title: "AI tooling library is trending",
                summary: "Developers are discussing a new AI tooling library.",
                interestIds: ["interest-ai"],
                providerKeys: ["reddit"],
                citationIds: ["c1"],
              },
            ],
            interestHighlights: [],
            repeatedSignals: [],
            risksAndUnknowns: [],
            citationMap: { c1: "feed-reddit" },
            qualityFlags: [],
            confidence: {
              level: "medium",
              score: 0.7,
              rationale: "Primary evidence is cited.",
            },
            noSignalReason: null,
          }),
        }),
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "openai-responses",
        maxInputTokens: 24_000,
        maxOutputTokens: 4_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 32_000,
        remainingCostUsd: 2,
      },
    );

    const attempt = await adapter.generate(input, route);

    expect(attempt.draft.citationMap).toEqual([
      expect.objectContaining({
        citationId: "c1",
        feedItemId: "feed-reddit",
        sourceItemId: "source-reddit",
        providerKey: "reddit",
      }),
    ]);
    expect(adapter.validateRawProviderResponse(attempt)).toEqual({ ok: true });
  });

  it("repairs model story cluster ids through cited evidence", async () => {
    const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
      apiKey: "test-openai-key",
      fetchFn: async () =>
        jsonResponse({
          output_text: JSON.stringify({
            headline: "Workspace AI tooling signal",
            executiveSummary:
              "AI tooling is repeating across monitored sources.",
            topStories: [
              {
                storyClusterId: "model-invented-cluster",
                title: "AI tooling library is trending",
                summary: "Developers are discussing a new AI tooling library.",
                interestIds: ["interest-ai"],
                providerKeys: ["reddit"],
                citationIds: ["c1"],
              },
            ],
            interestHighlights: [],
            repeatedSignals: [],
            risksAndUnknowns: [],
            citationMap: [
              {
                citationId: "c1",
                feedItemId: "feed-reddit",
                sourceItemId: "source-reddit",
                providerKey: "reddit",
                field: "title",
              },
            ],
            qualityFlags: [],
            confidence: {
              level: "medium",
              score: 0.7,
              rationale: "Primary evidence is cited.",
            },
            noSignalReason: null,
          }),
        }),
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "openai-responses",
        maxInputTokens: 24_000,
        maxOutputTokens: 4_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 32_000,
        remainingCostUsd: 2,
      },
    );

    const attempt = await adapter.generate(input, route);

    expect(attempt.draft.topStories[0]?.storyClusterId).toBe(
      "story:ai-tooling",
    );
    expect(adapter.validateRawProviderResponse(attempt)).toEqual({ ok: true });
  });

  it("repairs missing story cluster ids through cited evidence", async () => {
    const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
      apiKey: "test-openai-key",
      fetchFn: async () =>
        jsonResponse({
          output_text: JSON.stringify({
            headline: "Workspace AI tooling signal",
            executiveSummary:
              "AI tooling is repeating across monitored sources.",
            topStories: [
              {
                summary: "Developers are discussing a new AI tooling library.",
                interestIds: "interest-ai",
                providerKeys: "reddit",
                citationIds: "c1",
              },
            ],
            interestHighlights: [
              {
                interestId: "interest-ai",
                title: "AI tooling",
                summary: "AI tooling keeps appearing in selected evidence.",
                citationIds: "c1",
              },
            ],
            repeatedSignals: [
              {
                interestIds: "interest-ai,interest-dev",
                citationIds: "c1",
              },
            ],
            risksAndUnknowns: [
              {
                citations: "c1",
              },
            ],
            citationMap: { c1: "feed-reddit" },
            qualityFlags: [],
            confidence: "medium",
            noSignalReason: null,
          }),
        }),
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "openai-responses",
        maxInputTokens: 24_000,
        maxOutputTokens: 4_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 32_000,
        remainingCostUsd: 2,
      },
    );

    const attempt = await adapter.generate(input, route);

    expect(attempt.draft.topStories[0]?.storyClusterId).toBe(
      "story:ai-tooling",
    );
    expect(attempt.draft.interestHighlights[0]?.citationIds).toEqual(["c1"]);
    expect(attempt.draft.interestHighlights[0]?.interestId).toBe("interest-ai");
    expect(attempt.draft.repeatedSignals[0]?.interestIds).toEqual([
      "interest-ai",
      "interest-dev",
    ]);
    expect(attempt.draft.risksAndUnknowns[0]?.citationIds).toEqual(["c1"]);
    expect(attempt.draft.confidence).toMatchObject({
      level: "low",
      score: 0.55,
    });
    expect(adapter.validateRawProviderResponse(attempt)).toEqual({ ok: true });
  });

  it("removes contradictory no-signal markers when cited top stories survive normalization", async () => {
    const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
      apiKey: "test-openai-key",
      fetchFn: async () =>
        jsonResponse({
          output_text: JSON.stringify({
            headline: "Workspace AI tooling signal",
            executiveSummary:
              "AI tooling has a cited story and should remain a signal.",
            topStories: [
              {
                storyClusterId: "story:ai-tooling",
                title: "AI tooling library is trending",
                summary: "Developers are discussing a new AI tooling library.",
                interestIds: ["interest-ai"],
                providerKeys: ["reddit"],
                citationIds: ["c1"],
              },
            ],
            interestHighlights: [],
            repeatedSignals: [],
            risksAndUnknowns: [],
            citationMap: [
              {
                citationId: "c1",
                feedItemId: "feed-reddit",
                sourceItemId: "source-reddit",
                providerKey: "reddit",
                field: "title",
              },
            ],
            qualityFlags: ["no_signal", "limited_sources"],
            confidence: {
              level: "none",
              score: 0,
              rationale:
                "Model marked no signal even though cited evidence exists.",
            },
            noSignalReason: "Incorrect model no-signal marker.",
          }),
        }),
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "openai-responses",
        maxInputTokens: 24_000,
        maxOutputTokens: 4_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 32_000,
        remainingCostUsd: 2,
      },
    );

    const attempt = await adapter.generate(input, route);

    expect(attempt.draft.qualityFlags).not.toContain("no_signal");
    expect(attempt.draft.noSignalReason).toBeUndefined();
    expect(attempt.draft.confidence.level).toBe("low");
    expect(attempt.draft.content?.topReads).toHaveLength(1);
    expect(adapter.validateRawProviderResponse(attempt)).toEqual({ ok: true });
  });

  it("tops up too-short model top stories from cited evidence", async () => {
    const citationMap = Array.from({ length: 10 }, (_, index) => {
      const itemNumber = index + 1;

      return {
        citationId: `c${itemNumber}`,
        feedItemId: `feed-reddit-${itemNumber}`,
        sourceItemId: `source-reddit-${itemNumber}`,
        providerKey: "reddit",
        field: "title",
      };
    });
    const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
      apiKey: "test-openai-key",
      fetchFn: async () =>
        jsonResponse({
          output_text: JSON.stringify({
            headline: "Workspace AI tooling signal",
            executiveSummary:
              "AI tooling has more cited evidence than the model initially selected.",
            topStories: [
              {
                storyClusterId: "story:ai-tooling-1",
                title: "Model selected one AI tooling story",
                summary:
                  "The model selected only one story despite more citations.",
                interestIds: ["interest-ai"],
                providerKeys: ["reddit"],
                citationIds: ["c1"],
              },
            ],
            interestHighlights: [],
            repeatedSignals: [],
            risksAndUnknowns: [],
            citationMap,
            qualityFlags: [],
            confidence: {
              level: "medium",
              score: 0.7,
              rationale: "Primary evidence is cited.",
            },
            noSignalReason: null,
          }),
        }),
    });
    const input = multiStoryReaderSummaryInput(10);
    const route = adapter.route(
      input,
      {
        preferredProvider: "openai-responses",
        maxInputTokens: 24_000,
        maxOutputTokens: 4_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 32_000,
        remainingCostUsd: 2,
      },
    );

    const attempt = await adapter.generate(input, route);

    expect(attempt.draft.topStories).toHaveLength(8);
    expect(attempt.draft.content?.topReads).toHaveLength(8);
    expect(attempt.draft.topStories[0]?.title).toBe(
      "Model selected one AI tooling story",
    );
    expect(
      attempt.draft.topStories.map((story) => story.storyClusterId),
    ).toEqual([
      "story:ai-tooling-1",
      "story:ai-tooling-2",
      "story:ai-tooling-3",
      "story:ai-tooling-4",
      "story:ai-tooling-5",
      "story:ai-tooling-6",
      "story:ai-tooling-7",
      "story:ai-tooling-8",
    ]);
  });

  it("classifies truncated OpenAI JSON output as retryable", async () => {
    const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
      apiKey: "test-openai-key",
      fetchFn: async () =>
        jsonResponse({
          output_text: '{"headline":"Workspace AI tooling signal"',
        }),
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "openai-responses",
        maxInputTokens: 24_000,
        maxOutputTokens: 4_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 32_000,
        remainingCostUsd: 2,
      },
    );

    let thrown: unknown;
    try {
      await adapter.generate(input, route);
    } catch (error) {
      thrown = error;
    }

    expect(adapter.classifyError(thrown)).toMatchObject({
      kind: "invalid_schema",
      retryable: true,
      message: expect.stringContaining(
        "OpenAI reader summary output must be JSON",
      ),
    });
  });

  it("does not call OpenAI when selected evidence is empty", async () => {
    let called = false;
    const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
      fetchFn: async () => {
        called = true;
        return jsonResponse({});
      },
    });
    const input = readerSummaryInput({ empty: true });
    const route = adapter.route(
      input,
      {
        preferredProvider: "openai-responses",
        maxInputTokens: 24_000,
        maxOutputTokens: 4_000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 32_000,
        remainingCostUsd: 2,
      },
    );

    const attempt = await adapter.generate(input, route);

    expect(called).toBe(false);
    expect(attempt.draft.qualityFlags).toEqual([
      "no_signal",
      "limited_sources",
    ]);
  });

  it("requires an OpenAI API key when openai-responses mode is selected", () => {
    expect(() =>
      resolveOpenAiResponsesReaderSummaryModelOptions(
        {},
        {
          requireApiKey: true,
        },
      ),
    ).toThrow(
      "READER_SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY or OPENAI_API_KEY_FILE",
    );
  });

  it("routes full reader summaries without exceeding the application output budget", () => {
    const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
      apiKey: "test-openai-key",
      maxOutputTokens: 8_000,
    });
    const input = readerSummaryInput();

    expect(() =>
      adapter.route(
        input,
        {
          preferredProvider: "openai-responses",
          maxInputTokens: 24_000,
          maxOutputTokens: 4_000,
          maxEstimatedCostUsd: 1,
        },
        {
          remainingTokens: 32_000,
          remainingCostUsd: 2,
        },
      ),
    ).not.toThrow();
  });

  it("reads an OpenAI API key from a private key file for live-safe smoke runs", () => {
    const tempDirectory = mkdtempSync(
      join(tmpdir(), "reader-summary-openai-key-"),
    );
    try {
      const keyFile = join(tempDirectory, "openai.key");
      writeFileSync(keyFile, `${fakeOpenAiApiKey}\n`, { mode: 0o600 });

      expect(
        resolveOpenAiResponsesReaderSummaryModelOptions(
          {
            OPENAI_API_KEY_FILE: keyFile,
          },
          {
            requireApiKey: true,
          },
        ),
      ).toMatchObject({
        apiKey: fakeOpenAiApiKey,
      });
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("serializes ranked conversation context for reader summaries", () => {
    const payload = JSON.parse(
      buildOpenAiReaderSummaryPromptPayload(
        readerSummaryInput({ withConversationContext: true }),
      ),
    );

    expect(payload.evidence[0].conversationContext).toMatchObject({
      rankingBasis: "cohort_baseline_v1",
      bundleScore: expect.any(Number),
      units: [
        {
          providerUnitId: "t1_high",
          providerScore: 180,
          replyCount: 9,
          depth: 1,
          role: "reply",
          selectionReason: "ranked",
          ancestry: [
            {
              providerUnitId: "t1_parent",
              selectionReason: "ancestor_context",
              providerScore: 42,
              depth: 0,
            },
          ],
        },
      ],
    });
  });

  it("serializes a deterministic evidence profile for reader summary grounding", () => {
    const payload = JSON.parse(
      buildOpenAiReaderSummaryPromptPayload(readerSummaryInput()),
    );

    expect(payload.evidenceProfile).toMatchObject({
      rankingPolicyVersion: "story_ranking_v1",
      selectedEvidenceCount: 1,
      storyClusterCount: 1,
      providerCount: 1,
      providerCounts: [{ providerKey: "reddit", count: 1 }],
      crossProviderClusterCount: 0,
      topReadEligibleCount: 1,
      downrankedEvidenceCount: 0,
      conversationContextItemCount: 0,
      coverageWarnings: ["limited_evidence", "single_provider"],
    });
    expect(payload.evidencePack).toMatchObject({
      officialSignals: [],
      topCommunitySignals: [
        {
          feedItemId: "feed-reddit",
          providerKey: "reddit",
          reasonCodes: ["community_source", "provider:reddit"],
        },
      ],
      sourceCoverage: {
        selectedEvidenceCount: 1,
        providerCount: 1,
      },
      confidence: {
        level: "low",
        score: 0.35,
      },
    });
  });
});

const fakeOpenAiApiKey = ["test", "openai", "key"].join("-");

const readerSummaryInput = (
  params: {
    readonly empty?: boolean;
    readonly withConversationContext?: boolean;
  } = {},
): ReaderSummaryModelInput => ({
  tenantId: tenantId("tenant-openai-reader-summary-adapter"),
  workspaceId: workspaceId("workspace-openai-reader-summary-adapter"),
  scope: { type: "workspace" },
  period: {
    cadence: "daily",
    startedAt: new Date("2026-06-23T00:00:00.000Z"),
    endedAt: new Date("2026-06-24T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
  },
  coveragePlan: params.empty
    ? { mode: "single_story", secondary: [] }
    : {
        mode: "single_story",
        lead: coveragePlanLeadFixture("story:ai-tooling", "feed-reddit", 2.4),
        secondary: [],
      },
  evidence: {
    rankingPolicyVersion: "story_ranking_v1",
    sourceWindow: {
      windowId: "workspace:openai-reader-summary",
      startedAt: new Date("2026-06-23T08:00:00.000Z"),
      endedAt: new Date("2026-06-23T08:30:00.000Z"),
      selectedFeedItemIds: params.empty ? [] : ["feed-reddit"],
      storyClusterIds: params.empty ? [] : ["story:ai-tooling"],
    },
    clusters: params.empty
      ? []
      : [
          {
            id: "story:ai-tooling",
            storyKey: "url:example.com/ai-tooling",
            representativeFeedItemId: "feed-reddit",
            duplicateFeedItemIds: [],
            interestIds: ["interest-ai"],
            providerKeys: ["reddit"],
            score: 2.4,
            observedAtRange: {
              startedAt: new Date("2026-06-23T08:00:00.000Z"),
              endedAt: new Date("2026-06-23T08:30:00.000Z"),
            },
            whyImportant: ["Fresh item"],
          },
        ],
    selectedEvidence: params.empty
      ? []
      : [
          {
            feedItemId: "feed-reddit",
            sourceItemId: "source-reddit",
            sourceBindingId: "binding-reddit",
            interestId: "interest-ai",
            providerKey: "reddit",
            canonicalUrl: "https://example.com/ai-tooling",
            title: "AI tooling library is trending",
            bodyPreview: "Developers are discussing a new AI tooling library.",
            publishedAt: new Date("2026-06-23T08:00:00.000Z"),
            observedAt: new Date("2026-06-23T08:01:00.000Z"),
            score: 2.4,
            whyImportant: ["Fresh item"],
            ...(params.withConversationContext
              ? {
                  conversationContext: {
                    rankingBasis: "cohort_baseline_v1",
                    bundleScore: 1.8,
                    units: [
                      {
                        conversationUnitId: "conversation-high",
                        providerUnitId: "t1_high",
                        parentProviderUnitId: "t1_parent",
                        threadExternalId: "t3_post_1",
                        canonicalUrl:
                          "https://reddit.test/r/topic/comments/post_1/_/t1_high",
                        authorHandle: "commenter",
                        body: "High-score reply changes the interpretation.",
                        score: 1.8,
                        providerScore: 180,
                        replyCount: 9,
                        signalBand: "high",
                        depth: 1,
                        role: "reply",
                        selectionReason: "ranked",
                        ancestry: [
                          {
                            conversationUnitId: "conversation-parent",
                            providerUnitId: "t1_parent",
                            threadExternalId: "t3_post_1",
                            canonicalUrl:
                              "https://reddit.test/r/topic/comments/post_1/_/t1_parent",
                            body: "Parent comment provides context.",
                            score: 0.9,
                            providerScore: 42,
                            replyCount: 3,
                            signalBand: "medium",
                            depth: 0,
                            role: "top_level_comment",
                            selectionReason: "ancestor_context",
                            publishedAt: "2026-06-23T08:00:30.000Z",
                          },
                        ],
                        publishedAt: "2026-06-23T08:01:00.000Z",
                      },
                    ],
                  },
                }
              : {}),
          },
        ],
  },
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
});

const multiStoryReaderSummaryInput = (
  storyCount: number,
): ReaderSummaryModelInput => {
  const selectedFeedItemIds = Array.from(
    { length: storyCount },
    (_, index) => `feed-reddit-${index + 1}`,
  );

  return {
    ...readerSummaryInput({ empty: true }),
    coveragePlan: {
      mode: "single_story",
      lead: coveragePlanLeadFixture("story:ai-tooling-1", "feed-reddit-1", 2.4),
      secondary: [],
    },
    evidence: {
      rankingPolicyVersion: "story_ranking_v1",
      sourceWindow: {
        windowId: "workspace:openai-reader-summary",
        startedAt: new Date("2026-06-23T08:00:00.000Z"),
        endedAt: new Date("2026-06-23T08:30:00.000Z"),
        selectedFeedItemIds,
        storyClusterIds: selectedFeedItemIds.map(
          (_, index) => `story:ai-tooling-${index + 1}`,
        ),
      },
      clusters: selectedFeedItemIds.map((feedItemId, index) => ({
        id: `story:ai-tooling-${index + 1}`,
        storyKey: `url:example.com/ai-tooling-${index + 1}`,
        representativeFeedItemId: feedItemId,
        duplicateFeedItemIds: [],
        interestIds: ["interest-ai"],
        providerKeys: ["reddit"],
        score: 2.4 - index * 0.01,
        observedAtRange: {
          startedAt: new Date("2026-06-23T08:00:00.000Z"),
          endedAt: new Date("2026-06-23T08:30:00.000Z"),
        },
        whyImportant: [`Fresh item ${index + 1}`],
      })),
      selectedEvidence: selectedFeedItemIds.map((feedItemId, index) => ({
        feedItemId,
        sourceItemId: `source-reddit-${index + 1}`,
        sourceBindingId: "binding-reddit",
        interestId: "interest-ai",
        providerKey: "reddit",
        canonicalUrl: `https://example.com/ai-tooling-${index + 1}`,
        title: `AI tooling signal ${index + 1}`,
        bodyPreview: `Developers are discussing AI tooling signal ${index + 1}.`,
        publishedAt: new Date("2026-06-23T08:00:00.000Z"),
        observedAt: new Date("2026-06-23T08:01:00.000Z"),
        score: 2.4 - index * 0.01,
        whyImportant: [`Fresh item ${index + 1}`],
      })),
    },
  };
};

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
