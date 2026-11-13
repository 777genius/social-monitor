import { createHash } from "node:crypto";
import { readerSummaryScopeKey } from "../../domain";
import { buildAgentRuntimeRequestId } from "./agent-runtime-model-support";
import { buildAgentRuntimeStoryRelationIdentity } from "./agent-runtime-reader-summary-story-relation-identity";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
  ReaderSummaryStoryRelationVerifierInput,
} from "../../ports";
import {
  AgentRuntimeReaderSummaryStoryRelationVerifier,
  resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions,
} from "./agent-runtime-reader-summary-story-relation-verifier.adapter";
import { withTestExecutionAttestation, withTestGatewayExecutionAttestation } from "./reader-summary-execution-attestation.spec-support";
import { buildAgentRuntimeStoryRelationEvidencePairs } from "./agent-runtime-reader-summary-story-evidence-prompt";
import { buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt } from "./agent-runtime-reader-summary-story-relation-verifier-prompt";

describe("AgentRuntimeReaderSummaryStoryRelationVerifier", () => {
  it("pins lane-specific scoped idempotency and correlation identities without dispatch", () => {
    const base = input();
    const scope = readerSummaryScopeKey(base.scope);
    const independentDigest = createHash("sha256")
      .update(buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt(base))
      .digest("hex").slice(0, 24);
    const lanes = [
      { lane: undefined, suffix: "", related: false },
      { lane: "safe_recall_shadow" as const, suffix: ":safe-recall-shadow", related: false },
      { lane: "related_topic" as const, suffix: ":related-topic", related: true },
      { lane: "independent_news" as const, suffix: `:independent-news:${independentDigest}`, related: false },
    ];
    for (const { lane, suffix, related } of lanes) {
      const scoped = { ...base, ...(lane === undefined ? {} : { verificationLane: lane }) };
      const identity = buildAgentRuntimeStoryRelationIdentity(scoped);
      expect(identity.relatedTopicLane).toBe(related);
      expect(identity.requestId).toBe(buildAgentRuntimeRequestId(
        related ? "reader-summary-related-topic-relations" : "reader-summary-story-relations",
        base.tenantId, base.workspaceId, `${scope}${suffix}`, base.requestedAt,
      ));
      expect(identity.correlationId).toBe(buildAgentRuntimeRequestId(
        related ? "reader-summary-related-topic-relations-correlation" : "reader-summary-story-relations-correlation",
        base.tenantId, base.workspaceId, `${scope}${suffix}`, base.requestedAt,
      ));
    }
    expect(buildAgentRuntimeStoryRelationIdentity(base).requestId)
      .not.toBe(buildAgentRuntimeStoryRelationIdentity({ ...base, verificationLane: "safe_recall_shadow" }).requestId);
    const independent = { ...base, verificationLane: "independent_news" as const };
    const changedEvidence = { ...independent, evidence: independent.evidence.map((item, index) =>
      index === 0 ? { ...item, title: item.title + " corrected" } : item) };
    expect(buildAgentRuntimeStoryRelationIdentity(independent).requestId)
      .not.toBe(buildAgentRuntimeStoryRelationIdentity(changedEvidence).requestId);
    expect(buildAgentRuntimeStoryRelationIdentity(base).requestId)
      .toBe(buildAgentRuntimeStoryRelationIdentity({ ...base, evidence: changedEvidence.evidence }).requestId);
  });

  it("uses subscription runtime and decides every shortlisted pair", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: {
        decisions: [
          {
            leftFeedItemId: "feed:hn",
            rightFeedItemId: "feed:rss",
            sameStory: true,
            confidenceScore: 0.96,
            rationale: "Both report the same compiler rewrite.",
          },
        ],
      },
      warnings: [],
    });
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
      client,
    });

    await expect(verifier.verify(input())).resolves.toEqual([
      {
        leftFeedItemId: "feed:hn",
        rightFeedItemId: "feed:rss",
        sameStory: true,
        confidenceScore: 0.96,
        rationale: "Both report the same compiler rewrite.",
      },
    ]);
    expect(client.commands[0]).toMatchObject({
      provider: "codex",
      purpose: "social_monitor.reader_summary.verify_story_relations.v2",
      metadata: {
        promptVersion: "reader_summary.story_relation.agent_runtime.v3",
      },
    });
    expect(JSON.parse(client.commands[0]?.prompt ?? "{}").constraints).toMatchObject({
      distinctPrimaryEventsStaySeparate: true,
      releaseEmphasisAloneDoesNotSplitEvent: true,
      requireReleaseSubjectVersionStageDateConsistency: true,
    });
    expect(client.commands[0]?.systemPrompt).toContain("rationale for EVERY decision, including negative and uncertain decisions");
    expect(client.commands[0]?.systemPrompt).toContain("Distinguish the primary event from emphasis");
    expect(client.commands[0]?.systemPrompt).toContain("Older comparator versions are not release targets");
    const promptPair = JSON.parse(client.commands[0]?.prompt ?? "{}").pairs[0];
    expect(promptPair).toMatchObject({
      leftFeedItemId: "feed:hn",
      rightFeedItemId: "feed:rss",
      retrievalSignals: {
        sameProvider: false,
        sameAuthor: false,
        sharedTopicTokens: ["compiler", "rewrite", "typescript"],
      },
      left: {
        providerKey: "hacker-news",
        title: "TypeScript compiler rewrite moves to Go",
      },
    });
    expect(promptPair.left.bodyPreview.length).toBeLessThanOrEqual(640);
    expect(promptPair.left.sourceText.length).toBeLessThanOrEqual(4_096);
    expect(promptPair.left.sourceText).toContain("bounded incident evidence");
  });

  it("routes independent news through Codex with its own request and conservative prompt", async () => {
    const client = new CapturingAgentRuntimeClient({ status: "completed",
      structuredOutput: { decisions: [] }, warnings: [] }, true);
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({ client,
      model: "gpt-6.1-sol", reasoningEffort: "low" });
    const query = input();
    await verifier.verify(query);
    const controller = new AbortController();
    await verifier.verify({ ...query, verificationLane: "independent_news",
      timeoutMs: 90_000, signal: controller.signal });
    const command = client.commands[1]!;
    expect(command).toMatchObject({ provider: "codex", timeoutMs: 90_000,
      controls: { model: "gpt-6.1-sol", reasoningEffort: "low" },
      metadata: { promptVersion: "reader_summary.story_relation.agent_runtime.v3.independent_news.v1",
        verificationLane: "independent_news" } });
    expect(command.requestId).not.toBe(client.commands[0]!.requestId);
    expect(command.systemPrompt).toContain("independently named publishers");
    expect(command.systemPrompt).toContain("shared parties alone are not enough");
    expect(client.commands[0]!.systemPrompt).not.toContain("independently named publishers");
    expect(client.signals[1]).toBe(controller.signal);
    await verifier.verify({ ...query, verificationLane: "independent_news",
      period: { ...query.period, startedAt: new Date("2026-07-10T00:00:00.000Z") } });
    expect(client.commands[2]!.requestId).not.toBe(command.requestId);
  });

  it("includes relevant source evidence beyond the old 50000 preview", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: { decisions: [] },
      warnings: [],
    });
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({ client });
    const verifierInput = input();
    const relevantTail = "typescript compiler rewrite deployment evidence";
    const longEvidence = verifierInput.evidence.map((item, index) =>
      index === 0
        ? { ...item, sourceText: `${"sanitized context ".repeat(4_000)}${relevantTail}` }
        : item,
    );

    await verifier.verify({ ...verifierInput, evidence: longEvidence });

    const promptPair = JSON.parse(client.commands[0]?.prompt ?? "{}").pairs[0];
    expect(promptPair.left.sourceText).toContain(relevantTail);
    expect(promptPair.left.sourceText.length).toBeLessThanOrEqual(4_096);
  });

  it("rejects invalid binary properties at the outer wire boundary", async () => {
    const decisions = [
      {
        leftFeedItemId: "feed:hn",
        rightFeedItemId: "feed:rss",
        sameStory: "not-a-boolean",
        confidenceScore: 4,
        unexpected: true,
      },
    ];
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
      client: new CapturingAgentRuntimeClient({
        status: "completed",
        structuredOutput: { decisions },
        warnings: [],
      }),
    });

    await expect(verifier.verify(input())).rejects.toMatchObject({
      failure: { kind: "invalid_schema", retryable: false },
    });
  });

  it("rejects absent wire rationale while the domain annotation remains optional", async () => {
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
      client: new CapturingAgentRuntimeClient({
        status: "completed",
        structuredOutput: {
          decisions: [{
            leftFeedItemId: "feed:hn",
            rightFeedItemId: "feed:rss",
            sameStory: false,
            confidenceScore: 0.97,
          }],
        },
        warnings: [],
      }),
    });

    await expect(verifier.verify(input())).rejects.toMatchObject({
      failure: { kind: "invalid_schema", retryable: false },
    });
  });

  it.each([
    ["null rationale", { rationale: null }],
    ["numeric rationale", { rationale: 42 }],
    ["unknown property", { unexpected: "never-log-this-payload" }],
    ["invalid confidence", { confidenceScore: 1.01 }],
    ["invalid ID type", { leftFeedItemId: 123 }],
  ])("rejects %s without retries or attestation acceptance", async (_name, change) => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed", warnings: [],
      structuredOutput: { decisions: [{
        leftFeedItemId: "feed:hn", rightFeedItemId: "feed:rss",
        sameStory: false, confidenceScore: 0.97, rationale: "Separate events.",
        ...change as object,
      }] },
    });
    const record = jest.fn();
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
      client, verifiedAttestationSink: { record },
    });
    await expect(verifier.verify(input())).rejects.toMatchObject({
      failure: { kind: "invalid_schema", retryable: false },
    });
    expect(client.commands).toHaveLength(1);
    expect(record).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON text without exposing it or retrying", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed", warnings: [], outputText: "never-log-this-payload",
    });
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({ client });
    await expect(verifier.verify(input())).rejects.toMatchObject({
      failure: { kind: "invalid_schema", retryable: false,
        message: "Reader summary story relation response is not valid JSON" },
    });
    expect(client.commands).toHaveLength(1);
  });

  it("uses the explicit tri-state schema for the post-selection related lane", async () => {
    const decision = {
      leftFeedItemId: "feed:hn",
      rightFeedItemId: "feed:rss",
      relation: "related_topic",
      confidenceScore: 0.98,
      rationale: "The Reddit subject discusses the official topic as a question.",
    };
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: { decisions: [decision] },
      warnings: [],
    });
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({ client });
    const base = input();
    const controller = new AbortController();
    await expect(verifier.verify({
      ...base,
      verificationLane: "related_topic",
      signal: controller.signal,
      candidates: [{
        ...base.candidates[0]!,
        subjectFeedItemId: "feed:hn",
        officialAnchorFeedItemId: "feed:rss",
        subjectStoryClusterId: "story:hn",
        targetStoryClusterId: "story:rss",
      }],
    })).resolves.toEqual([decision]);
    expect(client.signals).toEqual([controller.signal]);

    expect(client.commands[0]).toMatchObject({
      purpose: "social_monitor.reader_summary.verify_related_topic_relations.v2",
      timeoutMs: 15_000,
      controls: {
        outputSchemaName: "social_monitor_reader_summary_related_topic_relations",
        schemaVersion: "reader_summary.related_topic_relation.v1",
      },
      metadata: {
        verificationLane: "related_topic",
        promptVersion: "reader_summary.related_topic_relation.agent_runtime.v1",
        taskRole: "related_topic_relation",
      },
      outputSchema: {
        properties: {
          decisions: { items: { properties: {
            relation: { enum: ["same_story", "related_topic", "unrelated"] },
          } } },
        },
      },
    });
    expect(JSON.parse(client.commands[0]!.prompt).constraints).toMatchObject({
      explicitTriStateRequired: true,
      relatedTopicIsNonTransitive: true,
    });
  });

  it("routes both story relation lanes through MiMo and rejects bad attestation", async () => {
    const binary = { leftFeedItemId: "feed:hn", rightFeedItemId: "feed:rss",
      sameStory: true, confidenceScore: 0.96, rationale: "Same synthetic story." };
    const client = new CapturingAgentRuntimeClient({ status: "completed",
      structuredOutput: { decisions: [binary] }, warnings: [] });
    const options = resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
      AGENT_RUNTIME_READER_SUMMARY_MODEL: "gpt-5.6-sol",
    }, client);
    await expect(new AgentRuntimeReaderSummaryStoryRelationVerifier(options).verify(input()))
      .resolves.toHaveLength(1);
    expect(client.commands[0]?.controls).toMatchObject({
      model: "mimo-v2.6-pro", modelBackend: "xiaomi-mimo-token-plan",
      toolsEnabled: false, toolPolicy: "none",
    });
    const triState = { leftFeedItemId: "feed:hn", rightFeedItemId: "feed:rss",
      relation: "related_topic", confidenceScore: 0.98,
      rationale: "Same synthetic topic." };
    const relatedClient = new CapturingAgentRuntimeClient({ status: "completed",
      structuredOutput: { decisions: [triState] }, warnings: [] });
    const base = input();
    await expect(new AgentRuntimeReaderSummaryStoryRelationVerifier({
      ...options, client: relatedClient,
    }).verify({ ...base, verificationLane: "related_topic", candidates: [{
      ...base.candidates[0]!, subjectFeedItemId: "feed:hn",
      officialAnchorFeedItemId: "feed:rss", subjectStoryClusterId: "story:hn",
      targetStoryClusterId: "story:rss",
    }] })).resolves.toEqual([triState]);
    expect(relatedClient.commands[0]).toMatchObject({
      purpose: "social_monitor.reader_summary.verify_related_topic_relations.v2",
      controls: { modelBackend: "xiaomi-mimo-token-plan",
        outputSchemaName: "social_monitor_reader_summary_related_topic_relations" },
    });
    class WrongModelClient extends CapturingAgentRuntimeClient {
      override async runTask(command: AgentRuntimeTaskCommand): Promise<AgentRuntimeTaskResult> {
        const result = await super.runTask(command);
        return { ...result, executionAttestation: {
          ...result.executionAttestation!, model: "gpt-5.6-sol",
        } };
      }
    }
    await expect(new AgentRuntimeReaderSummaryStoryRelationVerifier({
      ...options, client: new WrongModelClient({ status: "completed",
        structuredOutput: { decisions: [binary] }, warnings: [] }),
    }).verify(input())).rejects.toThrow("execution attestation is invalid");
    expect(() => resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
      AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_MODEL: "gpt-5.6-sol",
    }, client)).toThrow("conflicts with purpose policy");
  });

  it("fails closed when the attestation audit sink rejects a verified response", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: {
        decisions: [{
          leftFeedItemId: "feed:hn",
          rightFeedItemId: "feed:rss",
          sameStory: true,
          confidenceScore: 0.96,
          rationale: "Matching synthetic story.",
        }],
      },
      warnings: [],
    });
    const record = jest.fn(async () => {
      throw new Error("synthetic-attestation-write-failure");
    });
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
      client,
      verifiedAttestationSink: { record },
    });

    await expect(verifier.verify(input())).rejects.toThrow(
      "synthetic-attestation-write-failure",
    );
    expect(client.commands).toHaveLength(1);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      taskRole: "story_relation",
      attempt: "primary",
      normalizedOutputSha256: expect.any(String),
    }));
  });

  it("isolates shadow task identity and metadata from the production lane", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: {
        decisions: [{
          leftFeedItemId: "feed:hn",
          rightFeedItemId: "feed:rss",
          sameStory: false,
          confidenceScore: 0.99,
          rationale: "Separate fixture events.",
        }],
      },
      warnings: [],
    });
    const productionAttestations: unknown[] = [];
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
      client,
      verifiedAttestationSink: {
        record: (attestation) => {
          productionAttestations.push(attestation);
        },
      },
    });

    await verifier.verify({ ...input(), candidates: [] });
    await verifier.verify({
      ...input(),
      candidates: [],
      verificationLane: "safe_recall_shadow",
    });

    expect(client.commands).toHaveLength(0);

    const productionInput = input();
    const shadowInput = {
      ...input(),
      verificationLane: "safe_recall_shadow" as const,
      timeoutMs: 1_234,
    };
    await verifier.verify(productionInput);
    await verifier.verify(shadowInput);

    expect(client.commands[0]?.requestId).not.toBe(client.commands[1]?.requestId);
    expect(client.commands[0]?.purpose).toBe(
      "social_monitor.reader_summary.verify_story_relations.v2",
    );
    expect(client.commands[1]).toMatchObject({
      purpose: "social_monitor.reader_summary.verify_story_relations.v2",
      timeoutMs: 1_234,
      metadata: { verificationLane: "safe_recall_shadow" },
    });
    expect(productionAttestations).toHaveLength(1);
  });

  it.each([
    ["missing decisions", {}],
    [
      "unknown envelope property",
      { decisions: [], commentary: "extra" },
    ],
  ] as const)("rejects an envelope with %s", async (_name, envelope) => {
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
      client: new CapturingAgentRuntimeClient({
        status: "completed",
        structuredOutput: envelope,
        warnings: [],
      }),
    });

    const base = input();
    await expect(verifier.verify({
      ...base,
      verificationLane: "related_topic",
      candidates: [{
        ...base.candidates[0]!,
        subjectFeedItemId: "feed:hn",
        officialAnchorFeedItemId: "feed:rss",
        subjectStoryClusterId: "story:hn",
        targetStoryClusterId: "story:rss",
      }],
    })).rejects.toMatchObject({ failure: { kind: "invalid_schema", retryable: false } });
  });
  it("keeps evidence-pair bindings identical across projection and serialized prompt", () => {
    const base = input();
    const scoped = {
      ...base,
      evidence: base.evidence.map((item) => ({
        ...item,
        authorHandle: item.feedItemId === "feed:hn" ? "  AUTHOR-One " : "author-one",
      })),
    };
    const pairs = buildAgentRuntimeStoryRelationEvidencePairs(scoped);
    const prompt = JSON.parse(buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt(scoped));
    expect(prompt.pairs).toEqual(pairs);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      leftFeedItemId: "feed:hn",
      rightFeedItemId: "feed:rss",
      retrievalSignals: {
        sameProvider: false,
        sameAuthor: true,
        sharedTopicTokens: ["compiler", "rewrite", "typescript"],
      },
      left: { providerKey: "hacker-news" },
      right: { providerKey: "rss" },
    });
    expect(JSON.stringify(prompt.pairs)).toBe(JSON.stringify(pairs));
    expect(pairs[0]?.left).toMatchObject({
      sourceText: expect.stringContaining("bounded incident evidence"),
    });
  });

  it("never substitutes another feed's evidence for a missing candidate identity", () => {
    const scoped = input();
    const candidate = scoped.candidates[0]!;
    const missing = { ...scoped, candidates: [
      { ...candidate, rightFeedItemId: "feed:unknown" },
    ] };
    expect(() => buildAgentRuntimeStoryRelationEvidencePairs(missing))
      .toThrow("Unknown story relation evidence feed:unknown");
    expect(() => buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt(missing))
      .toThrow("Unknown story relation evidence feed:unknown");
  });
});

