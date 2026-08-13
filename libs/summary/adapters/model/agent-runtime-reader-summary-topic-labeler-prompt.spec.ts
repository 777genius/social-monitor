import type { ReaderSummaryTopicLabelCandidate } from "../../ports";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import {
  buildAgentRuntimeReaderSummaryTopicLabelPrompt,
  selectAgentRuntimeReaderSummaryTopicCandidates,
} from "./agent-runtime-reader-summary-topic-labeler-prompt";
import { normalizeAgentRuntimeReaderSummaryTopicLabelPlan } from "./agent-runtime-reader-summary-topic-label-plan-normalizer";

describe("buildTopicCandidateRelationshipHints", () => {
  it("selects candidates by deterministic story score", () => {
    const highPopularity = candidate("node:popular", ["Popular Topic"]);
    const highStoryScore = candidate("node:grounded", ["Grounded Topic"]);
    const input = {
      candidates: [
        { ...highPopularity, score: 100 },
        { ...highStoryScore, score: 10 },
      ],
      clusters: [
        storyCluster(highPopularity.storyClusterId, 1),
        storyCluster(highStoryScore.storyClusterId, 2),
      ],
    } satisfies Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">;

    expect(selectAgentRuntimeReaderSummaryTopicCandidates(input, 1)).toEqual([
      expect.objectContaining({ nodeId: "node:grounded" }),
    ]);
  });

  it("uses only fallback identity and keeps selected cohorts grounded", () => {
    const candidates = [
      candidate("node:top-1", ["Flutter"]),
      candidate("node:top-2", ["Grok"]),
      candidate("node:claude-lead", ["Claude"]),
      candidate("node:top-4", ["Maths"]),
      candidate("node:rust-lead", ["Postgres", "Rust"]),
      candidate("node:top-6", ["WebSockets"]),
      candidate("node:gemini-lead", ["Pixel", "Gemini"]),
      candidate("node:top-8", ["EMS"]),
      candidate("node:top-9", ["AmigaDOS"]),
      candidate("node:rust-peer", ["Woxi", "Rust"]),
      candidate("node:top-11", ["Qwen"]),
      candidate("node:gemini-peer", ["Gemini"]),
      candidate("node:top-13", ["Medical"]),
      candidate("node:top-14", ["Founders"]),
      candidate("node:top-15", ["GitHub"]),
      candidate("node:top-16", ["OpenAI"]),
      candidate("node:claude-peer", ["Claude"]),
      candidate("node:top-18", ["Research"]),
    ];
    const input = {
      candidates,
      clusters: candidates.map((item, index) =>
        storyCluster(item.storyClusterId, candidates.length - index),
      ),
    } satisfies Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">;

    const selected = selectAgentRuntimeReaderSummaryTopicCandidates(input, 10);

    expect(selected.slice(0, 4).map((item) => item.nodeId)).toEqual([
      "node:top-1",
      "node:top-2",
      "node:claude-lead",
      "node:claude-peer",
    ]);
    expect(selected.map((item) => item.nodeId)).toEqual(
      expect.arrayContaining([
        "node:claude-peer",
      ]),
    );
    expect(selected).toHaveLength(4);
  });

  it("adds grounded cohorts atomically before filling by rank", () => {
    const candidates = [
      candidate("node:top-1", ["Alpha"]),
      candidate("node:top-2", ["Beta"]),
      candidate("node:top-3", ["Gamma"]),
      candidate("node:unrelated-1", ["Medical"]),
      candidate("node:unrelated-2", ["Business"]),
      candidate("node:claude-1", ["Claude"]),
      candidate("node:claude-2", ["Claude"]),
      candidate("node:rust-1", ["Rust"]),
      candidate("node:rust-2", ["Rust"]),
    ];
    const input = {
      candidates,
      clusters: candidates.map((item, index) =>
        storyCluster(item.storyClusterId, candidates.length - index),
      ),
    } satisfies Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">;

    expect(
      selectAgentRuntimeReaderSummaryTopicCandidates(input, 8).map(
        (item) => item.nodeId,
      ),
    ).toEqual([
      "node:top-1",
      "node:top-2",
      "node:top-3",
      "node:unrelated-1",
      "node:claude-1",
      "node:claude-2",
      "node:rust-1",
      "node:rust-2",
    ]);
  });

  it("does not start an unsupported cohort with the final slot", () => {
    const candidates = [
      candidate("node:top-1", ["Alpha"]),
      candidate("node:top-2", ["Beta"]),
      candidate("node:top-3", ["Gamma"]),
      candidate("node:filler", ["Medical"]),
      candidate("node:claude-1", ["Claude"]),
      candidate("node:claude-2", ["Claude"]),
      candidate("node:rust-1", ["Rust"]),
      candidate("node:rust-2", ["Rust"]),
    ];
    const input = {
      candidates,
      clusters: candidates.map((item, index) =>
        storyCluster(item.storyClusterId, candidates.length - index),
      ),
    } satisfies Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">;

    expect(
      selectAgentRuntimeReaderSummaryTopicCandidates(input, 6).map(
        (item) => item.nodeId,
      ),
    ).toEqual([
      "node:top-1",
      "node:top-2",
      "node:claude-1",
      "node:claude-2",
      "node:rust-1",
      "node:rust-2",
    ]);
  });

  it("leaves enough capacity to meet the 50 percent grouping gate", () => {
    const candidates = [
      ...Array.from({ length: 8 }, (_, index) =>
        candidate(`node:top-${index + 1}`, [`Top ${index + 1}`]),
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        candidate(`node:cohort-${index + 1}`, [
          `Cohort ${Math.floor(index / 2) + 1}`,
        ]),
      ),
    ];
    const input = {
      candidates,
      clusters: candidates.map((item, index) =>
        storyCluster(item.storyClusterId, candidates.length - index),
      ),
    } satisfies Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">;

    const selected = selectAgentRuntimeReaderSummaryTopicCandidates(input, 18);
    const selectedCohortIds = selected
      .filter((item) => item.nodeId.includes("cohort"))
      .map((item) => item.nodeId);

    expect(selectedCohortIds).toHaveLength(10);
    expect(selected).toHaveLength(18);
  });

  it("does not create transitive mixed-anchor components", () => {
    const candidates = [
      candidate("node:singleton-1", ["SoloAlpha"]),
      candidate("node:singleton-2", ["SoloBeta"]),
      candidate("node:bridge-a", ["AnchorX", "AnchorY"]),
      candidate("node:bridge-b", ["AnchorX", "AnchorZ"]),
      candidate("node:filler-1", ["FillAlpha"]),
      candidate("node:filler-2", ["FillBeta"]),
      candidate("node:bridge-c", ["AnchorY"]),
      candidate("node:bridge-d", ["AnchorY"]),
    ];
    const input = {
      candidates,
      clusters: candidates.map((item, index) =>
        storyCluster(item.storyClusterId, candidates.length - index),
      ),
    } satisfies Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">;

    expect(
      selectAgentRuntimeReaderSummaryTopicCandidates(input, 6).map(
        (item) => item.nodeId,
      ),
    ).toEqual([
      "node:singleton-1",
      "node:singleton-2",
      "node:bridge-a",
      "node:bridge-b",
      "node:bridge-c",
      "node:bridge-d",
    ]);
  });

  it("bounds a production-shaped grounded cohort set to provable coverage", () => {
    const candidates = [
      ...Array.from({ length: 4 }, (_, index) =>
        candidate(`node:claude-${index + 1}`, ["Claude"]),
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        candidate(`node:rust-${index + 1}`, ["Rust"]),
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        candidate(`node:unique-${index + 1}`, [`Unique${index + 1}`]),
      ),
    ];
    const selected = selectAgentRuntimeReaderSummaryTopicCandidates(
      {
        candidates,
        clusters: candidates.map((item, index) =>
          storyCluster(item.storyClusterId, candidates.length - index),
        ),
      },
      18,
    );

    expect(selected).toHaveLength(12);
    expect(selected.filter((item) => /claude|rust/u.test(item.nodeId))).toHaveLength(6);

    const prompt = JSON.parse(
      buildAgentRuntimeReaderSummaryTopicLabelPrompt(
        promptInput(candidates),
        selected,
      ),
    ) as {
      requiredGroundedCohorts: {
        minimumGroupedNodeCount: number;
        groups: readonly { groupId: string; nodeIds: readonly string[] }[];
      };
    };
    expect(prompt.requiredGroundedCohorts).toMatchObject({
      minimumGroupedNodeCount: 6,
      groups: [
        { groupId: "group:claude", nodeIds: expect.arrayContaining(["node:claude-1", "node:claude-4"]) },
        { groupId: "group:rust", nodeIds: ["node:rust-1", "node:rust-2"] },
      ],
    });

    const normalized = normalizeAgentRuntimeReaderSummaryTopicLabelPlan(
      {
        nodeLabels: selected.map((item) => ({
          nodeId: item.nodeId,
          topicId: `topic:${item.nodeId}`,
          subject: item.fallbackLabel,
          parentSubject: "",
          claimType: "other",
          confidenceScore: 0.9,
          groupId: "group:ungrouped",
          keywords: [],
        })),
        groups: [],
      },
      selected,
    );
    expect(normalized.nodeLabels.filter((item) => item.groupId !== "group:ungrouped")).toHaveLength(6);
    expect(normalized.groups.map((group) => group.id)).toEqual([
      "group:claude",
      "group:rust",
    ]);
  });

  it("ignores incidental label candidate mentions", () => {
    const unrelated = [
      candidate("node:gardening", ["Gardening"]),
      candidate("node:cooking", ["Cooking"]),
    ].map((item) => ({
      ...item,
      labelCandidates: [
        {
          label: "Claude Codex commentary",
          source: "evidence-title" as const,
          score: 0.9,
          evidenceFeedItemIds: [],
          rationale: "incidental mention",
        },
      ],
    }));

    expect(
      selectAgentRuntimeReaderSummaryTopicCandidates(
        { candidates: unrelated, clusters: [] },
        2,
      ).map((item) => item.nodeId),
    ).toEqual(["node:cooking", "node:gardening"]);
  });

  it("handles empty limits and duplicate node ids deterministically", () => {
    const duplicate = candidate("node:duplicate", ["Claude"]);
    const input = {
      candidates: [
        duplicate,
        { ...duplicate, score: 0 },
        candidate("node:peer", ["Claude"]),
      ],
      clusters: [],
    } satisfies Pick<ReaderSummaryTopicLabelerInput, "candidates" | "clusters">;

    expect(selectAgentRuntimeReaderSummaryTopicCandidates(input, 0)).toEqual(
      [],
    );
    expect(
      selectAgentRuntimeReaderSummaryTopicCandidates(input, 2).map(
        (item) => item.nodeId,
      ),
    ).toEqual(["node:duplicate", "node:peer"]);
  });

  it("does not bridge unrelated cohorts through transport and prose noise", () => {
    const candidates = [
      candidate("node:flutter-1", ["Flutter", "https", "quality"]),
      candidate("node:flutter-2", ["Flutter", "ve", "agent"]),
      candidate("node:claude-1", ["Claude", "https", "never"]),
      candidate("node:claude-2", ["Claude", "quality", "agents"]),
      candidate("node:noise-only-1", ["href", "hey"]),
      candidate("node:noise-only-2", ["href", "hey"]),
    ];
    const selected = selectAgentRuntimeReaderSummaryTopicCandidates(
      {
        candidates,
        clusters: candidates.map((item, index) =>
          storyCluster(item.storyClusterId, candidates.length - index),
        ),
      },
      4,
    );

    expect(selected.map((item) => item.nodeId)).toEqual([
      "node:flutter-1",
      "node:flutter-2",
      "node:claude-1",
      "node:claude-2",
    ]);
  });
});

