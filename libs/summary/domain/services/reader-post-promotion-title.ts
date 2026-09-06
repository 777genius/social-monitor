import { readerSummaryProviderIdentity } from "../value-objects/reader-summary-provider-identity";
import type { SummaryEvidenceItem } from
  "../value-objects/summary-evidence-item";
import {
  isLowInformationReaderTitle,
  isTechnicalReaderTitle,
} from "../policies/reader-summary-reader-facing-text-policy";

/** Presentation availability, not content admission or concise-title styling. */
export const isUsableReaderSourceText = (value: string): boolean => {
  const text = value.trim().replace(/^X post by @[^:]+:\s*/iu, "");
  return text.replace(/https?:\/\/\S+/giu, "").trim().length > 0 &&
    !isLowInformationReaderTitle(text) && !isTechnicalReaderTitle(text) &&
    text.toLowerCase() !== "cited story" &&
    text.toLowerCase() !== "selected evidence";
};

/**
 * Evidence is already safety-processed and bound to the lead by the promotion
 * snapshot. Never fetch raw text, borrow support, or interpret ranking reasons
 * as source content. The producer's existing input cap bounds this text.
 * Neither sourceText nor bodyPreview certifies a complete provider publication.
 */
export const readerPostAvailableSourceText = (
  lead: SummaryEvidenceItem,
): string | undefined => {
  const body = lead.sourceText?.trim()
    ? lead.sourceText
    : lead.bodyPreview?.trim() ? lead.bodyPreview : undefined;
  const title = lead.title.trim().replace(/^X post by @[^:]+:\s*/iu, "");
  if (body === undefined || body.length === 0) {
    return isUsableReaderSourceText(title) ? title : undefined;
  }
  // A filler body is not permission to fall back to a detached title.
  if (!isUsableReaderSourceText(body)) return undefined;
  const prefix = title.replace(/(?:\.{3,}|…)\s*$/u, "").trim();
  // Prefix comparison only avoids repeating a source preview; it never selects
  // a sentence or removes bytes from the available body. A separate title may
  // itself qualify the body, so retain it too, in source order.
  return prefix.length === 0 || body.trimStart().startsWith(prefix)
    ? body
    : `${title}\n\n${body}`;
};

export const buildReaderPostPromotionTitle = (params: {
  readonly lead: SummaryEvidenceItem;
  readonly admitted?: readonly SummaryEvidenceItem[];
  readonly promotionReasons?: readonly string[];
}): string => readerPostAvailableSourceText(params.lead) ?? "";

export const hasReaderFacingPromotionSource = (
  item: SummaryEvidenceItem,
): boolean => readerPostAvailableSourceText(item) !== undefined;

// Compatibility for existing callers; this no longer imposes a brevity gate.
export const hasReaderFacingPromotionTitle = hasReaderFacingPromotionSource;

/** Long source presentation is allowed only for the same displayed lead. */
export const isFaithfulReaderSourcePresentation = (
  read: { readonly title: string; readonly canonicalUrl?: string; readonly providerKey: string },
  evidence: readonly SummaryEvidenceItem[],
): boolean => evidence.some((item) =>
  item.canonicalUrl === read.canonicalUrl && readerSummaryProviderIdentity(item).providerKey === read.providerKey &&
  readerPostAvailableSourceText(item) === read.title,
);
