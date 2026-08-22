import type {
  ReaderSummaryCitation,
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../domain";

export const AUG_14_WATERMARK_REDDIT_TITLE =
  "Does Claude Code leave watermarks inside codes?";

export const aug14RelatedTopicEvidence = (): readonly SummaryEvidenceItem[] => [
  evidence({
    feedItemId: "aug14-watermark-official",
    sourceItemId: "anthropic-text-watermarking",
    providerKey: "rss",
    title: "Anthropic introduces text watermarking for Claude-generated code",
    canonicalUrl: "https://www.anthropic.com/research/text-watermarking",
    bodyPreview:
      "Anthropic describes an official text-watermarking technique for tracing Claude-generated code.",
    score: 0.98,
    official: true,
  }),
  evidence({
    feedItemId: "aug14-watermark-hn",
    sourceItemId: "hn-45201314",
    providerKey: "hacker-news",
    title: "Anthropic's text watermarking for Claude-generated code",
    canonicalUrl: "https://news.ycombinator.com/item?id=45201314",
    bodyPreview:
      "Hacker News discusses Anthropic's official text-watermarking publication.",
    score: 0.86,
  }),
  evidence({
    feedItemId: "aug14-watermark-reddit",
    sourceItemId: "reddit-1mt-watermark-code",
    providerKey: "reddit",
    title: AUG_14_WATERMARK_REDDIT_TITLE,
    canonicalUrl:
      "https://www.reddit.com/r/ClaudeAI/comments/1mtwatermark/does_claude_code_leave_watermarks_inside_codes/",
    bodyPreview:
      "A Reddit user asks whether Claude Code leaves detectable watermarks inside generated code.",
    score: 0.41,
    metrics: [
      { label: "Score", value: "7" },
      { label: "Comments", value: "5" },
    ],
  }),
];

export const aug14RelatedTopicClusters = (): readonly StoryCluster[] => [
  cluster({
    id: "story:aug14-anthropic-watermark",
    representativeFeedItemId: "aug14-watermark-official",
    duplicateFeedItemIds: ["aug14-watermark-hn"],
    providerKeys: ["rss", "hacker-news"],
    score: 1.84,
  }),
  cluster({
    id: "story:aug14-reddit-watermark-question",
    representativeFeedItemId: "aug14-watermark-reddit",
    duplicateFeedItemIds: [],
    providerKeys: ["reddit"],
    score: 0.41,
  }),
];

export const aug14RelatedTopicSelection = (): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "story-ranking.v1",
  sourceWindow: {
    windowId: "window:2026-08-14",
    startedAt: new Date("2026-08-14T00:00:00.000Z"),
    endedAt: new Date("2026-08-15T00:00:00.000Z"),
    selectedFeedItemIds: aug14RelatedTopicEvidence().map((item) => item.feedItemId),
    storyClusterIds: aug14RelatedTopicClusters().map((item) => item.id),
  },
  clusters: aug14RelatedTopicClusters(),
  selectedEvidence: aug14RelatedTopicEvidence(),
});

export const aug14RelatedTopicCitations = (): readonly ReaderSummaryCitation[] =>
  aug14RelatedTopicEvidence().map((item) => ({
    citationId: `citation:${item.feedItemId}`,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    field: "canonicalUrl",
    canonicalUrl: item.canonicalUrl,
  }));

const evidence = (params: {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly title: string;
  readonly canonicalUrl: string;
  readonly bodyPreview: string;
  readonly score: number;
  readonly official?: boolean;
  readonly metrics?: readonly { readonly label: string; readonly value: string }[];
}): SummaryEvidenceItem => ({
  ...params,
  sourceBindingId: `binding:${params.providerKey}`,
  interestId: "interest:claude-code",
  providerName: params.providerKey,
  publishedAt: new Date("2026-08-14T12:00:00.000Z"),
  observedAt: new Date("2026-08-14T12:05:00.000Z"),
  whyImportant: [],
  providerMetricLabels: params.metrics ?? [],
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: params.official === true,
    needsLlmReview: false,
    decision: params.official === true ? "promote" : "include",
    flags: params.official === true ? ["official_account", "trusted_author"] : [],
    reason: "Aug 14 deterministic fixture",
  },
});

const cluster = (params: {
  readonly id: string;
  readonly representativeFeedItemId: string;
  readonly duplicateFeedItemIds: readonly string[];
  readonly providerKeys: readonly string[];
  readonly score: number;
}): StoryCluster => ({
  ...params,
  storyKey: params.id,
  rankingPolicyVersion: "story-ranking.v1",
  interestIds: ["interest:claude-code"],
  observedAtRange: {
    startedAt: new Date("2026-08-14T12:00:00.000Z"),
    endedAt: new Date("2026-08-14T12:05:00.000Z"),
  },
  whyImportant: ["Text watermarking is under discussion."],
});
