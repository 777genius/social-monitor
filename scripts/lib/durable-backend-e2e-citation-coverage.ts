import type { JsonRecord } from "./durable-backend-e2e-json-fields";

export type ProviderCitationCoverage = {
  readonly expectedProviderKeys: readonly string[];
  readonly citedProviderKeys: readonly string[];
  readonly uncitedProviderKeys: readonly string[];
  readonly minimumCitedProviderCount: number;
};

export function providerCitationCoverage(
  expectedProviderKeys: readonly string[],
  citedProviderKeys: readonly string[],
): ProviderCitationCoverage {
  const expected = [...new Set(expectedProviderKeys)].sort();
  const cited = [...new Set(citedProviderKeys)].sort();
  const minimumCitedProviderCount = Math.min(
    expected.length,
    Math.max(2, expected.length - 1),
  );

  return {
    expectedProviderKeys: expected,
    citedProviderKeys: cited,
    uncitedProviderKeys: expected.filter((providerKey) =>
      !cited.includes(providerKey),
    ),
    minimumCitedProviderCount,
  };
}

export function assertProviderCitationCoverage(
  label: string,
  coverage: ProviderCitationCoverage,
  diagnostics: JsonRecord,
): void {
  if (
    coverage.citedProviderKeys.length < coverage.minimumCitedProviderCount
  ) {
    throw new Error(
      `${label} citations must include at least ${coverage.minimumCitedProviderCount} provider families: ${JSON.stringify(
        {
          ...coverage,
          ...diagnostics,
        },
      )}`,
    );
  }
}

