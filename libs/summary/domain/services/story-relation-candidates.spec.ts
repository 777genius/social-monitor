import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import { StoryClusteringService } from "./story-clustering.service";
import { verifiedStoryRelationPairKey } from "./story-cluster-membership";
import {
  approvedStoryRelationPairs,
  buildStoryRelationCandidates,
} from "./story-relation-candidates";

const clock = { now: () => new Date("2026-07-11T12:00:00.000Z") };

describe("story relation candidate verification", () => {
  it("shortlists a cross-provider paraphrase below deterministic similarity", () => {
    const left = evidence({
      id: "typescript-hn",
      providerKey: "hacker-news",
      title: "TypeScript compiler rewrite moves to Go",
      bodyPreview: "Microsoft details the native compiler migration plan.",
    });
    const right = evidence({
      id: "typescript-rss",
      providerKey: "rss",
      title: "Go rewrite of the TypeScript compiler reaches developers",
      bodyPreview: "The engineering team explains its faster build pipeline.",
    });

    const candidates = buildStoryRelationCandidates({
      selection: splitSelection(left, right),
      evidence: [left, right],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      leftFeedItemId: "typescript-hn",
      rightFeedItemId: "typescript-rss",
    });
    expect(candidates[0]?.sharedTopicTokens).toEqual(
      expect.arrayContaining(["compiler", "rewrite", "typescript"]),
    );
  });

  it("does not shortlist a release and a subjective user reaction", () => {
    const rollout = evidence({
      id: "gpt-rollout",
      providerKey: "x-twitter",
      title: "OpenAI starts rolling out GPT-5.6 Sol",
      bodyPreview: "The GPT-5.6 family is rolling out in ChatGPT and Codex.",
    });
    const reaction = evidence({
      id: "gpt-reaction",
      providerKey: "reddit",
      title: "My first impressions of GPT-5.6 Sol",
      bodyPreview: "I tried the model and it feels awesome for refactoring.",
    });

    expect(
      buildStoryRelationCandidates({
        selection: splitSelection(rollout, reaction),
        evidence: [rollout, reaction],
      }),
    ).toEqual([]);
  });

  it("does not shortlist unrelated events that share only product entities", () => {
    const [freeAccess, simulator] = unrelatedFableEvidence();

    expect(
      buildStoryRelationCandidates({
        selection: splitSelection(freeAccess, simulator),
        evidence: [freeAccess, simulator],
      }),
    ).toEqual([]);
  });

  it("verifies short paraphrases that share an operational incident facet", () => {
    const outage = evidence({
      id: "claude-code-outage",
      providerKey: "x-twitter",
      title: "Claude Code outage",
      bodyPreview: "",
    });
    const unavailable = evidence({
      id: "claude-code-unavailable",
      providerKey: "rss",
      title: "Claude Code unavailable",
      bodyPreview: "",
    });
    const service = new StoryClusteringService(clock);
    const identity = {
      tenantId: tenantId("tenant-short-incident"),
      workspaceId: workspaceId("workspace-short-incident"),
      scope: { type: "workspace" as const },
    };
    const deterministic = service.cluster({
      identity,
      items: [outage, unavailable],
      limit: 10,
    });
    const candidates = buildStoryRelationCandidates({
      selection: deterministic,
      evidence: [outage, unavailable],
    });

    expect(deterministic.clusters).toHaveLength(2);
    expect(candidates).toHaveLength(1);
    const verified = service.cluster({
      identity,
      items: [outage, unavailable],
      limit: 10,
      verifiedStoryRelationPairs: approvedStoryRelationPairs({
        candidates,
        decisions: [
          {
            leftFeedItemId: outage.feedItemId,
            rightFeedItemId: unavailable.feedItemId,
            sameStory: true,
            confidenceScore: 0.97,
          },
        ],
      }),
    });

    expect(verified.clusters).toHaveLength(1);
    expect(verified.clusters[0]?.providerKeys).toEqual(["rss", "x-twitter"]);
  });

  it("keeps an outage separate from ordinary product access", () => {
    const outage = evidence({
      id: "claude-code-outage",
      providerKey: "x-twitter",
      title: "Claude Code outage",
      bodyPreview: "",
    });
    const planAccess = evidence({
      id: "claude-code-plus-access",
      providerKey: "rss",
      title: "Claude Code available in Plus",
      bodyPreview: "Access was extended for subscribers.",
    });

    expect(
      buildStoryRelationCandidates({
        selection: splitSelection(outage, planAccess),
        evidence: [outage, planAccess],
      }),
    ).toEqual([]);

    const verified = new StoryClusteringService(clock).cluster({
      identity: {
        tenantId: tenantId("tenant-incident-vs-access"),
        workspaceId: workspaceId("workspace-incident-vs-access"),
        scope: { type: "workspace" },
      },
      items: [outage, planAccess],
      limit: 10,
      verifiedStoryRelationPairs: new Set([
        verifiedStoryRelationPairKey(outage.feedItemId, planAccess.feedItemId),
      ]),
    });

    expect(verified.clusters).toHaveLength(2);
    expect(
      verified.clusters.flatMap((cluster) => cluster.duplicateFeedItemIds),
    ).toEqual([]);
  });

  it("does not shortlist same-provider or distant evidence", () => {
    const first = evidence({
      id: "first",
      providerKey: "rss",
      title: "TypeScript compiler rewrite moves to Go",
      bodyPreview: "Microsoft details the compiler rewrite.",
    });
    const sameProvider = evidence({
      id: "same-provider",
      providerKey: "rss",
      title: "Go rewrite changes the TypeScript compiler",
      bodyPreview: "Microsoft details the compiler rewrite.",
    });
    const distant = evidence({
      id: "distant",
      providerKey: "hacker-news",
      title: "Go rewrite changes the TypeScript compiler",
      bodyPreview: "Microsoft details the compiler rewrite.",
      publishedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(
      buildStoryRelationCandidates({
        selection: splitSelection(first, sameProvider, distant),
        evidence: [first, sameProvider, distant],
      }),
    ).toEqual([]);
  });

  it("shortlists a nearby same-author series for semantic verification", () => {
    const first = evidence({
      id: "j-space-audit",
      providerKey: "x-twitter",
      authorHandle: "@AnthropicAI",
      title: "The J-space lets us audit what Claude is thinking",
      bodyPreview:
        "The J-space research exposes hidden model goals during coding.",
    });
    const second = evidence({
      id: "j-space-sabotage",
      providerKey: "x-twitter",
      authorHandle: "@anthropicai",
      title: "The J-space exposes hidden goals in Claude",
      bodyPreview:
        "The same J-space research finds sabotage signals during coding.",
      publishedAt: "2026-07-11T08:20:00.000Z",
    });

    expect(
      buildStoryRelationCandidates({
        selection: splitSelection(first, second),
        evidence: [first, second],
      }),
    ).toHaveLength(1);
  });

  it("does not shortlist a same-author series outside the bounded window", () => {
    const first = evidence({
      id: "series-now",
      providerKey: "x-twitter",
      authorHandle: "@publisher",
      title: "J-space research explains hidden model goals",
      bodyPreview: "The J-space paper studies hidden model goals.",
    });
    const distant = evidence({
      id: "series-later",
      providerKey: "x-twitter",
      authorHandle: "@publisher",
      title: "J-space research finds hidden model goals",
      bodyPreview: "The J-space paper studies hidden model goals.",
      publishedAt: "2026-07-11T11:00:01.000Z",
    });

    expect(
      buildStoryRelationCandidates({
        selection: splitSelection(first, distant),
        evidence: [first, distant],
      }),
    ).toEqual([]);
  });

  it("clusters strong exact syndicated titles despite noisy wrapper bodies", () => {
    const headline =
      "Mark Zuckerberg tells staff that AI agents have not progressed enough";
    const first = evidence({
      id: "headline-hn",
      providerKey: "hacker-news",
      title: headline,
      bodyPreview: "",
    });
    const second = evidence({
      id: "headline-rss",
      providerKey: "rss",
      title: headline,
      bodyPreview:
        "Article URL comments URL points discussion metadata and wrapper markup unrelated to the headline.",
    });

    const selection = new StoryClusteringService(clock).cluster({
      identity: {
        tenantId: tenantId("tenant-syndicated-title"),
        workspaceId: workspaceId("workspace-syndicated-title"),
        scope: { type: "workspace" },
      },
      items: [first, second],
      limit: 10,
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]?.duplicateFeedItemIds).toHaveLength(1);
  });

  it("accepts only complete high-confidence verifier decisions", () => {
    const left = evidence({
      id: "left",
      providerKey: "hacker-news",
      title: "TypeScript compiler rewrite moves to Go",
      bodyPreview: "Microsoft details the compiler rewrite.",
    });
    const right = evidence({
      id: "right",
      providerKey: "rss",
      title: "Go rewrite changes the TypeScript compiler",
      bodyPreview: "Microsoft details the compiler rewrite.",
    });
    const candidates = buildStoryRelationCandidates({
      selection: splitSelection(left, right),
      evidence: [left, right],
    });

    expect(
      approvedStoryRelationPairs({
        candidates,
        decisions: [
          {
            leftFeedItemId: "left",
            rightFeedItemId: "right",
            sameStory: true,
            confidenceScore: 0.91,
          },
        ],
      }).size,
    ).toBe(0);
    expect(
      approvedStoryRelationPairs({
        candidates,
        decisions: [
          {
            leftFeedItemId: "left",
            rightFeedItemId: "right",
            sameStory: true,
            confidenceScore: 0.96,
          },
        ],
      }),
    ).toEqual(new Set([verifiedStoryRelationPairKey("left", "right")]));
    expect(() =>
      approvedStoryRelationPairs({ candidates, decisions: [] }),
    ).toThrow("decide each shortlisted pair exactly once");
  });

  it("does not allow transitive merging without every pair approval", () => {
    const first = evidence({
      id: "first",
      providerKey: "x-twitter",
      title: "TypeScript compiler rewrite moves to Go",
      bodyPreview: "Microsoft details the compiler rewrite plan alpha.",
    });
    const second = evidence({
      id: "second",
      providerKey: "rss",
      title: "Go rewrite changes the TypeScript compiler",
      bodyPreview: "Microsoft details the compiler rewrite plan beta.",
    });
    const third = evidence({
      id: "third",
      providerKey: "reddit",
      title: "TypeScript compiler rewrite uses Go",
      bodyPreview: "Microsoft discusses the compiler rewrite plan gamma.",
    });
    const service = new StoryClusteringService(clock);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-story-relations"),
        workspaceId: workspaceId("workspace-story-relations"),
        scope: { type: "workspace" },
      },
      items: [first, second, third],
      limit: 10,
      verifiedStoryRelationPairs: new Set([
        verifiedStoryRelationPairKey("first", "second"),
        verifiedStoryRelationPairKey("second", "third"),
      ]),
    });

    expect(selection.clusters).toHaveLength(2);
    expect(
      selection.clusters.some(
        (cluster) => cluster.duplicateFeedItemIds.length === 1,
      ),
    ).toBe(true);
  });

  it("does not merge unrelated product facets even with a verified pair", () => {
    const [freeAccess, simulator] = unrelatedFableEvidence();

    const selection = new StoryClusteringService(clock).cluster({
      identity: {
        tenantId: tenantId("tenant-unrelated-fable-facets"),
        workspaceId: workspaceId("workspace-unrelated-fable-facets"),
        scope: { type: "workspace" },
      },
      items: [freeAccess, simulator],
      limit: 10,
      verifiedStoryRelationPairs: new Set([
        verifiedStoryRelationPairKey(
          freeAccess.feedItemId,
          simulator.feedItemId,
        ),
      ]),
    });

    expect(selection.clusters).toHaveLength(2);
    expect(
      selection.clusters.flatMap((cluster) => cluster.duplicateFeedItemIds),
    ).toEqual([]);
  });

  it("preserves cross-provider merging for the same concrete event", () => {
    const announcement = evidence({
      id: "fable-access-announcement",
      providerKey: "x-twitter",
      title: "Anthropic extends Fable 5 free access through July 19",
      bodyPreview: "The free access window remains open through July 19.",
    });
    const coverage = evidence({
      id: "fable-access-coverage",
      providerKey: "rss",
      title: "Fable 5 free access extended by Anthropic through July 19",
      bodyPreview: "The free access extension lasts through July 19.",
    });

    const selection = new StoryClusteringService(clock).cluster({
      identity: {
        tenantId: tenantId("tenant-fable-access-event"),
        workspaceId: workspaceId("workspace-fable-access-event"),
        scope: { type: "workspace" },
      },
      items: [announcement, coverage],
      limit: 10,
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]?.providerKeys).toEqual(["rss", "x-twitter"]);
  });

  it("merges a same-author series only when every pair is approved", () => {
    const items = ["audit", "sabotage", "awareness"].map((id, index) =>
      evidence({
        id,
        providerKey: "x-twitter",
        authorHandle: "@AnthropicAI",
        title: `J-space Claude research ${id}`,
        bodyPreview: `The J-space paper studies hidden Claude goals ${id}.`,
        publishedAt: `2026-07-11T08:${String(index * 10).padStart(2, "0")}:00.000Z`,
      }),
    );
    const service = new StoryClusteringService(clock);
    const verifiedStoryRelationPairs = new Set([
      verifiedStoryRelationPairKey("audit", "sabotage"),
      verifiedStoryRelationPairKey("audit", "awareness"),
      verifiedStoryRelationPairKey("sabotage", "awareness"),
    ]);

    const selection = service.cluster({
      identity: {
        tenantId: tenantId("tenant-same-author-series"),
        workspaceId: workspaceId("workspace-same-author-series"),
        scope: { type: "workspace" },
      },
      items,
      limit: 10,
      verifiedStoryRelationPairs,
    });

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]?.duplicateFeedItemIds).toHaveLength(2);
  });
});

