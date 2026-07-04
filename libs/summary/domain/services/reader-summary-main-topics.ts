import type {
  InterestHighlight,
  RepeatedSignal,
  TopRead,
  TopReadCandidate,
} from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { compactUnique, interestTitle } from "../value-objects/summary-text";

const maxMainTopics = 6;
const maxTopicWords = 4;
const maxTopicLength = 34;

const knownTopicPatterns: readonly [RegExp, string][] = [
  [/\bfable\s*5\b/iu, "Fable 5"],
  [/\bclaude\s+code\b/iu, "Claude Code"],
  [/\bclaude\b/iu, "Claude"],
  [/\bcursor\b/iu, "Cursor"],
  [/\bcodex\b/iu, "Codex"],
  [/\bprompt\s+(?:extraction|injection)\b/iu, "prompt extraction"],
  [/\bmcp\b/iu, "MCP"],
  [/\bopenai\b/iu, "OpenAI"],
  [/\bgemini\b/iu, "Gemini"],
  [/\bllm(?:s)?\b/iu, "LLMs"],
  [/\bai\s+coding\s+agents?\b/iu, "AI coding agents"],
  [/\bai\s+agents?\b/iu, "AI agents"],
  [/\bai\s+trust\b/iu, "AI trust"],
  [/\bbetter\s+models?.*\bworse\s+tools?\b/iu, "AI tool quality"],
  [/\bopenwiki\b/iu, "OpenWiki"],
  [/\brepo[-\s]?context\b/iu, "repo context"],
  [/\busage[-\s]?limits?\b/iu, "usage limits"],
  [/\bopen[-\s]?(?:weight|model)s?\b/iu, "open models"],
  [/\btypescript\b/iu, "TypeScript"],
  [/\bpython\b/iu, "Python"],
  [/\brust\b/iu, "Rust"],
  [/\bjavascript\b/iu, "JavaScript"],
  [/\bcybersecurity\b/iu, "cybersecurity"],
];

const genericLeadInPatterns: readonly RegExp[] = [
  /^(?:a|an|the)\s+reported\s+(?:issue|claim|risk)\b/iu,
  /^(?:a|an|the)\s+github\s+(?:issue|thread|discussion)\b/iu,
  /^(?:hn|hacker\s+news|rss|reddit|x|twitter)(?:\s+and\s+(?:hn|hacker\s+news|rss|reddit|x|twitter))*\s+(?:both|items?|posts?|threads?)\b/iu,
  /^(?:reddit|hn|hacker\s+news|x|twitter|rss)\s+(?:adds|claims|discusses|reports|says|shows|describes|pushes)\b/iu,
  /^(?:users|developers|people|posts|threads)\s+(?:discuss|debate|report|say|show|ask|want)\b/iu,
];

export const buildReaderSummaryMainTopics = (params: {
  readonly topReads: readonly TopRead[];
  readonly topStories: readonly TopReadCandidate[];
  readonly interestHighlights: readonly InterestHighlight[];
  readonly repeatedSignals: readonly RepeatedSignal[];
  readonly selectedEvidence?: readonly SummaryEvidenceItem[];
}): readonly string[] => {
  const candidates = [
    ...params.topReads.flatMap((read) => [
      ...read.matchedInterestIds.map(topicFromInterestId),
      topicFromText(read.title),
      ...read.whyImportant.map(topicFromText),
    ]),
    ...params.topStories.flatMap((story) => [
      topicFromText(story.title),
      ...story.interestIds.map(topicFromInterestId),
    ]),
    ...params.interestHighlights.map((highlight) =>
      topicFromText(highlight.title),
    ),
    ...params.repeatedSignals.map((signal) => topicFromText(signal.title)),
    ...(params.selectedEvidence ?? []).flatMap((item) => [
      topicFromText(item.title),
      ...(item.matchedRules ?? []).map(topicFromRule),
    ]),
  ];

  return removeShadowedTopics(compactUnique(candidates)).slice(
    0,
    maxMainTopics,
  );
};

const topicFromRule = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("interest:")) {
    return undefined;
  }

  return topicFromInterestId(trimmed.slice("interest:".length));
};

const topicFromInterestId = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || looksLikeRawId(trimmed)) {
    return undefined;
  }

  return compactTopic(interestTitle(trimmed));
};

const topicFromText = (value: string): string | undefined => {
  const cleaned = value
    .replace(/^x\s+post\s+by\s+@[^:]+:\s*/iu, "")
    .replace(/^issue:\s*/iu, "")
    .replace(/^summary:\s*/iu, "")
    .trim();
  if (cleaned.length === 0 || looksLikeRawId(cleaned)) {
    return undefined;
  }

  for (const [pattern, label] of knownTopicPatterns) {
    if (pattern.test(cleaned)) {
      return label;
    }
  }

  return undefined;
};

const compactTopic = (value: string): string | undefined => {
  const firstClause = value
    .split(
      /\s(?:as|with|while|about|around|through|from|into|over|after)\s|[:;,()[\]{}|/]+/iu,
    )[0]
    ?.trim();
  if (firstClause === undefined || firstClause.length === 0) {
    return undefined;
  }

  const words = firstClause
    .replace(/[^\p{L}\p{N}+#.-]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length > 0)
    .slice(0, maxTopicWords);
  const label = words.join(" ").trim();
  if (label.length === 0 || label.length > maxTopicLength) {
    return undefined;
  }
  if (genericLeadInPatterns.some((pattern) => pattern.test(label))) {
    return undefined;
  }
  if (/\bmay\s+be$/iu.test(label)) {
    return undefined;
  }
  if (/^\d+\s+(?:top|selected|multi-source|cross-source)/iu.test(label)) {
    return undefined;
  }

  return label;
};

const looksLikeRawId = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
    value.replaceAll(" ", "-"),
  );

const removeShadowedTopics = (topics: readonly string[]): readonly string[] => {
  const normalized = new Set(
    topics.map((topic) => topic.toLocaleLowerCase("en-US")),
  );

  return topics.filter(
    (topic) =>
      !(
        topic.toLocaleLowerCase("en-US") === "claude" &&
        normalized.has("claude code")
      ),
  );
};
