import type { ReaderAction } from "../entities/reader-action";
import type { SourceMixEntry } from "../entities/source-mix-entry";
import type { TopRead, TopReadConfidence } from "../entities/top-read";
import { isFallbackReaderReason } from "../policies/reader-summary-reader-facing-text-policy";
import type { ProviderMetric } from "../value-objects/provider-metric-label";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import {
  clampConfidenceScore,
  normalizeSignalScore,
} from "../value-objects/signal-score";
import {
  compactUnique,
  firstSentence,
  nonEmpty,
  plural,
  interestTitle,
  uniqueNonEmpty,
} from "../value-objects/summary-text";

export { plural } from "../value-objects/summary-text";

export { normalizeSignalScore };

export const readerItemConfidence = (params: {
  readonly cluster: StoryCluster | undefined;
  readonly independentEvidenceCount: number;
  readonly confirmedProviderCount: number;
  readonly signalScore: number;
  readonly firstPartyOfficial?: boolean;
}): TopReadConfidence => {
  const breakdown = params.cluster?.signalBreakdown;
  const crossProviderSupport = breakdown?.crossProviderSupport ?? 0;
  const providerDiversityBoost = breakdown?.providerDiversityBoost ?? 0;
  const sameProviderSupport = breakdown?.sameProviderSupport ?? 0;
  const evidenceSupport = params.independentEvidenceCount > 1 ? 0.08 : 0;
  const firstPartySupport = params.firstPartyOfficial === true ? 0.12 : 0;
  const normalizedSignal = Math.min(params.signalScore / 4, 0.42);
  const crossProviderFallbackSupport =
    params.cluster === undefined && params.confirmedProviderCount > 1
      ? 0.16
      : 0;
  const confirmationSupport =
    params.confirmedProviderCount > 1
      ? Math.max(
          Math.min(crossProviderSupport + providerDiversityBoost, 0.38),
          crossProviderFallbackSupport,
        )
      : Math.min(sameProviderSupport, 0.12);
  const rawScore = clampConfidenceScore(
    0.18 +
      normalizedSignal +
      confirmationSupport +
      evidenceSupport +
      firstPartySupport,
  );
  const strongCrossProviderAuthority =
    params.firstPartyOfficial === true || params.confirmedProviderCount >= 3;
  const score =
    params.confirmedProviderCount > 1
      ? params.cluster === undefined
        ? Math.min(rawScore, 0.68)
        : strongCrossProviderAuthority
          ? rawScore
          : Math.min(rawScore, 0.68)
      : Math.min(
          rawScore,
          params.firstPartyOfficial === true
            ? 0.62
            : params.independentEvidenceCount > 1
              ? 0.55
              : 0.42,
        );
  const level =
    score >= 0.72 && params.confirmedProviderCount > 1
      ? "high"
      : score >= 0.5
        ? "medium"
        : "low";
  const rationale =
    params.confirmedProviderCount > 1
      ? params.cluster === undefined
        ? `${params.confirmedProviderCount} cited source groups support this story, but the key claim has not been fully cross-verified yet.`
        : strongCrossProviderAuthority
          ? `${params.confirmedProviderCount} monitored source groups support this story${params.firstPartyOfficial === true ? ", including an eligible first-party source" : ""}.`
          : `${params.confirmedProviderCount} monitored source groups surface this story, but repetition across platforms does not independently verify every claim.`
      : params.firstPartyOfficial === true
        ? "This is a first-party official source for the announcement; product performance and comparative claims remain source-reported until independently verified."
        : params.independentEvidenceCount > 1
          ? `${params.independentEvidenceCount} independent cited items support this story, but they are not cross-provider confirmation.`
          : "This story has not been independently confirmed across monitored source groups yet.";

  return {
    level,
    score: Number(score.toFixed(2)),
    rationale,
  };
};

export const groundedReaderHeadline = (params: {
  readonly headline: string;
  readonly sourceMix: readonly SourceMixEntry[];
  readonly topReads: readonly TopRead[];
}): string => {
  const fallback = nonEmpty(params.headline, "Workspace summary");

  if (params.topReads.length === 0) {
    return fallback;
  }

  const lead = params.topReads[0]!;
  const hasGroundedLead =
    lead.confirmedProviderKeys.length > 1 || lead.confidence.level === "high";
  const safeSemanticHeadline =
    !isTechnicalReaderHeadline(fallback) &&
    (hasGroundedLead || isExplicitlySourceFramedText(fallback, lead));

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
  return (
    buildHumanReaderHeadline(params.topReads) ?? `${providerSummary} summary`
  );
};

export const buildGroundedOneLineTakeaway = (params: {
  readonly executiveSummary: string;
  readonly topReads: readonly TopRead[];
  readonly sourceMix: readonly SourceMixEntry[];
}): string => {
  const executiveSummary = params.executiveSummary.trim();
  const fallback =
    firstSentence(executiveSummary) ??
    params.topReads[0]?.reason ??
    "Review the latest monitored signals.";
  const lead = params.topReads[0];
  const hasGroundedSupport =
    lead !== undefined &&
    (lead.confirmedProviderKeys.length > 1 || lead.confidence.level === "high");

  if (
    params.topReads.length === 0 ||
    (!isTechnicalReaderHeadline(fallback) &&
      (hasGroundedSupport ||
        (lead !== undefined &&
          isExplicitlySourceFramedText(executiveSummary, lead))))
  ) {
    return compactExecutiveSummary(executiveSummary) || fallback;
  }

  const topReadCount = params.topReads.length;
  const leadReads = params.topReads
    .slice(0, 3)
    .map(sourceLocalReadLabel)
    .filter((label) => label.length > 0);
  const summaryLead =
    leadReads.length === 0
      ? `${topReadCount} monitored read${plural(topReadCount)} need${topReadCount === 1 ? "s" : ""} confirmation.`
      : `${leadReads.join("; ")}.`;

  return [
    summaryLead,
    "Confirm important claims with another monitored source before acting.",
  ].join(" ");
};