const evidence = (params: {
  readonly id: string;
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly publishedAt?: string;
  readonly authorHandle?: string;
}): SummaryEvidenceItem => ({
  feedItemId: params.id,
  sourceItemId: `source-${params.id}`,
  sourceBindingId: `binding-${params.id}`,
  interestId: "interest-ai",
  providerKey: params.providerKey,
  canonicalUrl: `https://${params.providerKey}.example.test/${params.id}`,
  title: params.title,
  bodyPreview: params.bodyPreview,
  authorHandle: params.authorHandle,
  publishedAt: new Date(params.publishedAt ?? "2026-07-11T08:00:00.000Z"),
  observedAt: new Date("2026-07-11T08:05:00.000Z"),
  score: 1.5,
  whyImportant: ["Relevant"],
});

const unrelatedFableEvidence = (): readonly [
  SummaryEvidenceItem,
  SummaryEvidenceItem,
] => [
  evidence({
    id: "fable-free-access",
    providerKey: "x-twitter",
    title:
      "X post by @publisher: Anthropic extends Fable 5 free access and a 50% Claude Code usage-limit increase through July 19",
    bodyPreview:
      "Anthropic extended the Fable 5 access window and Claude Code usage limit promotion.",
  }),
  evidence({
    id: "fable-simulator",
    providerKey: "reddit",
    title: "Fun Reddit simulator built with Claude Code",
    bodyPreview:
      "The client was designed with Claude Fable 5 and built as a web app on an existing backend.",
  }),
];

const splitSelection = (
  ...items: readonly SummaryEvidenceItem[]
): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "test-v1",
  sourceWindow: {
    windowId: "window",
    startedAt: new Date("2026-07-11T00:00:00.000Z"),
    endedAt: new Date("2026-07-12T00:00:00.000Z"),
    selectedFeedItemIds: items.map((item) => item.feedItemId),
    storyClusterIds: items.map((item) => `story:${item.feedItemId}`),
  },
  clusters: items.map((item): StoryCluster => ({
    id: `story:${item.feedItemId}`,
    storyKey: item.feedItemId,
    representativeFeedItemId: item.feedItemId,
    duplicateFeedItemIds: [],
    interestIds: [item.interestId],
    providerKeys: [item.providerKey],
    score: item.score,
    observedAtRange: {
      startedAt: item.observedAt,
      endedAt: new Date(item.observedAt.getTime() + 1),
    },
    whyImportant: item.whyImportant,
  })),
  selectedEvidence: items,
});
