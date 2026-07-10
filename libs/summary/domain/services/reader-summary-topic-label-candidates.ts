import type { TopReadCandidate } from "../entities/top-read";
import { READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID } from "../entities/reader-summary-topic-map";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { compactUnique } from "../value-objects/summary-text";
import type { ReaderSummaryTopicNodeLabel } from "./reader-summary-topic-label-plan";
import {
  evaluateTopicLabelQuality,
  isWeakTopicId,
  meaningfulTopicLabelTokens,
} from "./reader-summary-topic-map-label-quality";
import {
  compactId,
  compactLabel,
  compactOptional,
  formatReaderSummaryTopicToken,
  humanizeSlug,
  normalizeTopicLabel,
} from "./reader-summary-topic-map-text";
import { storyTopicAnchorTokens } from "./story-topic-tokenizer";

export type ReaderSummaryTopicLabelCandidateSource =
  | "top-story-title"
  | "top-story-summary"
  | "evidence-title"
  | "evidence-body"
  | "keyword-phrase"
  | "fallback-label"
  | "story-key";

export type ReaderSummaryTopicLabelCandidateOption = {
  readonly label: string;
  readonly source: ReaderSummaryTopicLabelCandidateSource;
  readonly score: number;
  readonly evidenceFeedItemIds: readonly string[];
  readonly rationale: string;
};

export type ReaderSummaryTopicLabelEvidenceContext = {
  readonly story?: TopReadCandidate;
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly fallbackKeywords: readonly string[];
  readonly fallbackLabel?: string;
  readonly cluster?: StoryCluster;
};

export const extractReaderSummaryTopicLabelCandidates = (
  context: ReaderSummaryTopicLabelEvidenceContext,
): readonly ReaderSummaryTopicLabelCandidateOption[] => {
  const evidenceTexts = readerSummaryTopicLabelEvidenceTexts(context);
  const providerLabels = context.evidence.map(
    (item) => item.providerName ?? humanizeSlug(item.providerKey),
  );
  const candidates = [
    ...textCandidates({
      value: context.story?.title,
      source: "top-story-title",
      evidenceFeedItemIds: context.evidence.map((item) => item.feedItemId),
      baseScore: 0.92,
      rationale: "Derived from the top story title.",
    }),
    ...textCandidates({
      value: context.story?.summary,
      source: "top-story-summary",
      evidenceFeedItemIds: context.evidence.map((item) => item.feedItemId),
      baseScore: 0.78,
      rationale: "Derived from the top story summary.",
    }),
    ...context.evidence.flatMap((item) => [
      ...textCandidates({
        value: item.title,
        source: "evidence-title",
        evidenceFeedItemIds: [item.feedItemId],
        baseScore: 0.86,
        rationale: "Derived from an evidence title.",
      }),
      ...textCandidates({
        value: item.bodyPreview,
        source: "evidence-body",
        evidenceFeedItemIds: [item.feedItemId],
        baseScore: 0.66,
        rationale: "Derived from evidence body preview.",
      }),
    ]),
    ...keywordCandidates(context.fallbackKeywords, context.evidence),
    ...textCandidates({
      value: context.fallbackLabel,
      source: "fallback-label",
      evidenceFeedItemIds: context.evidence.map((item) => item.feedItemId),
      baseScore: 0.6,
      rationale: "Derived from deterministic fallback label.",
    }),
  ];
  const byLabel = new Map<string, ReaderSummaryTopicLabelCandidateOption>();

  for (const candidate of candidates) {
    const quality = evaluateTopicLabelQuality(candidate.label, {
      evidenceTexts,
      providerLabels,
    });
    if (!quality.accepted) {
      continue;
    }
    const label = quality.label;
    const key = normalizeTopicLabel(label);
    const scored = {
      ...candidate,
      label,
      score: roundCandidateScore(candidate.score + quality.score * 0.16),
    };
    const existing = byLabel.get(key);
    if (existing === undefined || scored.score > existing.score) {
      byLabel.set(key, scored);
    }
  }

  return [...byLabel.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        topicLabelSpecificity(right.label) - topicLabelSpecificity(left.label),
    )
    .slice(0, 8);
};

const topicLabelSpecificity = (label: string): number =>
  /[0-9]/u.test(label) ? 1 : 0;

export const readerSummaryTopicLabelEvidenceTexts = (
  context: ReaderSummaryTopicLabelEvidenceContext,
): readonly string[] =>
  compactUnique([
    readerFacingTopicEvidenceText(context.story?.title),
    context.story?.summary,
    ...context.evidence.flatMap((item) => [
      readerFacingTopicEvidenceText(item.title),
      item.bodyPreview,
      ...item.whyImportant,
    ]),
    context.fallbackLabel,
    ...context.fallbackKeywords.map(humanizeSlug),
  ]);

