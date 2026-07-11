import type { StoryPrimaryClaimFacet } from "./story-topic-tokenizer";

export const readerSummaryTopicClaimTypes = [
  "availability",
  "benchmark",
  "education",
  "efficiency",
  "limits",
  "release",
  "security",
  "other",
] as const;

export type ReaderSummaryTopicClaimType =
  (typeof readerSummaryTopicClaimTypes)[number];

export type ReaderSummaryTopicSemanticLabel = {
  readonly subject: string;
  readonly claimType: ReaderSummaryTopicClaimType;
  readonly qualifier?: string;
  readonly confidenceScore: number;
};

export const READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN = 0.55;

type ClaimLabelRule = {
  readonly marker: RegExp;
  readonly suffix: string;
};

const claimLabelRules: Readonly<
  Record<StoryPrimaryClaimFacet, ClaimLabelRule>
> = {
  availability: {
    marker: /\b(?:availability|available|access)\b/iu,
    suffix: "Availability",
  },
  benchmark: {
    marker: /\b(?:benchmark|evaluation|eval|exam|index|score)\b/iu,
    suffix: "Benchmark",
  },
  education: {
    marker: /\b(?:course|guide|masterclass|tutorial|workshop)\b/iu,
    suffix: "Guide",
  },
  efficiency: {
    marker: /\b(?:efficiency|efficient|economics|cost|pricing)\b/iu,
    suffix: "Efficiency",
  },
  limits: {
    marker: /\b(?:limit|limits|quota|quotas|credits)\b/iu,
    suffix: "Limits",
  },
  release: {
    marker: /\b(?:launch|release|rollout)\b/iu,
    suffix: "Rollout",
  },
  security: {
    marker:
      /\b(?:attack|malware|privacy|scam|security|spying|threat|vulnerability)\b/iu,
    suffix: "Security",
  },
};

export const renderReaderSummaryTopicSemanticLabel = (
  semantic: ReaderSummaryTopicSemanticLabel,
): string => {
  const subject = normalizeSemanticPart(semantic.subject);
  const qualifier = normalizeSemanticPart(semantic.qualifier);
  if (subject.length === 0) {
    return qualifier;
  }
  if (semantic.claimType === "other") {
    return appendDistinctPart(subject, qualifier);
  }
  const rule = claimLabelRules[semantic.claimType];
  if (rule.marker.test(subject)) {
    return subject;
  }
  if (qualifier.length > 0 && rule.marker.test(qualifier)) {
    return appendDistinctPart(subject, qualifier);
  }
  const qualified = appendDistinctPart(subject, qualifier);
  const withQualifier = `${qualified} ${rule.suffix}`;

  return topicLabelWordCount(withQualifier) <= 4
    ? withQualifier
    : `${subject} ${rule.suffix}`;
};

export const ensureTopicLabelExpressesClaimFacet = (
  label: string,
  facet: StoryPrimaryClaimFacet | undefined,
): string => {
  if (facet === undefined) {
    return label;
  }
  const rule = claimLabelRules[facet];
  const alreadyExpressesClaim = Object.values(claimLabelRules).some(
    (candidate) => candidate.marker.test(label),
  );

  return alreadyExpressesClaim ? label : `${label} ${rule.suffix}`;
};

const normalizeSemanticPart = (value: string | undefined): string =>
  value?.replace(/\s+/gu, " ").trim() ?? "";

const appendDistinctPart = (subject: string, qualifier: string): string => {
  if (qualifier.length === 0) {
    return subject;
  }
  const normalizedSubject = subject.toLocaleLowerCase("en-US");
  const normalizedQualifier = qualifier.toLocaleLowerCase("en-US");

  return normalizedSubject.includes(normalizedQualifier)
    ? subject
    : `${subject} ${qualifier}`;
};

const topicLabelWordCount = (value: string): number =>
  value.split(/\s+/u).filter(Boolean).length;
