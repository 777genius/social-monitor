export type FeedItemCollectionStats = {
  readonly lowRelevance: boolean;
  readonly muted: boolean;
  readonly userRated: boolean;
  readonly topicLabel?: string;
  readonly searchQueries: readonly string[];
};

export const statsForFeedItemMetadata = (
  metadata: Readonly<Record<string, unknown>> | undefined,
): FeedItemCollectionStats => ({
  lowRelevance: readNumericPath(metadata, [
    ["normalizedSignal", "score"],
    ["signal", "score"],
    ["relevance", "score"],
  ]).some((score) => score < 20),
  muted:
    readBooleanPath(metadata, [
      ["muted"],
      ["relevance", "muted"],
      ["ranking", "muted"],
    ]) ||
    readStringPath(metadata, [["muteReason"], ["relevance", "muteReason"]]) !==
      undefined,
  userRated:
    readBooleanPath(metadata, [["userRated"], ["rating", "userRated"]]) ||
    readNumericPath(metadata, [["userRating"], ["rating", "value"]]).length > 0,
  topicLabel: readStringPath(metadata, [
    ["interestQuerySnapshot", "query"],
    ["interestQuery", "query"],
    ["topic"],
  ]),
  searchQueries: uniqueNonEmpty([
    readStringPath(metadata, [["searchQuery"], ["query"]]),
    ...readStringArrayPath(metadata, [
      ["searchQueries"],
      ["queries"],
      ["collection", "searchQueries"],
    ]),
    readStringPath(metadata, [
      ["sourceBindingSnapshot", "sourceQuery", "query"],
    ]),
  ]),
});

const readNumericPath = (
  value: unknown,
  paths: readonly (readonly string[])[],
): readonly number[] =>
  paths.flatMap((path) => {
    const nested = readPath(value, path);

    return typeof nested === "number" && Number.isFinite(nested)
      ? [nested]
      : [];
  });

const readBooleanPath = (
  value: unknown,
  paths: readonly (readonly string[])[],
): boolean => paths.some((path) => readPath(value, path) === true);

const readStringPath = (
  value: unknown,
  paths: readonly (readonly string[])[],
): string | undefined => {
  for (const path of paths) {
    const nested = readPath(value, path);

    if (typeof nested === "string" && nested.trim().length > 0) {
      return nested.trim();
    }
  }

  return undefined;
};

const readStringArrayPath = (
  value: unknown,
  paths: readonly (readonly string[])[],
): readonly string[] =>
  paths.flatMap((path) => {
    const nested = readPath(value, path);

    return Array.isArray(nested)
      ? nested.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
      : [];
  });

const readPath = (value: unknown, path: readonly string[]): unknown => {
  let current = value;
  for (const part of path) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object" ||
      Array.isArray(current)
    ) {
      return undefined;
    }
    current = (current as Readonly<Record<string, unknown>>)[part];
  }

  return current;
};

const uniqueNonEmpty = (
  values: readonly (string | undefined)[],
): readonly string[] => [
  ...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
];
