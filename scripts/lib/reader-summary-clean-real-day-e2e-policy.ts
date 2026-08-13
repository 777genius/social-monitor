const primaryProviderKeys = ["reddit", "x-twitter"] as const;

export function targetWindowHasEveryPrimaryProvider(
  providerCounts: Readonly<Record<string, number>>,
): boolean {
  return primaryProviderKeys.every(
    (providerKey) => (providerCounts[providerKey] ?? 0) > 0,
  );
}
