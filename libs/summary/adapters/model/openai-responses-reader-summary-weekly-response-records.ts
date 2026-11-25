export const outputRecords = (
  response: Record<string, unknown>,
): readonly Record<string, unknown>[] =>
  Array.isArray(response.output)
    ? response.output.flatMap((value) => {
        const record = asRecord(value);
        return record === null ? [] : [record];
      })
    : [];

export const contentRecords = (
  output: Record<string, unknown>,
): readonly Record<string, unknown>[] =>
  Array.isArray(output.content)
    ? output.content.flatMap((value) => {
        const record = asRecord(value);
        return record === null ? [] : [record];
      })
    : [];

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const hasValue = (
  record: Record<string, unknown>,
  key: string,
): boolean => record[key] !== undefined && record[key] !== null;

export const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;
