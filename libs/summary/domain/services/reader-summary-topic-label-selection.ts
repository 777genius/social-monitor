import type { ReaderSummaryTopicLabelCandidateOption } from "./reader-summary-topic-label-candidates";
import {
  evaluateTopicLabelQuality,
  meaningfulTopicLabelTokens,
} from "./reader-summary-topic-map-label-quality";
import { compactOptional, humanizeSlug } from "./reader-summary-topic-map-text";

export const selectReaderSummaryTopicLabel = (params: {
  readonly proposedLabel?: string;
  readonly preferProposedLabel?: boolean;
  readonly labelCandidates: readonly ReaderSummaryTopicLabelCandidateOption[];
  readonly evidenceTexts: readonly string[];
  readonly providerLabels: readonly string[];
}): string => {
  const bestCandidate = params.labelCandidates[0];
  const proposed = compactOptional(params.proposedLabel);
  if (proposed === undefined) {
    return bestCandidate?.label ?? "Other topic";
  }
  const candidateLabels = params.labelCandidates.map(
    (candidate) => candidate.label,
  );
  const quality = evaluateTopicLabelQuality(proposed, {
    evidenceTexts: params.evidenceTexts,
    providerLabels: params.providerLabels,
    candidateLabels,
  });
  if (!quality.accepted) {
    return bestCandidate?.label ?? "Other topic";
  }
  if (params.preferProposedLabel === true) {
    return quality.label;
  }
  if (bestCandidate === undefined) {
    return quality.label;
  }
  const singletonToken = quality.meaningfulTokens[0];
  const bestCandidateLabel = readerFacingCandidateExtension(
    bestCandidate.label,
    singletonToken,
    quality.label,
  );
  const bestQuality = evaluateTopicLabelQuality(bestCandidateLabel, {
    evidenceTexts: params.evidenceTexts,
    providerLabels: params.providerLabels,
    candidateLabels,
  });
  const richerGroundedExtension =
    quality.meaningfulTokens.length === 1 &&
    bestQuality.meaningfulTokens.length >= 2 &&
    singletonToken !== undefined &&
    bestQuality.meaningfulTokens.includes(singletonToken);
  const broadSingleton =
    quality.meaningfulTokens.length <= 1 &&
    bestQuality.meaningfulTokens.length >= 2 &&
    singletonToken !== undefined &&
    broadTopicFamilyTokens.has(singletonToken);

  return broadSingleton || richerGroundedExtension
    ? bestCandidateLabel
    : quality.label;
};

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

const readerFacingCandidateExtension = (
  candidateLabel: string,
  singletonToken: string | undefined,
  singletonLabel: string,
): string => {
  if (singletonToken === undefined) {
    return candidateLabel;
  }

  return candidateLabel.replace(
    /\b[\p{Letter}\p{Number}_.-]+\/([\p{Letter}\p{Number}_.-]+)\b/gu,
    (path, project: string) =>
      project.toLocaleLowerCase("en-US") === singletonToken
        ? singletonLabel
        : path,
  );
};
