import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import { buildStoryRelationCandidates } from "./story-relation-candidates";
import {
  buildStoryRelationSafeRecallShadowCandidates,
  STORY_RELATION_SAFE_RECALL_SHADOW_MAX_CANDIDATES,
} from "./story-relation-safe-recall-shadow";

describe("story relation safe-recall shadow candidates", () => {
  it("generates a candidate from normalized title entity and event evidence", () => {
    const left = evidence(
      "cursor-announcement",
      "rss",
      "Cursor deployed at SpaceX",
      "Official customer story with unrelated prose.",
    );
    const right = evidence(
      "cursor-coverage",
      "hacker-news",
      "SpaceX deploying Cursor",
      "HN wrapper metadata without copied article text.",
    );
    const selection = splitSelection(left, right);
    const primaryCandidates = buildStoryRelationCandidates({
      selection,
      evidence: [left, right],
    });

    expect(primaryCandidates).toEqual([]);
    expect(
      buildStoryRelationSafeRecallShadowCandidates({
        selection,
        evidence: [left, right],
        primaryCandidates,
      }).candidates,
    ).toEqual([
      expect.objectContaining({
        leftFeedItemId: "cursor-announcement",
        rightFeedItemId: "cursor-coverage",
        shadowReasonCode: "title_normalized_entity_event_evidence",
        titleSharedIdentityTokenCount: 2,
        titleSharedEventTokenCount: 1,
      }),
    ]);
  });

  it("rejects strict-title pairs from aliases of the same provider", () => {
    const left = evidence(
      "cursor-x",
      "x-twitter",
      "Cursor deployed at SpaceX",
      "Official deployment note.",
    );
    const right = evidence(
      "cursor-twitter",
      "twitter",
      "SpaceX deploying Cursor",
      "A reposted wrapper.",
    );

    expect(buildStoryRelationSafeRecallShadowCandidates({
      selection: splitSelection(left, right),
      evidence: [left, right],
      primaryCandidates: [],
    }).candidates).toEqual([]);
  });

  it("generates official plus HN watermark morphology without body promotion", () => {
    const official = evidence(
      "watermark-official",
      "rss",
      "Claude's snippets are watermarked",
      "Anthropic publication body.",
    );
    const hackerNews = evidence(
      "watermark-hn",
      "hacker-news",
      "Watermarking Claude Code output",
      "Article URL and comments URL only.",
    );
    const selection = splitSelection(official, hackerNews);
    const primaryCandidates = buildStoryRelationCandidates({
      selection,
      evidence: [official, hackerNews],
    });
    const generated = buildStoryRelationSafeRecallShadowCandidates({
      selection,
      evidence: [official, hackerNews],
      primaryCandidates,
    });

    expect(primaryCandidates).toEqual([]);
    expect(generated.candidates).toEqual([
      expect.objectContaining({
        leftFeedItemId: "watermark-hn",
        rightFeedItemId: "watermark-official",
        shadowReasonCode: "title_normalized_entity_event_evidence",
        bodySharedTokenCount: 0,
      }),
    ]);
  });

  it("does not let strong body overlap compensate for weak titles", () => {
    const sharedBody = "Cursor deploys AI coding at SpaceX with a watermark.";
    const left = evidence("body-left", "rss", "Official product note", sharedBody);
    const right = evidence("body-right", "hacker-news", "Interesting discussion", sharedBody);

    expect(
      buildStoryRelationSafeRecallShadowCandidates({
        selection: splitSelection(left, right),
        evidence: [left, right],
        primaryCandidates: [],
      }).candidates,
    ).toEqual([]);
  });

  it("reports hydrated source-text overlap as verifier context", () => {
    const left = {
      ...evidence(
        "source-left",
        "rss",
        "Cursor deployed at SpaceX",
        "unrelated short preview",
      ),
      sourceText: "The bounded original evidence describes orbital rollout details.",
    };
    const right = {
      ...evidence(
        "source-right",
        "hacker-news",
        "SpaceX deploying Cursor",
        "different short preview",
      ),
      sourceText: "Discussion of orbital rollout details from the original report.",
    };

    expect(buildStoryRelationSafeRecallShadowCandidates({
      selection: splitSelection(left, right),
      evidence: [left, right],
      primaryCandidates: [],
    }).candidates[0]).toEqual(expect.objectContaining({
      bodySharedTokenCount: 3,
    }));
  });

  it("uses title-only facets even when bodies would make or reject eligibility", () => {
    const eligibleLeft = evidence(
      "eligible-left",
      "rss",
      "Claude snippets receive watermarking",
      "A benchmark review compares unrelated model scores.",
    );
    const eligibleRight = evidence(
      "eligible-right",
      "hacker-news",
      "Watermarked Claude snippets ship",
      "A security advisory reports an unrelated vulnerability.",
    );
    const weakBody = "Claude snippets receive watermarking in the same release.";
    const weakLeft = evidence("weak-left", "rss", "Product note", weakBody);
    const weakRight = evidence("weak-right", "hacker-news", "Discussion", weakBody);

    expect(
      buildStoryRelationSafeRecallShadowCandidates({
        selection: splitSelection(eligibleLeft, eligibleRight),
        evidence: [eligibleLeft, eligibleRight],
        primaryCandidates: [],
      }).candidates,
    ).toHaveLength(1);
    expect(
      buildStoryRelationSafeRecallShadowCandidates({
        selection: splitSelection(weakLeft, weakRight),
        evidence: [weakLeft, weakRight],
        primaryCandidates: [],
      }).candidates,
    ).toEqual([]);
  });

  it("rejects unrelated title events despite shared product identities", () => {
    const deployment = evidence(
      "cursor-deployment",
      "rss",
      "Cursor deploys at SpaceX",
      "Official deployment note.",
    );
    const watermark = evidence(
      "cursor-watermark",
      "hacker-news",
      "Cursor watermark found at SpaceX",
      "A separate generated-output discussion.",
    );

    expect(
      buildStoryRelationSafeRecallShadowCandidates({
        selection: splitSelection(deployment, watermark),
        evidence: [deployment, watermark],
        primaryCandidates: [],
      }).candidates,
    ).toEqual([]);
  });

  it("excludes every primary pair and reports the bounded reason code", () => {
    const left = evidence(
      "typescript-hn",
      "hacker-news",
      "TypeScript compiler rewrite moves to Go",
      "Microsoft details the native compiler migration plan.",
    );
    const right = evidence(
      "typescript-rss",
      "rss",
      "Go rewrite of the TypeScript compiler reaches developers",
      "The engineering team explains its faster build pipeline.",
    );
    const selection = splitSelection(left, right);
    const primaryCandidates = buildStoryRelationCandidates({
      selection,
      evidence: [left, right],
    });
    const generated = buildStoryRelationSafeRecallShadowCandidates({
      selection,
      evidence: [left, right],
      primaryCandidates,
    });

    expect(primaryCandidates).toHaveLength(1);
    expect(generated.candidates).toEqual([]);
    expect(generated.aggregates).toEqual([
      expect.objectContaining({
        reasonCode: "excluded_primary_pair",
        count: 1,
      }),
    ]);
  });

  it("is deterministic and never exceeds the global shadow cap", () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      evidence(
        `cursor-${String(index).padStart(2, "0")}`,
        index % 2 === 0 ? "rss" : "hacker-news",
        index % 2 === 0
          ? `Cursor deployed at SpaceX variant${index}`
          : `SpaceX deploying Cursor variant${index}`,
        uniqueWords("body", index),
      ),
    );
    const selection = splitSelection(...items);
    const primaryCandidates = buildStoryRelationCandidates({
      selection,
      evidence: items,
    });
    const forward = buildStoryRelationSafeRecallShadowCandidates({
      selection,
      evidence: items,
      primaryCandidates,
    });
    const reversed = buildStoryRelationSafeRecallShadowCandidates({
      selection,
      evidence: [...items].reverse(),
      primaryCandidates,
    });

    expect(primaryCandidates).toEqual([]);
    expect(forward.candidates).toHaveLength(
      STORY_RELATION_SAFE_RECALL_SHADOW_MAX_CANDIDATES,
    );
    expect(reversed).toEqual(forward);
    expect(forward.aggregates).toContainEqual({
      reasonCode: "excluded_global_cap",
      candidatePolicyVersion:
        "reader_summary.story_relation.safe_recall_shadow.v2",
      count: expect.any(Number),
    });
  });

  it("keeps the capped candidate set unchanged when only bodies change", () => {
    const items = Array.from({ length: 6 }, (_, index) =>
      evidence(
        `body-invariant-${index}`,
        index % 2 === 0 ? "rss" : "hacker-news",
        `Cursor deploys at SpaceX variant${index}`,
        `unshared body ${index}`,
      ),
    );
    const bodyMutated = items.map((item, index) => ({
      ...item,
      bodyPreview:
        index < 4
          ? "shared body context repeated across a preferred-looking subset"
          : `different body context ${index}`,
    }));
    const candidateIds = (evidenceItems: readonly SummaryEvidenceItem[]) =>
      buildStoryRelationSafeRecallShadowCandidates({
        selection: splitSelection(...evidenceItems),
        evidence: evidenceItems,
        primaryCandidates: [],
      }).candidates.map((candidate) =>
        [candidate.leftFeedItemId, candidate.rightFeedItemId].join("|"),
      );

    expect(candidateIds(bodyMutated)).toEqual(candidateIds(items));
  });
});

