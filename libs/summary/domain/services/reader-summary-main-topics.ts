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
const minimumNarrativeTopics = 3;

type TopicPattern = {
  readonly pattern: RegExp;
  readonly label: string | ((match: RegExpExecArray) => string);
};

const knownTopicPatterns: readonly TopicPattern[] = [
  { pattern: /\bchatgpt\s+work\b/iu, label: "ChatGPT Work" },
  {
    pattern: /\bgpt[-\s]?(\d+(?:\.\d+)*)\b/iu,
    label: (match) => `GPT-${match[1]}`,
  },
  { pattern: /\bfable\s*5\b/iu, label: "Fable 5" },
  { pattern: /\bclaude\s+code\b/iu, label: "Claude Code" },
  { pattern: /\bclaude\b/iu, label: "Claude" },
  { pattern: /\bcursor\b/iu, label: "Cursor" },
  { pattern: /\bcodex\b/iu, label: "Codex" },
  {
    pattern: /\bprompt\s+(?:extraction|injection)\b/iu,
    label: "prompt extraction",
  },
  { pattern: /\bmcp\b/iu, label: "MCP" },
  { pattern: /\bopenai\b/iu, label: "OpenAI" },
  { pattern: /\bgemini\b/iu, label: "Gemini" },
  { pattern: /\bllm(?:s)?\b/iu, label: "LLMs" },
  {
    pattern: /\bai\s+coding\s+agents?\b/iu,
    label: "AI coding agents",
  },
  { pattern: /\bai[-\s]+agents?\b/iu, label: "AI agents" },
  { pattern: /\bai\s+trust\b/iu, label: "AI trust" },
  {
    pattern: /\bbetter\s+models?.*\bworse\s+tools?\b/iu,
    label: "AI tool quality",
  },
  { pattern: /\bopenwiki\b/iu, label: "OpenWiki" },
  { pattern: /\brepo[-\s]?context\b/iu, label: "repo context" },
  { pattern: /\busage[-\s]?limits?\b/iu, label: "usage limits" },
  {
    pattern: /\bopen[-\s]?(?:weight|model)s?\b/iu,
    label: "open models",
  },
  { pattern: /\btypescript\b/iu, label: "TypeScript" },
  { pattern: /\bpython\b/iu, label: "Python" },
  { pattern: /\brust\b/iu, label: "Rust" },
  { pattern: /\bjavascript\b/iu, label: "JavaScript" },
  { pattern: /\bcybersecurity\b/iu, label: "cybersecurity" },
];

const genericLeadInPatterns: readonly RegExp[] = [
  /^(?:a|an|the)\s+reported\s+(?:issue|claim|risk)\b/iu,
  /^(?:a|an|the)\s+github\s+(?:issue|thread|discussion)\b/iu,
  /^(?:hn|hacker\s+news|rss|reddit|x|twitter)(?:\s+and\s+(?:hn|hacker\s+news|rss|reddit|x|twitter))*\s+(?:both|items?|posts?|threads?)\b/iu,
  /^(?:reddit|hn|hacker\s+news|x|twitter|rss)\s+(?:adds|claims|discusses|reports|says|shows|describes|pushes)\b/iu,
  /^(?:users|developers|people|posts|threads)\s+(?:discuss|debate|report|say|show|ask|want)\b/iu,
];

export const buildReaderSummaryMainTopics = (params: {
  readonly headline?: string;
  readonly executiveSummary?: string;
  readonly topReads: readonly TopRead[];
  readonly topStories: readonly TopReadCandidate[];
  readonly interestHighlights: readonly InterestHighlight[];
  readonly repeatedSignals: readonly RepeatedSignal[];
  readonly selectedEvidence?: readonly SummaryEvidenceItem[];
}): readonly string[] => {
  const narrativeTopics = removeShadowedTopics(
    compactUnique([
      ...topicsFromText(params.headline ?? ""),
      ...topicsFromText(params.executiveSummary ?? ""),
    ]),
  );
  const supportingCandidates = [
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
  const topics =
    narrativeTopics.length >= minimumNarrativeTopics
      ? narrativeTopics
      : removeShadowedTopics(
          compactUnique([...narrativeTopics, ...supportingCandidates]),
        );

  return topics.slice(0, maxMainTopics);
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

const topicsFromText = (value: string): readonly string[] => {
  const cleaned = cleanTopicText(value);
  if (cleaned.length === 0 || looksLikeRawId(cleaned)) {
    return [];
  }

  return knownTopicPatterns
    .map(({ pattern, label }, priority) => {
      const match = pattern.exec(cleaned);
      if (match === null) {
        return undefined;
      }
      return {
        index: match.index,
        priority,
        label: typeof label === "string" ? label : label(match),
      };
    })
    .filter(
      (
        match,
      ): match is {
        readonly index: number;
        readonly priority: number;
        readonly label: string;
      } => match !== undefined,
    )
    .sort(
      (left, right) =>
        left.index - right.index || left.priority - right.priority,
    )
    .map((match) => match.label);
};

const topicFromText = (value: string): string | undefined => {
  const cleaned = cleanTopicText(value);
  if (cleaned.length === 0 || looksLikeRawId(cleaned)) {
    return undefined;
  }

  for (const { pattern, label } of knownTopicPatterns) {
    const match = pattern.exec(cleaned);
    if (match !== null) {
      return typeof label === "string" ? label : label(match);
    }
  }

  return undefined;
};

const cleanTopicText = (value: string): string =>
  value
    .replace(/^x\s+post\s+by\s+@[^:]+:\s*/iu, "")
    .replace(/^issue:\s*/iu, "")
    .replace(/^summary:\s*/iu, "")
    .trim();

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
