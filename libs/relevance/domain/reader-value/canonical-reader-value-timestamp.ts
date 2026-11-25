/** Canonical UTC representation used for PostgreSQL boundaries and signed V3 data. */
export const canonicalReaderValueTimestamp = (value: string): string => {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00(?::00)?)$/u
    .exec(value);
  if (match === null) throw new Error("Invalid PostgreSQL UTC timestamp");
  const milliseconds = (match[3] ?? "").padEnd(3, "0").slice(0, 3);
  if (!Number.isFinite(Date.parse(`${match[1]}T${match[2]}.${milliseconds}Z`))) {
    throw new Error("Invalid PostgreSQL UTC timestamp");
  }
  return `${match[1]}T${match[2]}.${(match[3] ?? "").padEnd(6, "0")}Z`;
};

export const readerValueTimestampMicros = (value: string): bigint | undefined => {
  let canonical: string;
  try {
    canonical = canonicalReaderValueTimestamp(value);
  } catch {
    return undefined;
  }
  const milliseconds = Date.parse(`${canonical.slice(0, 23)}Z`);
  return BigInt(milliseconds) * 1_000n + BigInt(canonical.slice(23, 26));
};

export const compareReaderValueTimestamps = (
  left: string,
  right: string,
): number => {
  const leftMicros = readerValueTimestampMicros(left);
  const rightMicros = readerValueTimestampMicros(right);
  if (leftMicros === undefined || rightMicros === undefined) return Number.NaN;
  return leftMicros === rightMicros ? 0 : leftMicros < rightMicros ? -1 : 1;
};
