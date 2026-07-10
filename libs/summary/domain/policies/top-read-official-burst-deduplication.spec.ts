import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { selectUniqueTopReadCandidates } from "./top-read-selection-policy";

describe("official publication burst top-read deduplication", () => {
  it("keeps one top read for an official announcement thread published in one second", () => {
    const result = selectUniqueTopReadCandidates(
      [story("intro"), story("details")],
      citations(["intro", "details"]),
      evidence([item("intro", 0), item("details", 0)]),
      clusters(["intro", "details"]),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("OpenAI announcement intro");
  });

  it("keeps separate official announcements published at different seconds", () => {
    const result = selectUniqueTopReadCandidates(
      [story("intro"), story("details")],
      citations(["intro", "details"]),
      evidence([item("intro", 0), item("details", 1)]),
      clusters(["intro", "details"]),
    );

    expect(result).toHaveLength(2);
  });

  it("keeps distinct product announcements published in the same second", () => {
    const result = selectUniqueTopReadCandidates(
      [story("work"), story("gpt")],
      citations(["work", "gpt"]),
      evidence([
        item("work", 0, "Introducing ChatGPT Work, a new agent for projects"),
        item("gpt", 0, "Sol, Terra and Luna join the GPT-5.6 rollout"),
      ]),
      clusters(["work", "gpt"]),
    );

    expect(result).toHaveLength(2);
  });
});

const story = (id: string): TopReadCandidate => ({
  storyClusterId: `story:${id}`,
  title: `OpenAI announcement ${id}`,
  summary: `OpenAI announcement ${id} details`,
  interestIds: ["ai-agents"],
  providerKeys: ["x-twitter"],
  citationIds: [`citation:${id}`],
});

const citations = (
  ids: readonly string[],
): ReadonlyMap<string, ReaderSummaryCitation> =>
  new Map(
    ids.map((id) => [
      `citation:${id}`,
      {
        citationId: `citation:${id}`,
        feedItemId: `feed:${id}`,
        sourceItemId: `source:${id}`,
        providerKey: "x-twitter",
        field: "canonicalUrl",
        canonicalUrl: `https://x.com/OpenAI/status/${id}`,
      },
    ]),
  );

const evidence = (
  items: readonly SummaryEvidenceItem[],
): ReadonlyMap<string, SummaryEvidenceItem> =>
  new Map(items.map((value) => [value.feedItemId, value]));

const item = (
  id: string,
  secondOffset: number,
  title = `OpenAI announcement ${id}`,
): SummaryEvidenceItem => ({
  feedItemId: `feed:${id}`,
  sourceItemId: `source:${id}`,
  sourceBindingId: "binding:x",
  interestId: "ai-agents",
  providerKey: "x-twitter",
  providerName: "X/Twitter",
  canonicalUrl: `https://x.com/OpenAI/status/${id}`,
  title,
  authorHandle: "OpenAI",
  publishedAt: new Date(1783598400000 + secondOffset * 1_000),
  observedAt: new Date("2026-07-09T12:01:00.000Z"),
  score: 2.4,
  whyImportant: ["First-party announcement"],
  providerMetricLabels: [{ label: "Likes", value: "1,000" }],
  contentQuality: {
    qualityScore: 1,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 1,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: ["official_account", "trusted_author"],
    reason: "First-party product announcement",
  },
});

const clusters = (ids: readonly string[]): ReadonlyMap<string, StoryCluster> =>
  new Map(
    ids.map((id) => [
      `story:${id}`,
      {
        id: `story:${id}`,
        storyKey: `url:x.com/openai/status/${id}`,
        representativeFeedItemId: `feed:${id}`,
        duplicateFeedItemIds: [],
        interestIds: ["ai-agents"],
        providerKeys: ["x-twitter"],
        score: 2.4,
        observedAtRange: {
          startedAt: new Date("2026-07-09T12:00:00.000Z"),
          endedAt: new Date("2026-07-09T12:01:00.000Z"),
        },
        whyImportant: ["First-party announcement"],
      },
    ]),
  );