const evidence = (
  id: string,
  providerKey: string,
  title: string,
  bodyPreview: string,
): SummaryEvidenceItem => ({
  feedItemId: id,
  sourceItemId: `source:${id}`,
  sourceBindingId: `binding:${id}`,
  interestId: "interest-ai",
  providerKey,
  canonicalUrl: `https://${providerKey}.example.test/${id}`,
  title,
  bodyPreview,
  publishedAt: new Date("2026-08-15T08:00:00.000Z"),
  observedAt: new Date("2026-08-15T08:01:00.000Z"),
  score: 1,
  whyImportant: ["Safe-recall fixture"],
});

const uniqueWords = (prefix: string, itemIndex: number): string =>
  Array.from(
    { length: 12 },
    (_, tokenIndex) => `${prefix}${itemIndex}token${tokenIndex}`,
  ).join(" ");

const splitSelection = (
  ...items: readonly SummaryEvidenceItem[]
): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "test-v1",
  sourceWindow: {
    windowId: "window",
    startedAt: new Date("2026-08-15T00:00:00.000Z"),
    endedAt: new Date("2026-08-16T00:00:00.000Z"),
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
    observedAtRange: { startedAt: item.observedAt, endedAt: item.observedAt },
    whyImportant: item.whyImportant,
  })),
  selectedEvidence: items,
});
