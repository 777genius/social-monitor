import { readerSummaryHeadlinesEquivalent } from "../value-objects/reader-summary-headline-equivalence";
import type { SourceMixEntry } from "../entities/source-mix-entry";
import type { TopRead } from "../entities/top-read";
import {
  readerSummaryHeadline,
  uniqueNonEmpty,
} from "../value-objects/summary-text";

export const groundedReaderHeadline = (params: {
  readonly headline: string;
  readonly sourceMix: readonly SourceMixEntry[];
  readonly sourceTitles?: readonly string[];
  readonly topReads: readonly TopRead[];
  readonly narrativeLeadTitle?: string;
  readonly thematicSynthesisSupport?: {
    readonly clusterCount: number;
    readonly providerCount: number;
  };
}): string => {
  // Keep a copied model headline visible to the publication rejection gate.
  // A neutral fallback must not launder a source heading into valid synthesis.
  if (params.sourceTitles?.some((title) =>
    readerSummaryHeadlinesEquivalent(title, params.headline),
  )) return params.headline;

  const fallback = readerSummaryHeadline(params.headline);

  if (params.topReads.length === 0) {
    return fallback;
  }

  const lead = params.topReads[0]!;
  const hasGroundedLead =
    lead.confirmedProviderKeys.length > 1 || lead.confidence.level === "high";
  const explicitlySourceFramed = isExplicitlySourceFramedText(fallback, lead);
  const safelySupportedThematicSynthesis =
    (params.thematicSynthesisSupport?.clusterCount ?? 0) >= 2 &&
    (params.thematicSynthesisSupport?.providerCount ?? 0) >= 2;
  // A headline that restates the top-ranked read while the lead narrative
  // covers another story is off-lead: source framing must not bless it.
  const copiesOffLeadTopReadTitle =
    (params.narrativeLeadTitle?.trim().length ?? 0) > 0 &&
    normalizedContains(fallback, lead.title);
  const safeSemanticHeadline =
    !isTechnicalReaderHeadline(fallback) &&
    !isVagueDailyWrapHeadline(fallback) &&
    !copiesOffLeadTopReadTitle &&
    (safelySupportedThematicSynthesis ||
      explicitlySourceFramed ||
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
    buildHumanReaderHeadline(params.topReads, params.narrativeLeadTitle) ??
      `${providerSummary} summary`,
  );
};

export const groundedTopReadTitle = (
  topRead: Pick<TopRead, "title" | "reason" | "whyImportant" | "confidence">,
): string =>
  isUnverifiedLegalTopRead(topRead)
    ? `Source report: ${topRead.title}`
    : topRead.title;

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

const normalizedContains = (haystack: string, needle: string): boolean => {
  const normalize = (value: string): string =>
    value
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/gu, " ");
  const normalizedNeedle = normalize(needle);
  return (
    normalizedNeedle.length > 0 && normalize(haystack).includes(normalizedNeedle)
  );
};

const buildHumanReaderHeadline = (
  topReads: readonly TopRead[],
  narrativeLeadTitle?: string,
): string | undefined => {
  // The headline sits above the lead narrative, so its fallback frame must
  // describe that narrative's story instead of the top-ranked card.
  const narrativeTitle = narrativeLeadTitle?.trim();
  if (narrativeTitle !== undefined && narrativeTitle.length > 0) {
    return humanReaderLeadHeadline(narrativeTitle, { title: narrativeTitle });
  }
  const lead = topReads[0];
  if (lead === undefined) return undefined;
  return humanReaderLeadHeadline(lead.title, lead);
};

const humanReaderLeadHeadline = (
  title: string,
  legalGuard: Parameters<typeof isUnverifiedLegalTopRead>[0],
): string => {
  // Only reuse a complete short heading. Never extract a sentence or a prefix
  // from available source context, or discard an unverified legal qualification.
  if (title.length > 118 || /[\r\n]|[.!?。！？]\s+\S/u.test(title) ||
      isUnverifiedLegalTopRead(legalGuard)) {
    return "Discussion from monitored sources";
  }
  // Source framing or corroboration does not make a copied heading synthesis.
  // Keep the complete short title in the report frame, just as for other leads.
  return `Reports discuss ${title}`;
};

export const isUnverifiedLegalTopRead = (lead: {
  readonly title: string;
  readonly reason?: string;
  readonly whyImportant?: readonly string[];
  readonly confidence?: {
    readonly level?: string;
    readonly rationale?: string;
  };
}): boolean => {
  const supportingText = [
    lead.title,
    lead.reason ?? "",
    ...(lead.whyImportant ?? []),
    lead.confidence?.rationale ?? "",
  ].join(" ");
  const hasEligibleFirstPartySupport =
    /\b(?:eligible first-party source|first-party official source)\b/iu.test(
      lead.confidence?.rationale ?? "",
    );

  return (
    !hasEligibleFirstPartySupport &&
    /\b(?:lawsuit|legal action|sues?|sued|suing|trade[ -]secret)\b/iu.test(
      lead.title,
    ) &&
    /\b(?:alleged|allegations?|no (?:primary )?(?:court )?filing|(?:evidence|reports?) (?:does|do) not include (?:a )?(?:primary )?(?:court )?filing|filings? (?:is |are |was |were |remain )?(?:not available|unavailable|missing)|merits? (?:are |remain |were )?(?:unknown|unverified)|not (?:independently )?(?:confirmed|verified)|could not be (?:independently )?(?:confirmed|verified)|unverified)\b/iu.test(
      supportingText,
    )
  );
};
