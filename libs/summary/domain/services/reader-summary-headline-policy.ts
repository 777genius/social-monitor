import type { SourceMixEntry } from "../entities/source-mix-entry";
import type { TopRead } from "../entities/top-read";
import {
  firstSentence,
  readerSummaryHeadline,
  uniqueNonEmpty,
} from "../value-objects/summary-text";

export const groundedReaderHeadline = (params: {
  readonly headline: string;
  readonly sourceMix: readonly SourceMixEntry[];
  readonly topReads: readonly TopRead[];
}): string => {
  const fallback = readerSummaryHeadline(params.headline);

  if (params.topReads.length === 0) {
    return fallback;
  }

  const lead = params.topReads[0]!;
  const hasGroundedLead =
    lead.confirmedProviderKeys.length > 1 || lead.confidence.level === "high";
  const explicitlySourceFramed = isExplicitlySourceFramedText(fallback, lead);
  const safeSemanticHeadline =
    !isTechnicalReaderHeadline(fallback) &&
    !isVagueDailyWrapHeadline(fallback) &&
    (explicitlySourceFramed ||
      (hasGroundedLead && !isUnverifiedLegalTopRead(lead)));

  if (safeSemanticHeadline) {
    return fallback;
  }

  const providerNames = uniqueNonEmpty(
    params.sourceMix.length === 0
      ? params.topReads.map((item) => item.providerName)
      : params.sourceMix.map((source) =>
          providerNameForSource(source.providerKey, params.topReads),
        ),
  );
  const providerSummary =
    providerNames.length === 0
      ? "monitored sources"
      : providerNames.length === 1
        ? (providerNames[0] ?? "monitored sources")
        : `${providerNames.slice(0, 3).join(", ")}${
            providerNames.length > 3 ? ` +${providerNames.length - 3}` : ""
          }`;
  return readerSummaryHeadline(
    buildHumanReaderHeadline(params.topReads) ?? `${providerSummary} summary`,
  );
};

const providerNameForSource = (
  providerKey: string,
  topReads: readonly TopRead[],
): string =>
  topReads.find((item) => item.providerKey === providerKey)?.providerName ??
  providerKey;

export const isTechnicalReaderHeadline = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.length === 0 ||
    normalized.startsWith("key signals across") ||
    normalized.startsWith("strongest reads across") ||
    normalized.startsWith("strongest read across") ||
    normalized.startsWith("summary:") ||
    normalized.startsWith("source watch") ||
    normalized.includes("source watch across") ||
    normalized.includes("cited top read") ||
    [
      "review ",
      "check ",
      "read ",
      "use ",
      "treat ",
      "inspect ",
      "start with ",
    ].some((prefix) => normalized.startsWith(prefix))
  );
};

const isVagueDailyWrapHeadline = (value: string): boolean => {
  const normalized = value.trim().toLocaleLowerCase("en-US");

  return (
    /\b(?:tops?|leads?|dominates?) (?:a|the) day of\b.*\b(?:chatter|debate|discussion|signals?)\b/u.test(
      normalized,
    ) ||
    /\b(?:chatter|debate|discussion|signals?)\b.*\b(?:tops?|leads?|dominates?) the day\b/u.test(
      normalized,
    )
  );
};

export const isExplicitlySourceFramedText = (
  value: string,
  lead: TopRead,
): boolean => {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  const provider = lead.providerName.trim().toLocaleLowerCase("en-US");
  const providerPrefixes = [
    provider,
    `a ${provider}`,
    `an ${provider}`,
    `the ${provider}`,
  ];

  return (
    (provider.length > 0 &&
      providerPrefixes.some((prefix) => normalized.startsWith(prefix))) ||
    /^(?:a |an |the )?(?:post|discussion|thread|reports?)\b/iu.test(normalized)
  );
};

const buildHumanReaderHeadline = (
  topReads: readonly TopRead[],
): string | undefined => {
  const lead = topReads[0];
  if (lead === undefined) {
    return undefined;
  }
  if (
    lead.confirmedProviderKeys.length <= 1 &&
    lead.confidence.level === "low"
  ) {
    const cautiousReason = [lead.reason, ...lead.whyImportant].find((value) =>
      /\b(?:allegation|needs? confirmation|not (?:independently )?confirmed|should not be treated as confirmation|uncertain|unverified)\b/iu.test(
        value,
      ),
    );

    return compactHeadlinePart(
      cautiousReason ?? `${lead.providerName} discussion needs confirmation`,
    );
  }

  const leadTitle = lead.title.trim();
  if (leadTitle.length === 0) {
    return undefined;
  }
  if (isUnverifiedLegalTopRead(lead)) {
    return compactHeadlinePart(sourceFramedLegalTitle(leadTitle));
  }

  return compactHeadlinePart(leadTitle);
};

const isUnverifiedLegalTopRead = (lead: TopRead): boolean => {
  const supportingText = [
    lead.reason,
    ...lead.whyImportant,
    lead.confidence.rationale,
  ].join(" ");
  const hasEligibleFirstPartySupport = /\bfirst-party\b/iu.test(
    lead.confidence.rationale,
  );

  return (
    !hasEligibleFirstPartySupport &&
    /\b(?:lawsuit|legal action|sues?|sued|suing|trade[ -]secret)\b/iu.test(
      lead.title,
    ) &&
    /\b(?:alleged|allegation|filings? (?:are |were )?(?:not|unavailable)|merits? (?:are |remain |were )?(?:unknown|unverified)|not (?:independently )?confirmed|unverified)\b/iu.test(
      supportingText,
    )
  );
};

const sourceFramedLegalTitle = (title: string): string => {
  const reportedAction = title.match(/^(.*?)\s+(?:sues?|sued|suing)\s+(.+)$/iu);
  if (reportedAction !== null) {
    const reportedObject = reportedAction[2]
      ?.trim()
      .replace(/\s*,\s*(?:says?|according to)\b.*$/iu, "")
      .replace(/\s*,?\s+(?:alleging|alleges?)\s+/iu, " over alleged ");

    return `Reports say ${reportedAction[1]?.trim()} sued ${reportedObject}`;
  }

  return `Reports discuss the ${title.replace(/^the\s+/iu, "")}`;
};

const compactHeadlinePart = (value: string): string => {
  const sentence = firstSentence(value) ?? value;
  const compact = stripTrailingPeriod(sentence.replace(/\s+/gu, " "));
  const maxLength = 82;

  if (compact.length <= maxLength) {
    return compact;
  }

  const shortened = compact
    .slice(0, maxLength)
    .replace(/\s+\S*$/u, "")
    .trim();

  return shortened.length === 0
    ? compact.slice(0, maxLength).trim()
    : shortened;
};

const stripTrailingPeriod = (value: string): string => {
  const trimmed = value.trim();

  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
};