const readerFacingTopicEvidenceText = (
  value: string | undefined,
): string | undefined =>
  value
    ?.replace(/^x\s+post\s+by\s+@[^:]+:\s*/iu, "")
    .replace(/^(?:ask|show)\s+hn:\s*/iu, "");

export const selectReaderSummaryTopicLabel = (params: {
  readonly proposedLabel?: string;
  readonly labelCandidates: readonly ReaderSummaryTopicLabelCandidateOption[];
  readonly evidenceTexts: readonly string[];
  readonly providerLabels: readonly string[];
}): string => {
  const bestCandidate = params.labelCandidates[0];
  const proposed = compactOptional(params.proposedLabel);
  if (proposed === undefined) {
    return bestCandidate?.label ?? "Other topic";
  }

  const quality = evaluateTopicLabelQuality(proposed, {
    evidenceTexts: params.evidenceTexts,
    providerLabels: params.providerLabels,
    candidateLabels: params.labelCandidates.map((candidate) => candidate.label),
  });
  if (!quality.accepted) {
    return bestCandidate?.label ?? "Other topic";
  }
  if (bestCandidate === undefined) {
    return quality.label;
  }
  const bestQuality = evaluateTopicLabelQuality(bestCandidate.label, {
    evidenceTexts: params.evidenceTexts,
    providerLabels: params.providerLabels,
    candidateLabels: params.labelCandidates.map((candidate) => candidate.label),
  });
  const broadSingletonToken = quality.meaningfulTokens[0];
  const broadSingleton =
    quality.meaningfulTokens.length <= 1 &&
    bestQuality.meaningfulTokens.length >= 2 &&
    broadSingletonToken !== undefined &&
    broadTopicFamilyTokens.has(broadSingletonToken);

  const concreteSingleton =
    quality.meaningfulTokens.length === 1 &&
    broadSingletonToken !== undefined &&
    concreteSingletonTopicTokens.has(broadSingletonToken);

  if (
    !broadSingleton &&
    (quality.meaningfulTokens.length >= 2 || concreteSingleton)
  ) {
    return quality.label;
  }

  return bestCandidate.label;
};

export const isGroundedTopicGroupLabel = (params: {
  readonly groupLabel: string;
  readonly evidenceTexts: readonly string[];
  readonly providerLabels: readonly string[];
}): boolean =>
  evaluateTopicLabelQuality(params.groupLabel, {
    evidenceTexts: params.evidenceTexts,
    providerLabels: params.providerLabels,
  }).accepted;

export const topicIdIsTooBroadForLabel = (params: {
  readonly topicId: string;
  readonly selectedLabel: string;
}): boolean => {
  const [, rawValue = params.topicId] = params.topicId.split(":");
  const topicTokens = meaningfulTopicLabelTokens(humanizeSlug(rawValue));
  const labelTokens = meaningfulTopicLabelTokens(params.selectedLabel);

  return (
    topicTokens.length <= 1 &&
    labelTokens.length >= 3 &&
    topicTokens[0] !== undefined &&
    broadTopicFamilyTokens.has(topicTokens[0])
  );
};

const broadTopicFamilyTokens = new Set([
  "anthropic",
  "claude",
  "github",
  "google",
  "meta",
  "microsoft",
  "openai",
]);

const concreteSingletonTopicTokens = new Set([
  "chatgpt",
  "codex",
  "cursor",
  "fable",
  "gemini",
  "grok",
  "mcp",
  "palantir",
]);

export const groundReaderSummaryTopicNodeLabel = (params: {
  readonly nodeLabel?: ReaderSummaryTopicNodeLabel;
  readonly selectedLabel: string;
  readonly evidenceTexts: readonly string[];
  readonly providerLabels: readonly string[];
  readonly candidateLabels: readonly string[];
}): ReaderSummaryTopicNodeLabel | undefined => {
  const nodeLabel = params.nodeLabel;
  if (nodeLabel === undefined) {
    return undefined;
  }
  const topicId = groundedTopicId({
    topicId: nodeLabel.topicId,
    selectedLabel: params.selectedLabel,
    evidenceTexts: params.evidenceTexts,
    providerLabels: params.providerLabels,
    candidateLabels: params.candidateLabels,
  });
  const groupId = groundedGroupId({
    groupId: nodeLabel.groupId,
    evidenceTexts: params.evidenceTexts,
    providerLabels: params.providerLabels,
    candidateLabels: params.candidateLabels,
  });
  const keywords = (nodeLabel.keywords ?? [])
    .filter(
      (keyword) =>
        evaluateTopicLabelQuality(keyword, {
          evidenceTexts: params.evidenceTexts,
          providerLabels: params.providerLabels,
          candidateLabels: params.candidateLabels,
        }).accepted,
    )
    .slice(0, 8);
  if (topicId === undefined && groupId === undefined && keywords.length === 0) {
    return undefined;
  }

  return {
    ...nodeLabel,
    label: params.selectedLabel,
    topicId,
    groupId,
    keywords,
  };
};

