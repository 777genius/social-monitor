import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { hasReaderSummaryEvidenceHardBlock } from "./reader-summary-evidence-eligibility-policy";

export const isTopReadEligibleEvidence = (
  evidence: SummaryEvidenceItem | undefined,
): boolean => {
  if (evidence === undefined) {
    return false;
  }

  if (evidence.contentQuality?.eligibleForTopRead === false) {
    return false;
  }

  if (
    hasReaderSummaryEvidenceHardBlock(evidence.contentQuality?.flags ?? [])
  ) {
    return false;
  }

  return hasProviderTopReadSignal(evidence);
};

const hasProviderTopReadSignal = (evidence: SummaryEvidenceItem): boolean => {
  const labels = evidence.providerMetricLabels ?? [];
  const family = providerFamilyKey(evidence.providerKey);

  if (labels.length === 0) {
    return true;
  }

  if (family === "x-twitter") {
    const likes = metricValue(labels, "likes") ?? 0;
    const reposts = metricValue(labels, "reposts") ?? 0;
    const replies = metricValue(labels, "replies") ?? 0;
    const weighted = likes + reposts * 2 + replies * 0.5;

    return likes >= 25 || reposts >= 8 || replies >= 12 || weighted >= 50;
  }

  if (family === "reddit") {
    const score = metricValue(labels, "score") ?? 0;
    const comments = metricValue(labels, "comments") ?? 0;

    return score >= 20 || comments >= 5 || score + comments * 2 >= 35;
  }

  if (family === "hacker-news") {
    const points = metricValue(labels, "points") ?? 0;
    const comments = metricValue(labels, "comments") ?? 0;

    return points >= 20 || comments >= 8 || points + comments * 2 >= 35;
  }

  if (family === "github") {
    const trend = Math.max(
      metricSignedValue(labels, "trend 24h") ?? 0,
      metricSignedValue(labels, "trend 48h") ?? 0,
      metricSignedValue(labels, "trend") ?? 0,
      metricAnySignedValue(labels, "github trending") ?? 0,
    );
    const rank = metricRankValue(labels, "github trending");

    return trend >= 50 || (rank !== undefined && rank <= 10);
  }

  return true;
};

const metricValue = (
  labels: NonNullable<SummaryEvidenceItem["providerMetricLabels"]>,
  label: string,
): number | undefined =>
  parseMetricNumber(
    labels.find((metric) => metric.label.toLowerCase() === label)?.value,
  );

const metricSignedValue = (
  labels: NonNullable<SummaryEvidenceItem["providerMetricLabels"]>,
  label: string,
): number | undefined =>
  parseSignedMetricNumber(
    labels.find((metric) => metric.label.toLowerCase() === label)?.value,
  );

const metricAnySignedValue = (
  labels: NonNullable<SummaryEvidenceItem["providerMetricLabels"]>,
  labelPrefix: string,
): number | undefined =>
  parseSignedMetricNumber(
    labels.find((metric) => metric.label.toLowerCase().startsWith(labelPrefix))
      ?.value,
  );

const metricRankValue = (
  labels: NonNullable<SummaryEvidenceItem["providerMetricLabels"]>,
  labelPrefix: string,
): number | undefined => {
  const value = labels.find((metric) =>
    metric.label.toLowerCase().startsWith(labelPrefix),
  )?.value;

  return value === undefined
    ? undefined
    : parseMetricNumber(value.match(/#\s*([0-9,]+)/u)?.[1]);
};

const parseMetricNumber = (value: string | undefined): number | undefined => {
  const match = value?.match(/-?[0-9][0-9,]*/u);
  if (match === undefined || match === null) {
    return undefined;
  }
  const parsed = Number(match[0].replace(/,/gu, ""));

  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseSignedMetricNumber = (
  value: string | undefined,
): number | undefined => {
  const match = value?.match(/[+-]\s*[0-9][0-9,]*/u);
  if (match === undefined || match === null) {
    return parseMetricNumber(value);
  }
  const parsed = Number(match[0].replace(/\s|,/gu, ""));

  return Number.isFinite(parsed) ? parsed : undefined;
};

const providerFamilyKey = (providerKey: string): string => {
  const normalized = providerKey.toLowerCase();

  if (normalized === "github" || normalized.startsWith("github-")) {
    return "github";
  }

  if (
    normalized === "x-twitter" ||
    normalized === "twitter" ||
    normalized === "x"
  ) {
    return "x-twitter";
  }

  if (normalized === "hacker-news" || normalized === "hn") {
    return "hacker-news";
  }

  return normalized;
};
