import type { SourceTargetKind } from "./entities/source-target";

import { hackerNewsDailyMultiPassConfig } from "./hacker-news-daily-preset-config";
import { redditDailyMultiPassConfig } from "./reddit-daily-preset-config";
import {
  googleNewsDailyFeedUrl,
  googleNewsRssConfig,
} from "./rss-daily-preset-config";
import { xTwitterDailyConfig } from "./x-twitter-daily-preset-config";


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
      targetValue: "AI technology programming developer tools",
      targetConfig: redditDailyMultiPassConfig,
    },
    {
      providerKey: "hacker-news",
      targetKind: "search_query",
      targetValue: "AI developer Hacker News discovery",
      targetConfig: hackerNewsDailyMultiPassConfig,
    },
    {
      providerKey: "x-twitter",
      targetKind: "search_query",
      targetValue:
        'OpenAI OR Anthropic OR Claude OR LLM OR "AI agents" OR "coding agents" OR "AI infrastructure"',
      targetConfig: xTwitterDailyConfig,
    },
    {
      providerKey: "rss",
      targetKind: "url",
      targetValue: googleNewsDailyFeedUrl,
      targetConfig: googleNewsRssConfig,
    },
  ],
} satisfies SourceTargetPreset;
