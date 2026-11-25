const maximumDominantCitationNumerator = 2;
const maximumDominantCitationDenominator = 3;

export const countReaderSummaryWeeklyCitationsBy = <T>(
  values: readonly T[],
  keyOf: (value: T) => string,
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = keyOf(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

export const readerSummaryWeeklyCitationDominanceIsControlled = (
  counts: ReadonlyMap<string, number>,
): boolean => {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const dominant = Math.max(0, ...counts.values());
  return (
    total > 0 &&
    dominant * maximumDominantCitationDenominator <=
      total * maximumDominantCitationNumerator
  );
};

export const readerSummaryWeeklyDominantCitationShare = (
  counts: ReadonlyMap<string, number>,
  total: number,
): number => {
  if (total === 0) {
    return 0;
  }
  const dominant = Math.max(0, ...counts.values());
  return Math.round((dominant / total) * 1_000) / 1_000;
};