const textCandidates = (params: {
  readonly value: string | undefined;
  readonly source: ReaderSummaryTopicLabelCandidateSource;
  readonly evidenceFeedItemIds: readonly string[];
  readonly baseScore: number;
  readonly rationale: string;
}): readonly ReaderSummaryTopicLabelCandidateOption[] => {
  const value = compactOptional(params.value);
  if (value === undefined) {
    return [];
  }

  return phraseCandidates(value).map((label, index) => ({
    label,
    source: params.source,
    score: roundCandidateScore(params.baseScore - index * 0.04),
    evidenceFeedItemIds: params.evidenceFeedItemIds,
    rationale: params.rationale,
  }));
};

const keywordCandidates = (
  keywords: readonly string[],
  evidence: readonly SummaryEvidenceItem[],
): readonly ReaderSummaryTopicLabelCandidateOption[] => {
  const allAnchors = storyTopicAnchorTokens(keywords);
  const anchors = rankAnchorsByEvidenceProminence(allAnchors, evidence).slice(
    0,
    4,
  );
  const anchorSet = new Set(allAnchors);
  const subjectKeywords = keywords.filter((keyword) => !anchorSet.has(keyword));
  const evidencePhrases = compactUnique(
    evidence.flatMap((item) => phraseCandidates(item.title).slice(0, 1)),
  ).slice(0, 2);
  const scoredLabels = [
    ...anchors.slice(0, 2).flatMap((anchor, anchorIndex) =>
      evidencePhrases.flatMap((phrase) => {
        const label = prefixPhraseWithAnchor(anchor, phrase);

        return label === phrase
          ? []
          : [{ label, score: 0.96 - anchorIndex * 0.02 }];
      }),
    ),
    ...anchors.map((anchor) => ({
      label: topicPhraseFromTokens(
        [anchor, ...subjectKeywords].map(humanizeSlug),
        2,
      ),
      score: 0.94,
    })),
    ...anchors.map((anchor) => ({
      label: topicPhraseFromTokens([humanizeSlug(anchor)]),
      score: 0.8,
    })),
    {
      label: topicPhraseFromTokens(keywords.map(humanizeSlug)),
      score: 0.78,
    },
    {
      label: topicPhraseFromTokens(keywords.map(humanizeSlug), 2),
      score: 0.76,
    },
  ];
  const byLabel = new Map<string, { readonly label: string; score: number }>();
  for (const item of scoredLabels) {
    const label = compactLabel(item.label);
    const key = normalizeTopicLabel(label);
    if (key.length === 0) {
      continue;
    }
    const current = byLabel.get(key);
    if (current === undefined || current.score < item.score) {
      byLabel.set(key, { label, score: item.score });
    }
  }

  return [...byLabel.values()].map(({ label, score }) => ({
    label,
    source: "keyword-phrase",
    score,
    evidenceFeedItemIds: evidence.map((item) => item.feedItemId),
    rationale: "Derived from shared topic keywords.",
  }));
};

const rankAnchorsByEvidenceProminence = (
  anchors: readonly string[],
  evidence: readonly SummaryEvidenceItem[],
): readonly string[] =>
  anchors
    .map((anchor, index) => ({
      anchor,
      index,
      position: anchorEvidencePosition(anchor, evidence),
      specificity: anchorSpecificity(anchor),
    }))
    .sort(
      (left, right) =>
        left.position - right.position ||
        right.specificity - left.specificity ||
        left.index - right.index,
    )
    .map((item) => item.anchor);

const anchorEvidencePosition = (
  anchor: string,
  evidence: readonly SummaryEvidenceItem[],
): number => {
  const needle = normalizeTopicLabel(humanizeSlug(anchor));
  let best = Number.MAX_SAFE_INTEGER;
  for (const item of evidence) {
    const titlePosition = normalizeTopicLabel(item.title).indexOf(needle);
    if (titlePosition >= 0) {
      best = Math.min(best, titlePosition);
    }
    const bodyPosition = normalizeTopicLabel(item.bodyPreview ?? "").indexOf(
      needle,
    );
    if (bodyPosition >= 0) {
      best = Math.min(best, 10_000 + bodyPosition);
    }
  }

  return best;
};

