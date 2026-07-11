import type { StoryPrimaryClaimFacet } from "./story-topic-tokenizer";

export const readerSummaryTopicClaimTypes = [
  "allegation",
  "availability",
  "benchmark",
  "comparison",
  "costs",
  "education",
  "efficiency",
  "limits",
  "release",
  "review",
  "security",
  "other",
] as const;

export type ReaderSummaryTopicClaimType =
  (typeof readerSummaryTopicClaimTypes)[number];

export type ReaderSummaryTopicSemanticLabel = {
  readonly subject: string;
  readonly parentSubject?: string;
  readonly claimType: ReaderSummaryTopicClaimType;
  readonly qualifier?: string;
  readonly confidenceScore: number;
};

export const READER_SUMMARY_TOPIC_SEMANTIC_CONFIDENCE_MIN = 0.55;

type ClaimLabelRule = {
  readonly marker: RegExp;
  readonly suffix: string;
  readonly canonicalizeQualifierMarker?: boolean;
};

const claimLabelRules: Readonly<
  Record<Exclude<ReaderSummaryTopicClaimType, "other">, ClaimLabelRule>
> = {
  allegation: {
    marker: /\b(?:allegation|allegations|alleged|accusation|accusations)\b/iu,
    suffix: "Allegation",
  },
  availability: {
    marker: /\b(?:availability|available|access)\b/iu,
    suffix: "Availability",
  },
  benchmark: {
    marker: /\b(?:benchmark|evaluation|eval|exam|index|score)\b/iu,
    suffix: "Benchmark",
    canonicalizeQualifierMarker: true,
  },
  comparison: {
    marker: /\b(?:compare|compared|comparison|versus|vs)\b/iu,
    suffix: "Comparison",
    canonicalizeQualifierMarker: true,
  },
  costs: {
    marker: /\b(?:bill|bills|budget|cost|costs|pricing|spend|spending)\b/iu,
    suffix: "Costs",
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
  review: {
    marker: /\b(?:hands[\s-]?on|impression|review|reviewed|reviews)\b/iu,
    suffix: "Review",
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
  const subject = sanitizeClaimSubject(
    semantic.claimType,
    normalizeSemanticPart(semantic.subject),
  );
  const qualifier = sanitizeClaimQualifier(
    semantic.claimType,
    normalizeSemanticPart(semantic.qualifier),
  );
  if (subject.length === 0) {
    return qualifier;
  }
  if (semantic.claimType === "other") {
    return appendDistinctPart(subject, durableOtherQualifier(qualifier));
  }
  const rule = claimLabelRules[semantic.claimType];
  if (rule.marker.test(subject)) {
    return subject;
  }
  if (qualifier.length > 0 && rule.marker.test(qualifier)) {
    if (rule.canonicalizeQualifierMarker === true) {
      return appendCanonicalClaimSuffix(
        subject,
        normalizeSemanticPart(qualifier.replace(rule.marker, " ")),
        rule.suffix,
      );
    }
    return appendDistinctPart(subject, qualifier);
  }
  return appendCanonicalClaimSuffix(subject, qualifier, rule.suffix);
};

export const ensureTopicLabelExpressesClaimFacet = (
  label: string,
  facet: StoryPrimaryClaimFacet | undefined,
): string => {
  if (facet === undefined) {
    return label;
  }
  const sanitizedLabel = sanitizeLabelForClaimFacet(label, facet);
  const rule = claimLabelRules[facet];
  const alreadyExpressesClaim = Object.values(claimLabelRules).some(
    (candidate) => candidate.marker.test(sanitizedLabel),
  );

  return alreadyExpressesClaim
    ? sanitizedLabel
    : `${sanitizedLabel} ${rule.suffix}`;
};

export const topicLabelExpressesClaimType = (
  label: string,
  claimType: ReaderSummaryTopicClaimType,
): boolean =>
  claimType === "other" || claimLabelRules[claimType].marker.test(label);

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

const appendCanonicalClaimSuffix = (
  subject: string,
  qualifier: string,
  suffix: string,
): string => {
  const qualified = appendDistinctPart(subject, qualifier);
  const withQualifier = `${qualified} ${suffix}`;

  return topicLabelWordCount(withQualifier) <= 4
    ? withQualifier
    : `${subject} ${suffix}`;
};

const durableOtherQualifier = (qualifier: string): string => {
  if (
    /[0-9+#./-]/u.test(qualifier) ||
    /\b[A-Z]{2,8}\b/u.test(qualifier) ||
    /\b[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/u.test(qualifier) ||
    /(?:s|tion|sion|ment|ness|ity|ism|ist|er|or)$/iu.test(qualifier) ||
    /^(?:[A-Z][\p{Letter}\p{Number}+#./-]+)(?:\s+[A-Z][\p{Letter}\p{Number}+#./-]+)+$/u.test(
      qualifier,
    )
  ) {
    return qualifier;
  }

  return "";
};

const sanitizeClaimQualifier = (
  claimType: ReaderSummaryTopicClaimType,
  qualifier: string,
): string => {
  if (
    (claimType === "comparison" || claimType === "release") &&
    descriptiveParticipleQualifier.test(qualifier) &&
    durableOtherQualifier(qualifier).length === 0
  ) {
    return "";
  }
  if (
    claimType === "limits" &&
    /\b(?:daily|hour|hours|monthly|week|weekly)\b/iu.test(qualifier)
  ) {
    return "";
  }

  return qualifier;
};

const sanitizeClaimSubject = (
  claimType: ReaderSummaryTopicClaimType,
  subject: string,
): string => {
  if (claimType !== "limits") {
    return subject;
  }
  const withoutTemporalCadence = normalizeSemanticPart(
    subject.replace(
      /\b(?:\d+[\s-]?)?(?:daily|hour|hours|monthly|week|weekly)\b/giu,
      " ",
    ),
  );

  return withoutTemporalCadence.length > 0 ? withoutTemporalCadence : subject;
};

const descriptiveParticipleQualifier = /^\p{Letter}{3,}(?:ed|ing)$/iu;

const sanitizeLabelForClaimFacet = (
  label: string,
  facet: StoryPrimaryClaimFacet,
): string => {
  if (facet !== "limits") {
    return label;
  }

  return normalizeSemanticPart(
    label.replace(
      /\b(?:\d+[\s-]?)?(?:daily|hour|hours|monthly|week|weekly)\b/giu,
      " ",
    ),
  );
};

const topicLabelWordCount = (value: string): number =>
  value.split(/\s+/u).filter(Boolean).length;
