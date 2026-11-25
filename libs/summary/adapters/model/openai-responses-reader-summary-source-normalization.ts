/** Pure lexical source redaction and bounded UTF-16 normalization. Shared by
 * candidate admission and hydrated model evidence without importing ranking. */
export const normalizeSourceText = (value: string | undefined,
  sourceHydrationLimit: number): string | undefined => {
  const normalized = value
    ?.slice(0, sourceHydrationLimit)
    .replace(/\[([^\]]+)\]\(\s*https?:\/\/[^)\s]+\s*\)/giu, "$1")
    .replace(/https?:\/\/\S+/giu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};