const anchorSpecificity = (anchor: string): number =>
  (/[0-9]/u.test(anchor) ? 10 : 0) +
  meaningfulTopicLabelTokens(humanizeSlug(anchor)).length;

const prefixPhraseWithAnchor = (anchor: string, phrase: string): string => {
  const displayAnchor = formatReaderSummaryTopicToken(humanizeSlug(anchor));
  const anchorTokens = new Set(meaningfulTopicLabelTokens(displayAnchor));
  const phraseTokens = new Set(meaningfulTopicLabelTokens(phrase));
  if ([...anchorTokens].every((token) => phraseTokens.has(token))) {
    return phrase;
  }

  return compactLabel(`${displayAnchor} ${phrase}`);
};

const phraseCandidates = (value: string): readonly string[] => {
  const clean = value
    .replace(/^summary:\s*/iu, "")
    .replace(/^x\s+post\s+by\s+@[^:]+:\s*/iu, "")
    .replace(/^(?:ask|show)\s+hn:\s*/iu, "")
    .replace(/[(){}[\]"'`]+/gu, " ")
    .replace(/[:;,.!?]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const tokens = clean.split(/\s+/u);
  const compactPhrase = compactLabel(clean);
  const firstPhrase = topicPhraseFromTokens(tokens, 5);
  const shortPhrase = topicPhraseFromTokens(tokens, 3);
  const tightPhrase = topicPhraseFromTokens(tokens, 2);

  return compactUnique([shortPhrase, tightPhrase, firstPhrase, compactPhrase])
    .map(compactLabel)
    .filter((label) => meaningfulTopicLabelTokens(label).length > 0)
    .slice(0, 2);
};

const topicPhraseFromTokens = (
  tokens: readonly string[],
  maxTokens = 5,
): string => {
  const seen = new Set<string>();
  const meaningful = tokens
    .map((token) =>
      token.replace(
        /^[^\p{Letter}\p{Number}+#./-]+|[^\p{Letter}\p{Number}+#./-]+$/gu,
        "",
      ),
    )
    .filter((token) => token.length > 0)
    .filter((token) => !isDurationToken(token))
    .filter((token) => meaningfulTopicLabelTokens(token).length > 0)
    .filter((token) => {
      const normalized = normalizeTopicLabel(token);
      if (normalized.length === 0 || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);

      return true;
    })
    .slice(0, maxTokens)
    .map(formatReaderSummaryTopicToken);

  return compactLabel(meaningful.join(" "));
};

const roundCandidateScore = (value: number): number =>
  Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;

const isDurationToken = (value: string): boolean =>
  /^\d+(?:[- ]?(?:min|minute|minutes|hour|hours|day|days|week|weeks))?$/iu.test(
    value,
  );

const topicLabelFromIdValue = (value: string): string =>
  humanizeSlug(value)
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .map(formatReaderSummaryTopicToken)
    .join(" ");

const groundedTopicId = (params: {
  readonly topicId: string | undefined;
  readonly selectedLabel: string;
  readonly evidenceTexts: readonly string[];
  readonly providerLabels: readonly string[];
  readonly candidateLabels: readonly string[];
}): string | undefined => {
  const topicId = compactId(params.topicId);
  if (
    topicId === undefined ||
    topicIdIsTooBroadForLabel({
      topicId,
      selectedLabel: params.selectedLabel,
    })
  ) {
    return undefined;
  }
  const [, rawValue = topicId] = topicId.split(":");
  const result = evaluateTopicLabelQuality(topicLabelFromIdValue(rawValue), {
    evidenceTexts: params.evidenceTexts,
    providerLabels: params.providerLabels,
    candidateLabels: params.candidateLabels,
  });

  return result.accepted ? topicId : undefined;
};

const groundedGroupId = (params: {
  readonly groupId: string | undefined;
  readonly evidenceTexts: readonly string[];
  readonly providerLabels: readonly string[];
  readonly candidateLabels: readonly string[];
}): string | undefined => {
  const groupId = compactId(params.groupId);
  if (groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID) {
    return groupId;
  }
  if (
    groupId === undefined ||
    !groupId.startsWith("group:") ||
    isWeakTopicId(groupId)
  ) {
    return undefined;
  }
  const [, rawValue = groupId] = groupId.split(":");
  const result = evaluateTopicLabelQuality(topicLabelFromIdValue(rawValue), {
    providerLabels: params.providerLabels,
  });

  return result.accepted ? groupId : undefined;
};
