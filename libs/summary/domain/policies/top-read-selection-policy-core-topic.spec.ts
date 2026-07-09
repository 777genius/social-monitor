import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { selectUniqueTopReadCandidates } from "./top-read-selection-policy";

describe("selectUniqueTopReadCandidates core-topic ordering", () => {
  it("prioritizes core AI product reads over broad tech when signals are close", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story(
          "broad-ai-infra",
          "AI data center construction sites face theft risk",
          "c-broad",
          ["reddit"],
        ),
        story(
          "claude-fable",
          "Claude Fable 5 access extended through July 12",
          "c-claude",
          ["x-twitter"],
        ),
      ],
      citations([
        citation("c-broad", "feed-broad", "reddit"),
        citation("c-claude", "feed-claude", "x-twitter"),
      ]),
      evidence([
        {
          ...evidenceItem("feed-broad", "reddit", [
            ["Score", "52,460"],
            ["Comments", "2,100"],
          ]),
          title: "AI data center construction sites face theft risk",
          whyImportant: [
            "A broad technology story about AI infrastructure theft risk.",
          ],
          score: 2.24,
        },
        {
          ...evidenceItem("feed-claude", "x-twitter", [
            ["Likes", "1,500"],
            ["Reposts", "240"],
          ]),
          title: "Claude Fable 5 access extended through July 12",
          whyImportant: [
            "Claude users discuss Fable 5 access, model usage and product workflow impact.",
          ],
          score: 2.18,
        },
      ]),
      new Map([
        cluster({
          id: "broad-ai-infra",
          representativeFeedItemId: "feed-broad",
          providerKeys: ["reddit"],
          score: 2.24,
          whyImportant: [
            "A broad technology story about AI infrastructure theft risk.",
          ],
        }),
        cluster({
          id: "claude-fable",
          representativeFeedItemId: "feed-claude",
          providerKeys: ["x-twitter"],
          score: 2.18,
          whyImportant: [
            "Claude users discuss Fable 5 access, model usage and product workflow impact.",
          ],
        }),
      ]),
    );

    expect(result.map((item) => item.title)).toEqual([
      "Claude Fable 5 access extended through July 12",
      "AI data center construction sites face theft risk",
    ]);
  });

  it("keeps a broad tech read ahead when its signal lead is material", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story(
          "major-ai-infra",
          "AI data center construction sites face theft risk",
          "c-major",
          ["reddit"],
        ),
        story(
          "small-claude",
          "Claude Fable 5 access extended through July 12",
          "c-small",
          ["x-twitter"],
        ),
      ],
      citations([
        citation("c-major", "feed-major", "reddit"),
        citation("c-small", "feed-small", "x-twitter"),
      ]),
      evidence([
        {
          ...evidenceItem("feed-major", "reddit", [["Score", "52,460"]]),
          title: "AI data center construction sites face theft risk",
          score: 2.7,
        },
        {
          ...evidenceItem("feed-small", "x-twitter", [["Likes", "1,500"]]),
          title: "Claude Fable 5 access extended through July 12",
          score: 2.1,
        },
      ]),
      new Map([
        cluster({
          id: "major-ai-infra",
          representativeFeedItemId: "feed-major",
          providerKeys: ["reddit"],
          score: 2.7,
        }),
        cluster({
          id: "small-claude",
          representativeFeedItemId: "feed-small",
          providerKeys: ["x-twitter"],
          score: 2.1,
        }),
      ]),
    );

    expect(result.map((item) => item.title)).toEqual([
      "AI data center construction sites face theft risk",
      "Claude Fable 5 access extended through July 12",
    ]);
  });

  it("does not use the core-topic boost between two core AI reads", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story(
          "taste-skill",
          "Codex and Claude Code turn prompts into polished designs",
          "c-taste",
          ["x-twitter"],
        ),
        story(
          "claude-cowork",
          "Claude Cowork is coming to mobile and web for long-running tasks",
          "c-cowork",
          ["x-twitter"],
        ),
      ],
      citations([
        citation("c-taste", "feed-taste", "x-twitter"),
        citation("c-cowork", "feed-cowork", "x-twitter"),
      ]),
      evidence([
        {
          ...evidenceItem("feed-taste", "x-twitter", [
            ["Likes", "1,598"],
            ["Reposts", "87"],
          ]),
          title: "Codex and Claude Code turn prompts into polished designs",
          bodyPreview:
            "Pair a design skill with Codex or Claude Code to turn prompts into polished pages.",
          score: 2.06,
        },
        {
          ...evidenceItem("feed-cowork", "x-twitter", [
            ["Likes", "20,917"],
            ["Reposts", "1,678"],
          ]),
          title:
            "Claude Cowork is coming to mobile and web for long-running tasks",
          bodyPreview:
            "Claude keeps long-running work moving across desktop, mobile and web.",
          score: 2.17,
        },
      ]),
      new Map([
        cluster({
          id: "taste-skill",
          representativeFeedItemId: "feed-taste",
          providerKeys: ["x-twitter"],
          score: 2.06,
        }),
        cluster({
          id: "claude-cowork",
          representativeFeedItemId: "feed-cowork",
          providerKeys: ["x-twitter"],
          score: 2.17,
        }),
      ]),
    );

    expect(result.map((item) => item.title)).toEqual([
      "Claude Cowork is coming to mobile and web for long-running tasks",
      "Codex and Claude Code turn prompts into polished designs",
    ]);
  });
});