const candidate = (
  nodeId: string,
  keywords: readonly string[],
): ReaderSummaryTopicLabelCandidate => ({
  nodeId,
  storyClusterId: `story:${nodeId}`,
  fallbackLabel: keywords[0] ?? nodeId,
  score: 1,
  evidenceCount: 1,
  providerKeys: ["x-twitter"],
  interestIds: ["interest:ai"],
  keywords,
  labelCandidates: [],
});

const storyCluster = (id: string, score: number) => ({
  id,
  storyKey: id,
  representativeFeedItemId: `feed:${id}`,
  duplicateFeedItemIds: [],
  interestIds: ["interest:ai"],
  providerKeys: ["x-twitter"],
  score,
  observedAtRange: {
    startedAt: new Date("2026-07-09T00:00:00.000Z"),
    endedAt: new Date("2026-07-09T00:00:00.000Z"),
  },
  whyImportant: ["Fixture"],
});

const promptInput = (
  candidates: readonly ReaderSummaryTopicLabelCandidate[],
): ReaderSummaryTopicLabelerInput => ({
  tenantId: "tenant:test" as ReaderSummaryTopicLabelerInput["tenantId"],
  workspaceId: "workspace:test" as ReaderSummaryTopicLabelerInput["workspaceId"],
  scope: { type: "workspace" },
  period: {
    cadence: "daily",
    startedAt: new Date("2026-07-09T00:00:00.000Z"),
    endedAt: new Date("2026-07-10T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "2026-07-09",
  },
  requestedAt: new Date("2026-07-10T00:00:00.000Z"),
  clusters: candidates.map((item, index) =>
    storyCluster(item.storyClusterId, candidates.length - index),
  ),
  selectedEvidence: [],
  topStories: [],
  candidates,
});
