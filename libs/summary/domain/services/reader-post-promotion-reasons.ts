import { redactSensitiveText } from "@social-monitor/shared-kernel";
import type { TopReadCandidate } from "../entities/top-read";
import type { SelectedReaderPostPromotion } from "../policies/reader-post-promotion-selection";
import {
  isFallbackReaderReason,
  isReaderTitleReasonDuplicate,
  mentionsUnsupportedReaderProvider,
} from "../policies/reader-summary-reader-facing-text-policy";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { compactUnique } from "../value-objects/summary-text";
import { isSourceCoverageFramingText } from "./reader-summary-top-read-title";

export const buildReaderPostPromotionReasons = (params: {
  readonly selected: SelectedReaderPostPromotion;
  readonly lead: SummaryEvidenceItem;
  readonly stories: readonly TopReadCandidate[];
}): readonly string[] => {
  const { selected, lead } = params;
  // Model prose may describe only this lead and its admitted support. Retain
  // the complete summary, including qualifications; never salvage a claim by
  // dropping its out-of-scope citation or clipping its limiting sentence.
  const story = readerPostPromotionModelStory(params);
  const reasons = compactUnique([
    story?.summary,
    ...lead.whyImportant.filter((text) => isUsableModelSummary(params, text)),
  ]).slice(0, 4);
  return reasons.length > 0
    ? reasons
    : [
        `Selected with ${selected.citationIds.length} cited source${selected.citationIds.length === 1 ? "" : "s"} in this summary window.`,
      ];
};

// The compact `summary` display field is capped for readability; the
// long-form `whyImportant` reasons must retain the complete qualified model
// description (see the note above `buildReaderPostPromotionReasons`).
const COMPACT_SUMMARY_MAX_LENGTH = 300;

export const readerPostPromotionModelSummary = (params: {
  readonly selected: SelectedReaderPostPromotion;
  readonly lead: SummaryEvidenceItem;
  readonly stories: readonly TopReadCandidate[];
}): string | undefined =>
  readerPostPromotionModelStory(params, COMPACT_SUMMARY_MAX_LENGTH)?.summary;

const readerPostPromotionModelStory = (
  params: {
    readonly selected: SelectedReaderPostPromotion;
    readonly lead: SummaryEvidenceItem;
    readonly stories: readonly TopReadCandidate[];
  },
  maxSummaryLength?: number,
): TopReadCandidate | undefined => {
  const { selected } = params;
  return params.stories.find(
    (candidate) =>
      candidate.readerReasonProvenance?.kind === "model" &&
      candidate.readerReasonProvenance.originalStoryClusterId ===
        selected.candidate.clusterId &&
      candidate.readerReasonProvenance.originalCitationIds.includes(
        selected.candidate.citationId,
      ) &&
      candidate.readerReasonProvenance.originalCitationIds.every((id) =>
        selected.citationIds.includes(id),
      ) &&
      candidate.readerReasonProvenance.originalSummary === candidate.summary &&
      candidate.storyClusterId === selected.candidate.clusterId &&
      candidate.summary.trim().length >= 40 &&
      (maxSummaryLength === undefined ||
        candidate.summary.trim().length <= maxSummaryLength) &&
      !isReaderTitleReasonDuplicate(candidate.title, candidate.summary) &&
      isUsableModelSummary(params, candidate.summary),
  );
};

const isUsableModelSummary = (
  params: {
    readonly selected: SelectedReaderPostPromotion;
    readonly lead: SummaryEvidenceItem;
  },
  text: string,
): boolean => {
  const providers = [
    params.lead.providerKey,
    ...params.selected.support.map((item) => item.provider),
  ];
  return (
    text.trim().length > 0 &&
    !/authoritative promotion snapshot|promotion snapshot candidate/iu.test(
      text,
    ) &&
    !/\[.*REDACTED.*\]/u.test(text) &&
    redactSensitiveText(text) === text &&
    !isFallbackReaderReason(text) &&
    !isSourceCoverageFramingText(text.trim().toLowerCase()) &&
    !isReaderTitleReasonDuplicate(params.lead.title, text) &&
    !mentionsUnsupportedReaderProvider(text, providers)
  );
};
