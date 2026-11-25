import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";

export const shouldApplyCoreTopicLead = (params: {
  readonly leftStrength: number;
  readonly rightStrength: number;
  readonly signalDiff: number;
}): boolean =>
  Math.abs(params.signalDiff) <= 0.18 &&
  ((isCoreTopicStrength(params.rightStrength) &&
    isBroadOnlyTopicStrength(params.leftStrength)) ||
    (isCoreTopicStrength(params.leftStrength) &&
      isBroadOnlyTopicStrength(params.rightStrength)));

export const topReadCoreTopicStrength = (params: {
  readonly story: TopReadCandidate;
  readonly cluster: StoryCluster | undefined;
  readonly evidence: readonly SummaryEvidenceItem[];
}): number => {
  const text = normalizeTopicText([
    params.story.title,
    params.story.summary,
    ...(params.cluster?.whyImportant ?? []),
    ...params.evidence.flatMap((item) => [
      item.title,
      item.bodyPreview,
      ...(item.whyImportant ?? []),
      ...(item.matchedRules ?? []),
    ]),
  ]);
  const phraseStrength = coreTopicPhrases.reduce(
    (total, phrase) => total + (text.includes(phrase) ? 1 : 0),
    0,
  );
  const tokenStrength = coreTopicTokenPattern.test(text) ? 2 : 0;
  const broadAiStrength = broadAiTopicPattern.test(text) ? 1 : 0;

  return Math.min(4, phraseStrength + tokenStrength + broadAiStrength);
};

const isCoreTopicStrength = (value: number): boolean => value >= 2;

const isBroadOnlyTopicStrength = (value: number): boolean => value <= 1;

const normalizeTopicText = (values: readonly (string | undefined)[]): string =>
  ` ${values
    .filter((value): value is string => value !== undefined)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/gu, " ")} `;

const coreTopicPhrases = [
  "claude code",
  "model context protocol",
  "large language model",
  "ai agent",
  "ai agents",
  "coding agent",
  "coding agents",
  "developer tool",
  "developer tools",
  "open source",
  "prompt engineering",
  "typescript 7",
] as const;

const coreTopicTokenPattern =
  /\b(?:agentic|agents?|anthropic|chatgpt|claude|codex|cursor|developer|fable|github|gpt|llm|mcp|openai|programming|prompts?|repository|typescript|workflows?)\b/u;

const broadAiTopicPattern = /\b(?:ai|artificial intelligence)\b/u;
