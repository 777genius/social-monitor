export const assertExactPromotionMetrics = (value: unknown): void => {
  const record = requireRecord(value, "promotion metrics");
  const provider = record.provider;
  const keys = provider === "x"
    ? ["provider", "likes", "reposts", "weightedScore"]
    : provider === "reddit"
      ? ["provider", "score"]
      : provider === "hacker_news"
        ? ["provider", "points"]
        : provider === "github_radar"
          ? [
              "provider", "snapshotKind", "windowStartedAt", "windowEndedAt",
              "starsDelta", "forksDelta",
            ]
          : null;
  if (keys === null) {
    throw new Error("Invalid promotion field: metrics.provider");
  }
  const optional = provider === "reddit" ? ["upvoteRatio"] : [];
  exactKeys(record, keys, optional, "promotion metrics");
  strings(
    record,
    provider === "github_radar"
      ? ["provider", "snapshotKind"]
      : ["provider"],
  );
  numbers(record, keys.filter((key) =>
    !["provider", "snapshotKind", "windowStartedAt", "windowEndedAt"]
      .includes(key)));
  optionalNumbers(record, optional);
  for (const key of [...keys, ...optional]) {
    if ([
      "provider", "snapshotKind", "windowStartedAt", "windowEndedAt",
      "upvoteRatio",
    ].includes(key) || record[key] === undefined) continue;
    nonNegativeInteger(record[key], `metrics.${key}`);
  }
  if (provider === "reddit" && record.upvoteRatio !== undefined &&
      ((record.upvoteRatio as number) < 0 ||
        (record.upvoteRatio as number) > 1)) {
    invalid("metrics.upvoteRatio");
  }
  if (provider === "x" && record.weightedScore !==
      (record.likes as number) + 2 * (record.reposts as number)) {
    invalid("metrics.weightedScore");
  }
  if (provider === "github_radar") {
    if (record.snapshotKind !== "repository_growth") {
      invalid("metrics.snapshotKind");
    }
    dates(record, ["windowStartedAt", "windowEndedAt"]);
  }
};

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void => {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !allowed.has(key)) ||
      Object.values(value).some((nested) =>
        nested === null || nested === undefined)) {
    throw new Error(`${label} must match the exact schema`);
  }
};

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const strings = (
  value: Record<string, unknown>,
  keys: readonly string[],
): void => {
  for (const key of keys) {
    if (typeof value[key] !== "string" ||
        (value[key] as string).trim() === "") invalid(key);
  }
};

const numbers = (
  value: Record<string, unknown>,
  keys: readonly string[],
): void => {
  for (const key of keys) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
      invalid(key);
    }
  }
};

const optionalNumbers = (
  value: Record<string, unknown>,
  keys: readonly string[],
): void => {
  for (const key of keys) {
    if (value[key] !== undefined &&
        (typeof value[key] !== "number" || !Number.isFinite(value[key]))) {
      invalid(key);
    }
  }
};

const nonNegativeInteger = (value: unknown, key: string): void => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    invalid(key);
  }
};

const dates = (
  value: Record<string, unknown>,
  keys: readonly string[],
): void => {
  for (const key of keys) {
    const candidate = value[key];
    const date = candidate instanceof Date
      ? candidate
      : typeof candidate === "string"
        ? new Date(candidate)
        : null;
    if (date === null || !Number.isFinite(date.getTime())) invalid(key);
  }
};

const invalid = (key: string): never => {
  throw new Error(`Invalid promotion field: ${key}`);
};
