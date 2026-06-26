import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { UserRelevanceProfile } from "../entities/user-relevance-profile";
import { RankingPolicy, type RankingCandidate } from "./ranking-policy";

describe("RankingPolicy", () => {
  it("ranks candidates from normalized source signal without provider-native metadata", () => {
    const generatedAt = new Date("2026-06-22T10:00:00.000Z");
    const profile = UserRelevanceProfile.create({
      id: "profile-ranking-policy",
      tenantId: tenantId("tenant-ranking-policy"),
      workspaceId: workspaceId("workspace-ranking-policy"),
      userId: "user-ranking-policy",
      topicWeights: [{ key: "topic-ai", weight: 1 }],
      sourceWeights: [{ key: "reddit", weight: 0.5 }],
      keywordWeights: [{ key: "agents", weight: 1 }],
      mutedKeywords: [],
      blockedProviderKeys: [],
      createdAt: generatedAt,
      updatedAt: generatedAt,
    });
    const policy = new RankingPolicy();

    const result = policy.rank({
      candidates: [
        candidate({
          id: "candidate-low-signal",
          providerKey: "hacker-news",
          title: "Routine frontend release",
          sourceSignalScore: 0.05,
        }),
        candidate({
          id: "candidate-high-signal",
          providerKey: "reddit",
          title: "AI agents reliability playbook",
          sourceSignalScore: 0.8,
        }),
      ],
      profile,
      generatedAt,
      limit: 10,
    });

    expect(result.map((item) => item.candidate.id)).toEqual([
      "candidate-high-signal",
      "candidate-low-signal",
    ]);
    expect(result[0]?.whyImportant).toEqual(
      expect.arrayContaining([
        "Matches a preferred topic",
        "Comes from a preferred source",
        "Strong source engagement signal",
      ]),
    );
  });

  it("clusters similar candidates and keeps duplicate ids out of the winner", () => {
    const generatedAt = new Date("2026-06-22T10:00:00.000Z");
    const policy = new RankingPolicy();

    const result = policy.rank({
      candidates: [
        candidate({
          id: "candidate-a",
          title: "Kubernetes autoscaling reliability improves in release",
          canonicalUrl: "https://example.com/a?ref=one",
          sourceSignalScore: 0.2,
        }),
        candidate({
          id: "candidate-b",
          title: "Kubernetes release improves autoscaling reliability",
          canonicalUrl: "https://another.example/b",
          sourceSignalScore: 0.3,
        }),
      ],
      profile: null,
      generatedAt,
      limit: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        candidate: expect.objectContaining({ id: "candidate-b" }),
        clusterSize: 2,
        duplicateCandidateIds: ["candidate-a"],
      }),
    );
  });

  it("applies memory guidance without requiring a persisted profile", () => {
    const generatedAt = new Date("2026-06-22T10:00:00.000Z");
    const policy = new RankingPolicy();

    const result = policy.rank({
      candidates: [
        candidate({
          id: "candidate-github",
          providerKey: "github",
          title: "Agent runtime release with orchestration benchmarks",
          sourceSignalScore: 0.1,
        }),
        candidate({
          id: "candidate-reddit",
          providerKey: "reddit",
          title: "Agent workflow discussion",
          sourceSignalScore: 0.2,
        }),
        candidate({
          id: "candidate-rss",
          providerKey: "rss",
          title: "Low quality agent roundup",
          sourceSignalScore: 0.7,
        }),
      ],
      profile: null,
      memoryGuidance: {
        providerPreferences: [{ key: "github", weight: 1 }],
        keywordPreferences: [{ key: "orchestration", weight: 1 }],
        blockedProviderKeys: ["rss"],
      },
      generatedAt,
      limit: 10,
    });

    expect(result.map((item) => item.candidate.id)).toEqual([
      "candidate-github",
      "candidate-reddit",
    ]);
    expect(result[0]?.whyImportant).toContain("Matches memory preference");
  });
});

const candidate = (
  overrides: Partial<RankingCandidate> & Pick<RankingCandidate, "id" | "title">,
): RankingCandidate => ({
  topicId: "topic-ai",
  providerKey: "rss",
  canonicalUrl: `https://example.com/${overrides.id}`,
  bodyPreview: "Fresh source item about AI systems.",
  publishedAt: new Date("2026-06-22T09:45:00.000Z"),
  sourceSignalScore: 0,
  ...overrides,
});
