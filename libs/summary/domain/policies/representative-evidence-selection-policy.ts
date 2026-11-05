import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";

const closeSignalScoreThreshold = 0.25;
const minMetricStrengthDiff = 0.001;

export const compareRepresentativeEvidenceItems = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): number => {
  const scoreDiff = right.score - left.score;
  if (Math.abs(scoreDiff) > closeSignalScoreThreshold) {
    return scoreDiff;
  }

  const metricStrengthDiff =
    representativeMetricStrength(right) - representativeMetricStrength(left);
  if (Math.abs(metricStrengthDiff) > minMetricStrengthDiff) {
    return metricStrengthDiff;
  }

  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return right.observedAt.getTime() - left.observedAt.getTime();
};

export const representativeMetricStrength = (
  item: SummaryEvidenceItem,
): number => {
  const labels = item.providerMetricLabels ?? [];
  const labelStrength = labels.reduce((total, metric) => {
    const directStrength = metricStrengthFromLabeledValue(
      metric.label,
      metric.value,
    );

    return (
      total +
      (directStrength > 0
        ? directStrength
        : metricStrengthFromText(metric.value))
    );
  }, 0);

  if (labelStrength > 0) {
    return labelStrength;
  }

  return metricStrengthFromText(item.providerMetricSummary ?? "");
};

const metricStrengthFromLabeledValue = (
  label: string,
  value: string,
): number => {
  const rankWeight = metricRankWeight(label);
  if (rankWeight !== undefined) {
    const rank = parseRankMetricNumber(value);

    return rank === undefined ? 0 : Math.max(0, 25 - rank) * rankWeight;
  }

  const trendWeight = metricTrendWeight(label);
  if (trendWeight !== undefined) {
    const trend = parseSignedMetricNumber(value);

    return trend === undefined
      ? 0
      : Math.log1p(Math.max(0, trend)) * trendWeight;
  }

  const weight = metricCountWeight(label);
  if (weight === undefined) {
    return 0;
  }
  if (value.includes("%")) {
    return 0;
  }

  const count = parseUnsignedMetricNumber(value);

  return count === undefined ? 0 : Math.log1p(count) * weight;
};

const metricStrengthFromText = (value: string): number => {
  let strength = 0;

  for (const match of value.matchAll(metricTextPattern)) {
    const rawCount = match[1];
    const phrase = match[2];
    if (rawCount === undefined || phrase === undefined) {
      continue;
    }

    const weight = metricCountWeight(phrase);
    const count = parseUnsignedMetricNumber(rawCount);
    if (weight === undefined || count === undefined) {
      continue;
    }

    strength += Math.log1p(count) * weight;
  }

  return strength;
};

const metricTextPattern =
  /([0-9][0-9,.]*[kKmMbB]?)\s+(?:x\s+)?([a-zA-Z][a-zA-Z ]*)/gu;

const metricCountWeight = (label: string): number | undefined => {
  for (const word of metricWords(label)) {
    switch (word) {
      case "like":
      case "likes":
      case "point":
      case "points":
      case "score":
      case "star":
      case "stars":
      case "upvote":
      case "upvotes":
        return 1;
      case "repost":
      case "reposts":
      case "share":
      case "shares":
        return 1.25;
      case "reaction":
      case "reactions":
        return 0.6;
      case "fork":
      case "forks":
        return 0.35;
      default:
        continue;
    }
  }

  return undefined;
};

const metricTrendWeight = (label: string): number | undefined =>
  metricWords(label).some((word) => word === "trend" || word === "trending")
    ? 1
    : undefined;

const metricRankWeight = (label: string): number | undefined =>
  metricWords(label).some((word) => word === "rank") ? 0.08 : undefined;

const metricWords = (value: string): readonly string[] =>
  value
    .trim()
    .toLowerCase()
    .split(/[^a-z]+/u)
    .filter((word) => word.length > 0);

const parseUnsignedMetricNumber = (value: string): number | undefined => {
  const parsed = parseMetricNumber(value);

  return parsed === undefined ? undefined : Math.max(0, parsed);
};

const parseSignedMetricNumber = (value: string): number | undefined => {
  const match = value.match(/[+-]\s*[0-9][0-9,.]*[kKmMbB]?/u);

  return match === null ? parseMetricNumber(value) : parseMetricNumber(match[0]);
};

const parseRankMetricNumber = (value: string): number | undefined => {
  const match = value.match(/#\s*([0-9][0-9,]*)/u);

  return match === null
    ? parseUnsignedMetricNumber(value)
    : parseMetricNumber(match[1]);
};

const parseMetricNumber = (value: string | undefined): number | undefined => {
  const match = value?.match(/[+-]?\s*[0-9][0-9,.]*[kKmMbB]?/u);
  if (match === undefined || match === null) {
    return undefined;
  }

  const raw = match[0].replace(/\s|,/gu, "").toLowerCase();
  const multiplier = metricNumberMultiplier(raw);
  const digits = multiplier === 1 ? raw : raw.substring(0, raw.length - 1);
  const parsed = Number(digits);

  return Number.isFinite(parsed) ? parsed * multiplier : undefined;
};

const metricNumberMultiplier = (value: string): number => {
  if (value.endsWith("k")) {
    return 1_000;
  }
  if (value.endsWith("m")) {
    return 1_000_000;
  }
  if (value.endsWith("b")) {
    return 1_000_000_000;
  }

  return 1;
};
