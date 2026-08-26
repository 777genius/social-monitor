import type { StoryRankingPolicy } from "../policies/story-ranking-policy";
import { readerSummaryIndependentProviderFamily } from
  "../value-objects/reader-summary-provider-identity";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  canonicalStoryKeysConflict,
  storyClaimFacetsAreCompatible,
} from "./story-cluster-membership";
import { storyKey } from "./story-key-normalizer";
import {
  hasNegation,
  isSpeculativeTitle,
  sharedExactTokens,
  speculativeQuestionClearedByBody,
  storyEventSignature,
} from "./story-event-signature";

export type StoryRelationHardNegativeReason =
  | "canonical_identity_conflict"
  | "claim_facet_conflict"
  | "content_origin_not_primary"
  | "contradictory_detail"
  | "event_object_mismatch"
  | "facet_mismatch"
  | "negation_or_polarity"
  | "same_author_relaxation"
  | "same_provider_family"
  | "speculative_modality";

export const storyRelationHardNegative = (params: {
  readonly left: SummaryEvidenceItem;
  readonly right: SummaryEvidenceItem;
  readonly policy: StoryRankingPolicy;
}): StoryRelationHardNegativeReason | undefined => {
  const { left, right } = params;
  const leftFamily = readerSummaryIndependentProviderFamily(left);
  const rightFamily = readerSummaryIndependentProviderFamily(right);
  if (leftFamily === rightFamily) return "same_provider_family";
  if (sameNonBlank(left.authorHandle, right.authorHandle)) {
    return "same_author_relaxation";
  }
  if (isNonPrimaryOrigin(left) || isNonPrimaryOrigin(right)) {
    return "content_origin_not_primary";
  }
  const leftKey = storyKey(left, params.policy);
  const rightKey = storyKey(right, params.policy);
  if (leftKey !== rightKey && canonicalStoryKeysConflict(leftKey, rightKey)) {
    return "canonical_identity_conflict";
  }
  if (!storyClaimFacetsAreCompatible(left, right, params.policy)) {
    return "claim_facet_conflict";
  }
  const leftText = `${left.title} ${left.bodyPreview ?? ""} ${left.sourceText ?? ""}`;
  const rightText = `${right.title} ${right.bodyPreview ?? ""} ${right.sourceText ?? ""}`;
  if (claimHasNegation(left) || claimHasNegation(right)) {
    return "negation_or_polarity";
  }
  if (!speculativePairCleared(left, right)) return "speculative_modality";
  if (!sameFacetSet(relationFacets(leftText), relationFacets(rightText))) {
    return "facet_mismatch";
  }
  if (contradictoryDetails(leftText, rightText)) {
    return "contradictory_detail";
  }
  const leftSignature = storyEventSignature(left.title);
  const rightSignature = storyEventSignature(right.title);
  if (leftSignature !== undefined && rightSignature !== undefined) {
    const events = sharedExactTokens(
      leftSignature.eventPredicates,
      rightSignature.eventPredicates,
    );
    const anchors = sharedExactTokens(
      leftSignature.strongAnchors,
      rightSignature.strongAnchors,
    );
    if (events.length === 0 || anchors.length < 2 ||
        exclusiveAnchorsConflict(leftSignature.strongAnchors,
          rightSignature.strongAnchors)) {
      return "event_object_mismatch";
    }
  }
  return undefined;
};

const exclusiveAnchorsConflict = (
  left: readonly string[],
  right: readonly string[],
): boolean => {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return left.some((anchor) => !rightSet.has(anchor)) &&
    right.some((anchor) => !leftSet.has(anchor));
};

const speculativePairCleared = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): boolean => {
  if (!isSpeculativeTitle(left.title) && !isSpeculativeTitle(right.title)) return true;
  const leftSignature = storyEventSignature(left.title);
  const rightSignature = storyEventSignature(right.title);
  if (leftSignature === undefined || rightSignature === undefined) return false;
  const predicate = sharedExactTokens(leftSignature.eventPredicates,
    rightSignature.eventPredicates)[0];
  const actor = sharedExactTokens(leftSignature.strongAnchors,
    rightSignature.strongAnchors)[0];
  const object = sharedExactTokens(leftSignature.titleTokens,
    rightSignature.titleTokens).find((token) => token !== predicate && token !== actor);
  return predicate !== undefined && actor !== undefined && object !== undefined &&
    speculativeQuestionClearedByBody(left, leftSignature, actor, object, predicate) &&
    speculativeQuestionClearedByBody(right, rightSignature, actor, object, predicate);
};

