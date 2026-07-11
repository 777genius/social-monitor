import type { JsonObject } from "@social-monitor/shared-kernel";

export type GitHubTrendingBackfillOptions = {
  readonly date: string;
  readonly apply: boolean;
};

export type GitHubTrendingSourceObservation = {
  readonly id: string;
  readonly sourceBindingId: string;
  readonly canonicalUrl: string;
  readonly observedAt: Date;
  readonly metadata: JsonObject;
};

const utcDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const parseGitHubTrendingBackfillOptions = (
  args: readonly string[],
): GitHubTrendingBackfillOptions => {
  let date: string | undefined;
  let apply = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") {
      if (apply) {
        throw new Error("--apply may only be provided once");
      }
      apply = true;
      continue;
    }
    if (argument === "--date") {
      if (date !== undefined) {
        throw new Error("--date may only be provided once");
      }
      date = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unsupported option: ${argument ?? "<missing>"}`);
  }

  if (date === undefined || !isUtcCalendarDate(date)) {
    throw new Error(
      "--date must be a real UTC calendar date in YYYY-MM-DD format",
    );
  }

  return { date, apply };
};

export const utcDateWindow = (
  date: string,
): { readonly start: Date; readonly endExclusive: Date } => {
  if (!isUtcCalendarDate(date)) {
    throw new Error(
      "date must be a real UTC calendar date in YYYY-MM-DD format",
    );
  }
  const start = new Date(`${date}T00:00:00.000Z`);
  const endExclusive = new Date(start);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, endExclusive };
};

export const strongestGitHubTrendingObservations = <
  TObservation extends GitHubTrendingSourceObservation,
>(
  observations: readonly TObservation[],
): {
  readonly selected: readonly TObservation[];
  readonly invalidCanonicalRepositoryCount: number;
} => {
  const selectedByBindingAndRepository = new Map<string, TObservation>();
  let invalidCanonicalRepositoryCount = 0;

  for (const observation of observations) {
    const repository = canonicalGitHubRepository(observation);
    if (repository === undefined) {
      invalidCanonicalRepositoryCount += 1;
      continue;
    }
    const key = `${observation.sourceBindingId}\u0000${repository}`;
    const current = selectedByBindingAndRepository.get(key);
    if (current === undefined || isStronger(observation, current)) {
      selectedByBindingAndRepository.set(key, observation);
    }
  }

  return {
    selected: [...selectedByBindingAndRepository.values()].sort(
      (left, right) =>
        left.sourceBindingId.localeCompare(right.sourceBindingId) ||
        canonicalGitHubRepository(left)!.localeCompare(
          canonicalGitHubRepository(right)!,
        ),
    ),
    invalidCanonicalRepositoryCount,
  };
};

export const missingGitHubTrendingObservations = <
  TObservation extends GitHubTrendingSourceObservation,
>(
  selected: readonly TObservation[],
  existingVisible: readonly GitHubTrendingSourceObservation[],
): {
  readonly missing: readonly TObservation[];
  readonly alreadyPresent: number;
} => {
  const existingKeys = new Set(
    existingVisible.flatMap((observation) => {
      const repository = canonicalGitHubRepository(observation);
      return repository === undefined
        ? []
        : [`${observation.sourceBindingId}\u0000${repository}`];
    }),
  );
  const missing = selected.filter((observation) => {
    const repository = canonicalGitHubRepository(observation);
    return (
      repository !== undefined &&
      !existingKeys.has(`${observation.sourceBindingId}\u0000${repository}`)
    );
  });
  return { missing, alreadyPresent: selected.length - missing.length };
};

const isUtcCalendarDate = (value: string): boolean => {
  if (!utcDatePattern.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

export const canonicalGitHubRepository = (
  observation: GitHubTrendingSourceObservation,
): string | undefined => {
  const repository = asObject(observation.metadata.repository);
  const fullName = stringValue(repository?.fullName);
  const fromMetadata =
    fullName === undefined ? undefined : normalizeFullName(fullName);
  if (fromMetadata !== undefined) {
    return fromMetadata;
  }

  try {
    const url = new URL(observation.canonicalUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "github.com"
    ) {
      return undefined;
    }
    return normalizeFullName(url.pathname.replace(/^\/+|\/+$/g, ""));
  } catch {
    return undefined;
  }
};

const normalizeFullName = (value: string): string | undefined => {
  const parts = value.split("/").filter((part) => part.length > 0);
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))
  ) {
    return undefined;
  }
  return parts.join("/").toLocaleLowerCase("en-US");
};

const isStronger = (
  candidate: GitHubTrendingSourceObservation,
  current: GitHubTrendingSourceObservation,
): boolean => {
  const starsDifference = starsGained(candidate) - starsGained(current);
  if (starsDifference !== 0) {
    return starsDifference > 0;
  }
  const observedDifference =
    candidate.observedAt.getTime() - current.observedAt.getTime();
  if (observedDifference !== 0) {
    return observedDifference > 0;
  }
  const rankDifference = rank(current) - rank(candidate);
  if (rankDifference !== 0) {
    return rankDifference > 0;
  }
  return candidate.id.localeCompare(current.id) > 0;
};

const starsGained = (observation: GitHubTrendingSourceObservation): number => {
  const value = asObject(observation.metadata.trending)?.starsGained;
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
};

const rank = (observation: GitHubTrendingSourceObservation): number => {
  const value = asObject(observation.metadata.trending)?.rank;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.MAX_SAFE_INTEGER;
};

const asObject = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
