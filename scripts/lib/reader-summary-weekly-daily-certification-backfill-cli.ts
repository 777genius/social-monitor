export type ReaderSummaryWeeklyDailyCertificationBackfillCliOptions =
  Readonly<{
    weekStartedOn?: string;
  }>;

export const parseReaderSummaryWeeklyDailyCertificationBackfillArgs = (
  args: readonly string[],
): ReaderSummaryWeeklyDailyCertificationBackfillCliOptions => {
  let weekStartedOn: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg !== "--week-start") {
      throw new Error(
        `Unknown reader summary weekly daily certification backfill option: ${arg}`,
      );
    }
    if (weekStartedOn !== undefined) {
      throw new Error("--week-start may be provided only once");
    }
    const value = args[++index];
    if (value === undefined || value.startsWith("--")) {
      throw new Error("Missing value for --week-start");
    }
    weekStartedOn = value;
  }
  return Object.freeze(
    weekStartedOn === undefined ? {} : { weekStartedOn },
  );
};
