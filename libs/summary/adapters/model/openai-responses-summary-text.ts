import type { SummaryModelInput } from '../../ports';

export const normalizeSafeStringArray = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(sourceHighlightText)
    .filter((item): item is string => item !== undefined)
    .filter((item, index, items) => items.indexOf(item) === index);
};

const sourceHighlightText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return nonEmptyString(value);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const source = nonEmptyString(record.source);
  const whyItMatters = nonEmptyString(record.whyItMatters);
  if (source !== undefined && whyItMatters !== undefined) {
    return `${source}: ${whyItMatters}`;
  }

  return source ?? whyItMatters;
};

export const fallbackHeadline = (
  raw: Record<string, unknown>,
  input: SummaryModelInput,
): string =>
  headlineFromSummary(raw.summary) ??
  input.evidence.items[0]?.title ??
  'Current monitored signals';

export const fallbackExecutiveSummary = (
  raw: Record<string, unknown>,
  input: SummaryModelInput,
): string =>
  nonEmptyString(raw.summary) ??
  input.evidence.items[0]?.bodyPreview ??
  input.evidence.items[0]?.title ??
  'Selected evidence was available, but the provider omitted an executive summary.';

const headlineFromSummary = (value: unknown): string | undefined => {
  const summary = nonEmptyString(value);
  if (summary === undefined) {
    return undefined;
  }

  const firstLine = summary
    .split(/(?:\r?\n|\\n)/u)
    .map((line) => line.replace(/^[-*]\s*/u, '').trim())
    .find((line) => line.length > 0);
  if (firstLine === undefined) {
    return undefined;
  }

  return firstLine.length <= 140
    ? firstLine
    : `${firstLine.slice(0, 137).trimEnd()}...`;
};

export const stringOrFallback = (value: unknown, fallback: string): string =>
  nonEmptyString(value) ?? fallback;

const nonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};
