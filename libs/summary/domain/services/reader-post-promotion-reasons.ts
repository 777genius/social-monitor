import { redactSensitiveText } from "@social-monitor/shared-kernel";
import type { TopReadCandidate } from "../entities/top-read";
import type { SelectedReaderPostPromotion } from
  "../policies/reader-post-promotion-selection";
import {
  isFallbackReaderReason,
  isReaderTitleReasonDuplicate,
  mentionsUnsupportedReaderProvider,
} from "../policies/reader-summary-reader-facing-text-policy";
import type { SummaryEvidenceItem } from
  "../value-objects/summary-evidence-item";
import { compactUnique } from "../value-objects/summary-text";
import { isSourceCoverageFramingText } from "./reader-summary-top-read-title";

export const buildReaderPostPromotionReasons = (params: {
  readonly selected: SelectedReaderPostPromotion;
  readonly lead: SummaryEvidenceItem;
  readonly stories: readonly TopReadCandidate[];
}): readonly string[] => {
  const { selected, lead } = params;
  const providers = [lead.providerKey, ...selected.support.map((item) => item.provider)];
  const usable = (text: string): boolean =>
    text.trim().length > 0 &&
    !/authoritative promotion snapshot|promotion snapshot candidate/iu.test(text) &&
    !/\[.*REDACTED.*\]/u.test(text) &&
    redactSensitiveText(text) === text &&
    !isFallbackReaderReason(text) &&
    !isSourceCoverageFramingText(text.trim().toLowerCase()) &&
    !isReaderTitleReasonDuplicate(lead.title, text) &&
    !mentionsUnsupportedReaderProvider(text, providers);
  // Model prose may describe only this lead and its admitted support. Retain
  // the complete summary, including qualifications; never salvage a claim by
  // dropping its out-of-scope citation or clipping its limiting sentence.
  const story = params.stories.find((candidate) =>
    candidate.storyClusterId === selected.candidate.clusterId &&
    candidate.citationIds.includes(selected.candidate.citationId) &&
    candidate.citationIds.every((id) => selected.citationIds.includes(id)) &&
    candidate.summary.trim().length >= 40 &&
    !isReaderTitleReasonDuplicate(candidate.title, candidate.summary) &&
    usable(candidate.summary));
  const reasons = compactUnique([
    story?.summary,
    ...lead.whyImportant.filter(usable),
  ]).slice(0, 4);
  return reasons.length > 0 ? reasons : [
    `Selected with ${selected.citationIds.length} cited source${selected.citationIds.length === 1 ? "" : "s"} in this summary window.`,
  ];
};