const story = (
  id: string,
  title: string,
  citationId: string,
  providerKeys: readonly string[],
): TopReadCandidate => ({
  storyClusterId: `story:${id}`,
  title,
  summary: `${title} is worth reading.`,
  interestIds: ["ai-developer-tools"],
  providerKeys,
  citationIds: [citationId],
});

const citation = (
  citationId: string,
  feedItemId: string,
  providerKey: string,
): ReaderSummaryCitation => ({
  citationId,
  feedItemId,
  sourceItemId: `source-${feedItemId}`,
  providerKey,
  field: "title",
  canonicalUrl: `https://example.test/${feedItemId}`,
});

const citations = (
  values: readonly ReaderSummaryCitation[],
): ReadonlyMap<string, ReaderSummaryCitation> =>
  new Map(values.map((item) => [item.citationId, item] as const));

const evidence = (
  values: readonly SummaryEvidenceItem[],
): ReadonlyMap<string, SummaryEvidenceItem> =>
  new Map(values.map((item) => [item.feedItemId, item] as const));

const cluster = (params: {
  readonly id: string;
  readonly representativeFeedItemId: string;
  readonly providerKeys: readonly string[];
  readonly score: number;
  readonly whyImportant?: readonly string[];
}): readonly [string, StoryCluster] => {
  const value = {
    id: `story:${params.id}`,
    storyKey: `story-key:${params.id}`,
    representativeFeedItemId: params.representativeFeedItemId,
    duplicateFeedItemIds: [],
    interestIds: ["ai-developer-tools"],
    providerKeys: params.providerKeys,
    score: params.score,
    observedAtRange: {
      startedAt: new Date("2026-07-07T00:00:00.000Z"),
      endedAt: new Date("2026-07-07T01:00:00.000Z"),
    },
    whyImportant: params.whyImportant ?? [`Story ${params.id} is active.`],
  } satisfies StoryCluster;

  return [value.id, value] as const;
};

const evidenceItem = (
  feedItemId: string,
  providerKey: string,
  metrics: readonly (readonly [string, string])[],
): SummaryEvidenceItem => ({
  feedItemId,
  sourceItemId: `source-${feedItemId}`,
  sourceBindingId: `binding-${providerKey}`,
  interestId: "ai-developer-tools",
  providerKey,
  providerName: providerKey,
  canonicalUrl: `https://example.test/${feedItemId}`,
  title: feedItemId,
  publishedAt: new Date("2026-07-07T00:00:00.000Z"),
  observedAt: new Date("2026-07-07T00:05:00.000Z"),
  score: 2.4,
  whyImportant: ["Strong source engagement signal"],
  providerMetricLabels: metrics.map(([label, value]) => ({ label, value })),
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: [],
    reason: "Test quality signal",
  },
});
