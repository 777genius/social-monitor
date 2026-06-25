export type ProviderMetricLabel = string;

export type ProviderMetric = {
  readonly label: ProviderMetricLabel;
  readonly value: string;
};

export const providerMetric = (
  label: string,
  value: number | string | undefined,
): ProviderMetric | undefined => {
  const normalizedLabel = normalizeProviderMetricLabel(label);
  if (normalizedLabel === undefined || value === undefined) {
    return undefined;
  }

  return {
    label: normalizedLabel,
    value: typeof value === "number" ? value.toLocaleString("en-US") : value,
  };
};

export const normalizeProviderMetricLabel = (
  value: string,
): ProviderMetricLabel | undefined => {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length === 0 ? undefined : normalized;
};
