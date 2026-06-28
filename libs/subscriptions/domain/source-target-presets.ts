import type { SourceTargetKind } from "./entities/source-target";

export type SourceTargetPresetEntry = {
  readonly providerKey: string;
  readonly targetKind: SourceTargetKind;
  readonly targetValue: string;
  readonly targetConfig: Readonly<Record<string, unknown>>;
};

export type SourceTargetPresetSummaryPreference = {
  readonly language: "auto" | "en" | "ru";
  readonly format: "executive_brief" | "bullet_digest" | "risk_brief";
  readonly tone: "neutral" | "concise" | "analytical";
  readonly maxKeyPoints: number;
  readonly includeRisks: boolean;
  readonly includeSourceHighlights: boolean;
  readonly customInstructions: string;
};

export type SourceTargetPreset = {
  readonly presetId: string;
  readonly displayName: string;
  readonly description: string;
  readonly defaultIntervalSeconds: number;
  readonly summaryPreference: SourceTargetPresetSummaryPreference;
  readonly entries: readonly SourceTargetPresetEntry[];
};

const redditDailyMultiPassConfig = {
  maxItems: 30,
  scanPasses: [
    {
      mode: "listing",
      subreddit: "OpenAI",
      listing: "top",
      topTime: "day",
      maxItems: 10,
      minScore: 10,
    },
    {
      mode: "listing",
      subreddit: "LocalLLaMA",
      listing: "top",
      topTime: "day",
      maxItems: 10,
      minScore: 10,
    },
    {
      mode: "listing",
      subreddit: "MachineLearning",
      listing: "top",
      topTime: "day",
      maxItems: 10,
      minScore: 10,
    },
    {
      mode: "search",
      query: 'OpenAI OR LocalLLaMA OR "machine learning" OR "AI agents" OR LLM',
      maxItems: 12,
      minScore: 5,
    },
  ],
} as const;

const hnSearchConfig = {
  maxItems: 10,
} as const;

const rssConfig = {
  maxItems: 15,
} as const;

const xTwitterDailyConfig = {
  language: "en",
  windowHours: 24,
  searchProducts: ["top", "latest"],
  maxItems: 30,
  limitPerProduct: 50,
  minLikes: 10,
  minRetweets: 0,
  minReplies: 0,
} as const;

export const aiDeveloperSignalSourcePreset = {
  presetId: "ai-developer-signal-v1",
  displayName: "AI developer signal",
  description:
    "High-signal AI, agent tooling, Flutter/Dart, JS/Node, Python, webdev and security sources.",
  defaultIntervalSeconds: 28_800,
  summaryPreference: {
    language: "auto",
    format: "bullet_digest",
    tone: "analytical",
    maxKeyPoints: 8,
    includeRisks: true,
    includeSourceHighlights: true,
    customInstructions:
      "Prioritize concrete product, library, release, security and developer-workflow signals. Prefer highly engaged source items and explain why each source matters.",
  },
  entries: [
    {
      providerKey: "reddit",
      targetKind: "search_query",
      targetValue: "OpenAI LocalLLaMA MachineLearning AI agents",
      targetConfig: redditDailyMultiPassConfig,
    },
    ...[
      "openai",
      "claude",
      "ai coding agents",
      "flutter dart",
      "javascript node",
      "python developer tools",
      "cybersecurity",
    ].map((query): SourceTargetPresetEntry => ({
      providerKey: "hacker-news",
      targetKind: "search_query",
      targetValue: query,
      targetConfig: hnSearchConfig,
    })),
    ...[
      "openai",
      "claude ai",
      "ai coding agents",
      "claude code codex cursor",
      "flutter dart",
      "javascript node",
      "python developer tools",
      "cybersecurity",
    ].map((query): SourceTargetPresetEntry => ({
      providerKey: "x-twitter",
      targetKind: "search_query",
      targetValue: query,
      targetConfig: xTwitterDailyConfig,
    })),
    ...[
      "https://hnrss.org/best",
      "https://hnrss.org/frontpage",
      "https://hnrss.org/newest?q=AI",
      "https://hnrss.org/newest?q=Flutter",
      "https://hnrss.org/newest?q=cybersecurity",
    ].map((url): SourceTargetPresetEntry => ({
      providerKey: "rss",
      targetKind: "url",
      targetValue: url,
      targetConfig: rssConfig,
    })),
  ],
} satisfies SourceTargetPreset;
