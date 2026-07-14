import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { STORY_RANKING_POLICY_V1 } from "../policies/story-ranking-policy";
import { StoryClusteringService } from "./story-clustering.service";
import {
  isDeterministicCrossProviderStoryMatch,
  isVerifiedStoryRelationGuardEligible,
  verifiedStoryRelationPairKey,
} from "./story-cluster-membership";
import {
  approvedStoryRelationPairs,
  buildStoryRelationCandidates,
} from "./story-relation-candidates";

const clock = { now: () => new Date("2026-07-08T00:00:00.000Z") };
const identity = {
  tenantId: tenantId("tenant-real-regression"),
  workspaceId: workspaceId("workspace-real-regression"),
  scope: { type: "workspace" as const },
};

describe("real reader-summary clustering regressions", () => {
  it.each([
    {
      headline:
        "Mark Zuckerberg tells staff that AI agents haven't progressed enough",
      firstId: "31743c05-84a6-464c-9e7c-273e93a6b530",
      secondId: "5056549e-72b2-474a-8cc2-5b503dddb8c6",
      publishedAt: "2026-07-05T17:05:35.000Z",
    },
    {
      headline: "Why TypeScript 7.0 Was Rewritten in Go",
      firstId: "6b3182dd-716d-4d2f-9dbd-c8c35f8c23e0",
      secondId: "d29f2d3d-6743-43e1-a6d7-6c2aba9fa726",
      publishedAt: "2026-07-07T20:40:06.000Z",
    },
  ])("clusters syndicated real headline: $headline", (fixture) => {
    const selection = new StoryClusteringService(clock).cluster({
      identity,
      items: [
        evidence({
          id: fixture.firstId,
          providerKey: "hacker-news",
          title: fixture.headline,
          bodyPreview: "",
          publishedAt: fixture.publishedAt,
        }),
        evidence({
          id: fixture.secondId,
          providerKey: "rss",
          title: fixture.headline,
          bodyPreview:
            "Article URL, comments URL, points, and feed wrapper metadata follow the syndicated headline.",
          publishedAt: fixture.publishedAt,
        }),
      ],
      limit: 10,
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]?.duplicateFeedItemIds).toHaveLength(1);
  });

  it("shortlists and safely clusters the real Anthropic J-space thread", () => {
    const items = jSpaceEvidence();
    const clusterer = new StoryClusteringService(clock);
    const deterministic = clusterer.cluster({ identity, items, limit: 10 });
    const candidates = buildStoryRelationCandidates({
      selection: deterministic,
      evidence: items,
    });
    const guardResults = itemPairs(items).map(([left, right]) =>
      isVerifiedStoryRelationGuardEligible(
        left,
        right,
        STORY_RANKING_POLICY_V1,
      ),
    );
    expect(deterministic.clusters).toHaveLength(3);
    expect(guardResults).toEqual([true, true, true]);
    expect(candidates).toHaveLength(3);

    const approved = approvedStoryRelationPairs({
      candidates,
      decisions: candidates.map((candidate) => ({
        leftFeedItemId: candidate.leftFeedItemId,
        rightFeedItemId: candidate.rightFeedItemId,
        sameStory: true,
        confidenceScore: 0.97,
      })),
    });
    const verified = clusterer.cluster({
      identity,
      items,
      limit: 10,
      verifiedStoryRelationPairs: approved,
    });

    expect(verified.clusters).toHaveLength(1);
    expect(verified.clusters[0]?.duplicateFeedItemIds).toHaveLength(2);
  });

  it("keeps unrelated Jul 13 Claude Code releases in separate stories", () => {
    const items = jul13ClaudeCodeReleaseEvidence();
    const clusterer = new StoryClusteringService({
      now: () => new Date("2026-07-14T00:05:00.000Z"),
    });
    const deterministic = clusterer.cluster({ identity, items, limit: 10 });
    const pairs = itemPairs(items);

    expect(
      pairs.map(([left, right]) =>
        isDeterministicCrossProviderStoryMatch(
          left,
          right,
          STORY_RANKING_POLICY_V1,
        ),
      ),
    ).toEqual([false, false, false]);
    expect(
      pairs.map(([left, right]) =>
        isVerifiedStoryRelationGuardEligible(
          left,
          right,
          STORY_RANKING_POLICY_V1,
        ),
      ),
    ).toEqual([false, false, false]);
    expect(deterministic.clusters).toHaveLength(3);
    expect(
      buildStoryRelationCandidates({
        selection: deterministic,
        evidence: items,
      }),
    ).toEqual([]);

    const forced = clusterer.cluster({
      identity,
      items,
      limit: 10,
      verifiedStoryRelationPairs: new Set(
        pairs.map(([left, right]) =>
          verifiedStoryRelationPairKey(left.feedItemId, right.feedItemId),
        ),
      ),
    });
    expect(forced.clusters).toHaveLength(3);
  });
});

