export const stableReaderSummaryPublicationJson = (value: unknown): string => JSON.stringify(sortJson(value));

const sortJson = (value: unknown): unknown => Array.isArray(value)
  ? value.map(sortJson)
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]))
    : value;