const claimHasNegation = (item: SummaryEvidenceItem): boolean => {
  if (hasNegation(item.title)) return true;
  const titleSignature = storyEventSignature(item.title);
  if (titleSignature === undefined) return false;
  return [item.bodyPreview, item.sourceText]
    .filter((value): value is string => value !== undefined)
    .flatMap((value) => value.split(/(?<=[.!])\s+|\n+/u))
    .some((sentence) => {
      if (!hasNegation(sentence)) return false;
      const signature = storyEventSignature(sentence);
      return signature !== undefined && sharedExactTokens(
        signature.eventPredicates, titleSignature.eventPredicates).length > 0 &&
        sharedExactTokens(signature.strongAnchors,
          titleSignature.strongAnchors).length >= 2;
    });
};

const isNonPrimaryOrigin = (item: SummaryEvidenceItem): boolean =>
  item.promotionFacts?.contentKind === "comment" ||
  item.promotionFacts?.contentKind === "reply" ||
  item.promotionFacts?.contentKind === "quote";

const relationFacets = (value: string): readonly string[] => {
  const definitions = [
    ["availability", /\b(?:access|available|availability|waitlist)\b/iu],
    ["benchmark", /\b(?:benchmark|eval|scorecard)\b/iu],
    ["comparison", /\b(?:compare|comparison|versus|vs\.?)\b/iu],
    ["pricing", /\b(?:cost|price|pricing|subscription)\b/iu],
    ["reaction", /\b(?:opinion|reacts?|reaction|response)\b/iu],
    ["review", /\b(?:hands-on|impressions?|review)\b/iu],
    ["security", /\b(?:breach|exploit|security|vulnerabilit\w*)\b/iu],
    ["tutorial", /\b(?:guide|how\s+to|tutorial|walkthrough)\b/iu],
  ] as const;
  return definitions.flatMap(([facet, pattern]) => pattern.test(value) ? [facet] : []);
};

const contradictoryDetails = (left: string, right: string): boolean =>
  detailSetsConflict(versionTokens(left), versionTokens(right)) ||
  detailSetsConflict(dateTokens(left), dateTokens(right)) ||
  detailSetsConflict(locationTokens(left), locationTokens(right)) ||
  outcomeConflict(left, right);

const versionTokens = (value: string): readonly string[] =>
  [...value.matchAll(/\b(?:v(?:ersion)?\s*)?\d+(?:\.\d+)+(?:[-\w]+)?\b/giu)]
    .map((match) => match[0].toLocaleLowerCase("en-US").replace(/\s+/gu, ""));

const dateTokens = (value: string): readonly string[] =>
  [...value.matchAll(/\b(?:20\d{2}(?:-\d{2}-\d{2})?|january|february|march|april|may|june|july|august|september|october|november|december)\b/giu)]
    .map((match) => match[0].toLocaleLowerCase("en-US"));

const locationTokens = (value: string): readonly string[] =>
  [...value.matchAll(/\b(?:in|across)\s+(us|usa|uk|eu|europe|china|india|canada|japan|global(?:ly)?)\b/giu)]
    .flatMap((match) => match[1]?.toLocaleLowerCase("en-US") ?? []);

const outcomeConflict = (left: string, right: string): boolean => {
  const positive = /\b(?:approved|confirmed|completed|succeeded|won)\b/iu;
  const negative = /\b(?:cancelled|canceled|denied|failed|lost|rejected)\b/iu;
  return (positive.test(left) && negative.test(right)) ||
    (negative.test(left) && positive.test(right));
};

const detailSetsConflict = (
  left: readonly string[],
  right: readonly string[],
): boolean => left.length > 0 && right.length > 0 &&
  sharedExactTokens(left, right).length === 0;

const sameFacetSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value) => right.includes(value));

const sameNonBlank = (left: string | undefined, right: string | undefined): boolean => {
  const normalizedLeft = left?.trim().toLocaleLowerCase("en-US");
  const normalizedRight = right?.trim().toLocaleLowerCase("en-US");
  return normalizedLeft !== undefined && normalizedLeft !== "" &&
    normalizedLeft === normalizedRight;
};