const itemPairs = (
  items: readonly SummaryEvidenceItem[],
): readonly (readonly [SummaryEvidenceItem, SummaryEvidenceItem])[] => [
  [items[0]!, items[1]!],
  [items[0]!, items[2]!],
  [items[1]!, items[2]!],
];

const jSpaceEvidence = (): readonly SummaryEvidenceItem[] => [
  evidence({
    id: "8a2fd063-3ae6-46a1-8d0e-82a5a72c15f2",
    providerKey: "x-twitter",
    authorHandle: "AnthropicAI",
    publishedAt: "2026-07-06T17:35:04.000Z",
    title:
      "X post by @AnthropicAI: Observing the J-space can expose hidden goals in a model trained to sabotage code",
    bodyPreview:
      "Observing the J-space can expose hidden goals. In a model secretly trained to sabotage code, fake and fraud appear during coding responses.",
  }),
  evidence({
    id: "96539415-7816-4e17-ad04-8590c11dd4df",
    providerKey: "x-twitter",
    authorHandle: "AnthropicAI",
    publishedAt: "2026-07-06T17:35:05.000Z",
    title:
      "X post by @AnthropicAI: The J-space also shows us Claude's awareness of its situation",
    bodyPreview:
      "The J-space shows Claude's awareness in an evaluation designed to bait Claude into blackmail.",
  }),
  evidence({
    id: "769560c7-8ed3-4c85-9b92-c5da7c511160",
    providerKey: "x-twitter",
    authorHandle: "AnthropicAI",
    publishedAt: "2026-07-06T17:35:07.000Z",
    title:
      "X post by @AnthropicAI: The J-space lets us read audit and shape what Claude is actively thinking about",
    bodyPreview:
      "The J-space provides tools for keeping models trustworthy. Read the full paper.",
  }),
];

const jul13ClaudeCodeReleaseEvidence = (): readonly SummaryEvidenceItem[] => [
  evidence({
    id: "2ce5373f-6539-47d9-8965-7b6dd0eefde5",
    providerKey: "x-twitter",
    authorHandle: "cblakerouse",
    publishedAt: "2026-07-13T15:59:18.000Z",
    title:
      "X post by @cblakerouse: Introducing Keystroke: an n8n alternative built for Cursor, Claude Code, Codex. Here's how it...",
    bodyPreview:
      "Introducing Keystroke: an n8n alternative built for Cursor, Claude Code, Codex. Here's how it works.",
  }),
  evidence({
    id: "a2ba5b0b-f37e-41e4-a409-65adaf23d0fc",
    providerKey: "reddit",
    authorHandle: "Shinoken__",
    publishedAt: "2026-07-13T21:56:04.000Z",
    title:
      "10 days ago I posted my first Claude-built FPS here. 90 releases later, this is what it looks like.",
    bodyPreview:
      "Ten days ago I shared the first playable version of Voxstrike here. Since release 2026.4.0, Claude and Claude Code have shipped 90 releases across 277 commits.",
  }),
  evidence({
    id: "d7d2d5d2-22d6-495b-92d9-ed79037cbe1c",
    providerKey: "hacker-news",
    authorHandle: "softwaredoug",
    publishedAt: "2026-07-13T21:43:51.000Z",
    title:
      "A Study of Microsoft's Early 2026 Rollout of Claude Code and GitHub Copilot CLI",
    bodyPreview: "",
  }),
];

const evidence = (params: {
  readonly id: string;
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly publishedAt: string;
  readonly authorHandle?: string;
}): SummaryEvidenceItem => ({
  feedItemId: params.id,
  sourceItemId: `source:${params.id}`,
  sourceBindingId: `binding:${params.providerKey}`,
  interestId: "interest:ai",
  providerKey: params.providerKey,
  canonicalUrl: `https://${params.providerKey}.example.test/${params.id}`,
  title: params.title,
  bodyPreview: params.bodyPreview,
  authorHandle: params.authorHandle,
  publishedAt: new Date(params.publishedAt),
  observedAt: new Date(params.publishedAt),
  score: 2,
  whyImportant: ["Real July regression fixture"],
});
