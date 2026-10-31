import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { buildReaderSummaryCoveragePlan } from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
  ReaderSummaryModelInput,
} from "../../ports";
import {
  eligiblePromotionQuality,
  redditPromotionFacts,
} from "./reader-summary-model-promotion.spec-support";
import { withTestExecutionAttestation } from "./reader-summary-execution-attestation.spec-support";

export class CapturingAgentRuntimeClient implements AgentRuntimeClientPort {
  readonly commands: AgentRuntimeTaskCommand[] = [];
  private readonly results: readonly AgentRuntimeTaskResult[];
  private resultIndex = 0;

  constructor(
    result: AgentRuntimeTaskResult | readonly AgentRuntimeTaskResult[],
    private readonly attest: typeof withTestExecutionAttestation = withTestExecutionAttestation,
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
    return this.attest(command, result);
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

export const readerSummaryInput = (): ReaderSummaryModelInput => {
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

export const validReaderProviderDraft = (): Record<string, unknown> => ({
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