const compactExecutiveSummary = (value: string): string => {
  const normalized = value.trim();
  const maxLength = 1_600;
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const candidate = normalized.slice(0, maxLength);
  const paragraphBoundary = candidate.lastIndexOf("\n\n");
  const wordBoundary = candidate.lastIndexOf(" ");
  const boundary =
    paragraphBoundary >= 900
      ? paragraphBoundary
      : wordBoundary >= 1_200
        ? wordBoundary
        : maxLength;

  return `${candidate.slice(0, boundary).trimEnd()}...`;
};

export const buildBestFirstReadBullet = (topRead: TopRead): string => {
  const citationCount = topRead.citationIds.length;
  const citationLabel =
    citationCount === 1 ? "1 citation" : `${citationCount} citations`;
  const isSingleProvider = topRead.confirmedProviderKeys.length <= 1;

  if (isSingleProvider) {
    return [
      `Best first cited read from ${topRead.providerName} (${citationLabel}):`,
      `${topRead.title} - needs confirmation; verify citations in Top reads.`,
    ].join(" ");
  }

  return [
    `Best first read (${citationLabel}, ${topRead.confirmedProviderKeys.length} source groups):`,
    `${topRead.title} - ${topRead.reason}`,
  ].join(" ");
};

const providerNameForSource = (
  providerKey: string,
  topReads: readonly TopRead[],
): string =>
  topReads.find((item) => item.providerKey === providerKey)?.providerName ??
  providerKey;

const sourceLocalReadLabel = (read: TopRead): string => {
  const reason = [read.reason, ...read.whyImportant].find(
    (value) => !isWeakReaderReason(value),
  );
  const value = reason ?? `source-reported ${read.title}`;

  return stripTrailingPeriod(value);
};

const isWeakReaderReason = (value: string): boolean => {
  const lower = value.trim().toLowerCase();

  return (
    isFallbackReaderReason(value) ||
    lower.includes("reader summary window") ||
    lower.includes("monitored read")
  );
};

const stripTrailingPeriod = (value: string): string => {
  const trimmed = value.trim();

  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
};

const isTechnicalReaderHeadline = (value: string): boolean => {
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

const isExplicitlySourceFramedText = (
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
    /^(?:a |an |the )?(?:post|discussion|thread|report|chatter)\b/iu.test(
      normalized,
    )
  );
};

const buildHumanReaderHeadline = (
  topReads: readonly TopRead[],
): string | undefined => {
  const leadReads = uniqueNonEmpty(
    topReads
      .slice(0, 3)
      .map((read) =>
        compactHeadlinePart(sourceLocalReadLabel(read) || read.title),
      )
      .filter((value) => value.length > 0),
  );

  if (leadReads.length === 0) {
    return undefined;
  }

  return leadReads.join("; ");
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

export const storyProviderMetricLabels = (params: {
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly representativeMetricLabels: readonly ProviderMetric[] | undefined;
}): readonly ProviderMetric[] => {
  return uniqueMetrics([
    ...params.evidence.slice(0, 3).flatMap(evidenceProviderMetrics),
    ...(params.representativeMetricLabels ?? []),
  ]).filter(isUserFacingProviderMetric);
};

const evidenceProviderMetrics = (
  evidence: SummaryEvidenceItem,
): readonly ProviderMetric[] => {
  const metrics = evidence.providerMetricLabels ?? [];
  const summary =
    evidence.providerMetricSummary === undefined
      ? []
      : [
          {
            label: `${evidence.providerName ?? evidence.providerKey} evidence`,
            value: evidence.providerMetricSummary,
          },
        ];

  return [...summary, ...metrics];
};

const uniqueMetrics = (
  metrics: readonly ProviderMetric[],
): readonly ProviderMetric[] => {
  const seen = new Set<string>();
  const result: ProviderMetric[] = [];

  for (const metric of metrics) {
    const key = `${metric.label}:${metric.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(metric);
  }

  return result;
};

const isUserFacingProviderMetric = (metric: ProviderMetric): boolean => {
  if (!zeroOnlyMetricLabels.has(metric.label.trim().toLowerCase())) {
    return true;
  }

  return !isEmptyMetricValue(metric.value);
};

const isEmptyMetricValue = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();

  return normalized === "0" || normalized === "-" || normalized === "n/a";
};

const zeroOnlyMetricLabels = new Set([
  "bookmarks",
  "impressions",
  "quotes",
  "shares",
  "views",
]);

export const uniqueActions = (
  actions: readonly ReaderAction[],
): readonly ReaderAction[] => {
  const seen = new Set<string>();

  return actions.filter((action) => {
    const key = `${action.kind}:${action.label}:${action.canonicalUrl ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export { firstSentence };

export const hasAnyCitation = (
  left: readonly string[],
  right: readonly string[],
): boolean => left.some((citationId) => right.includes(citationId));

export const uniqueItems = (items: readonly TopRead[]): readonly TopRead[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.providerKey}:${item.title}:${item.citationIds.join(",")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export { uniqueNonEmpty };

export { compactUnique };

export { nonEmpty };

export { interestTitle };
