export const exactReaderSummaryWeeklyIdentity = (
  value: unknown,
  label: string,
): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    value !== value.trim() ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    })
  ) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value;
};

export const exactReaderSummaryWeeklyHttpsUrl = (
  value: unknown,
  label: string,
): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2_048 ||
    value !== value.trim() ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    })
  ) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== "" ||
    parsed.hostname.length === 0 ||
    parsed.href !== value
  ) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value;
};

export const exactReaderSummaryWeeklyProviderItemId = (
  value: unknown,
  label: string,
): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2_048 ||
    value !== value.trim() ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    })
  ) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value;
};

export const exactReaderSummaryWeeklySha256 = (
  value: unknown,
  label: string,
): string => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(
      `Reader summary weekly ${label} must be a lowercase SHA-256`,
    );
  }
  return value;
};

export const exactReaderSummaryWeeklyUtcDay = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(
      "Reader summary weekly UTC day must use exact YYYY-MM-DD form",
    );
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Reader summary weekly UTC day must be valid");
  }
  return value;
};

export const exactReaderSummaryWeeklyUtcTimestamp = (
  value: unknown,
  label: string,
): string => {
  if (typeof value !== "string") {
    throw new Error(`Reader summary weekly ${label} must be a UTC timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(
      `Reader summary weekly ${label} must use exact ISO UTC form`,
    );
  }
  return value;
};
