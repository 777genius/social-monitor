/** Stable identity deduplication; deliberately does not normalize provider keys. */
export const uniqueStrings = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
};