const input = (): ReaderSummaryStoryRelationVerifierInput => ({
  tenantId: tenantId("tenant-story-verifier"),
  workspaceId: workspaceId("workspace-story-verifier"),
  scope: { type: "workspace" },
  period: {
    cadence: "daily",
    startedAt: new Date("2026-07-11T00:00:00.000Z"),
    endedAt: new Date("2026-07-12T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "2026-07-11",
  },
  requestedAt: new Date("2026-07-12T01:00:00.000Z"),
  clusters: [],
  evidence: [
    evidence(
      "feed:hn",
      "hacker-news",
      "TypeScript compiler rewrite moves to Go",
    ),
    evidence("feed:rss", "rss", "Go rewrite changes the TypeScript compiler"),
  ],
  candidates: [
    {
      leftFeedItemId: "feed:hn",
      rightFeedItemId: "feed:rss",
      leftClusterId: "story:hn",
      rightClusterId: "story:rss",
      sharedTopicTokens: ["compiler", "rewrite", "typescript"],
      sharedAnchorTokens: [],
      sharedEventTokens: [],
      sharedSpecificProductTokens: [],
      topicSimilarity: 0.3,
    },
  ],
});

const evidence = (feedItemId: string, providerKey: string, title: string) => ({
  feedItemId,
  sourceItemId: `source:${feedItemId}`,
  sourceBindingId: `binding:${providerKey}`,
  interestId: "ai",
  providerKey,
  canonicalUrl: `https://example.test/${feedItemId}`,
  title,
  bodyPreview: "The engineering team published implementation details. ".repeat(
    30,
  ),
  sourceText: `${"Original long-post context. ".repeat(45)}bounded incident evidence ${"must remain bounded. ".repeat(300)}`,
  publishedAt: new Date("2026-07-11T08:00:00.000Z"),
  observedAt: new Date("2026-07-11T08:01:00.000Z"),
  score: 2,
  whyImportant: ["Fixture"],
});

class CapturingAgentRuntimeClient implements AgentRuntimeClientPort {
  readonly commands: AgentRuntimeTaskCommand[] = [];
  readonly signals: (AbortSignal | undefined)[] = [];

  constructor(private readonly result: AgentRuntimeTaskResult,
    private readonly gateway = false) {}

  async runTask(
    command: AgentRuntimeTaskCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AgentRuntimeTaskResult> {
    this.commands.push(command);
    this.signals.push(options?.signal);
    return this.gateway ? withTestGatewayExecutionAttestation(command, this.result)
      : withTestExecutionAttestation(command, this.result);
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
