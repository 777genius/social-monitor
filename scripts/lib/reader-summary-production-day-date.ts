import { readOption } from "./yesterday-social-replay-support";

export const resolveProductionDayCollectionDate = (
  args: readonly string[],
  now: Date = new Date(),
): string => {
  const explicit = readOption("--date");
  if (explicit !== undefined) {
    assertCollectionDate(explicit);
    return explicit;
  }
  if (args.includes("--today")) return now.toISOString().slice(0, 10);
  if (args.includes("--yesterday")) {
    return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  }
  throw new Error("Provide --date YYYY-MM-DD, --today or --yesterday");
};

const assertCollectionDate = (value: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Collection date must use YYYY-MM-DD format: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Collection date is invalid: ${value}`);
  }
};
