import type { SourceQueryPlannerIntent } from '../../domain';

type JsonRecord = Readonly<Record<string, unknown>>;

export const readOptionalQueryPlannerIntent = (
  value: unknown,
  path: string,
): SourceQueryPlannerIntent | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const record = readRecord(value, path);

  return {
    topic: readRequiredString(record, 'topic', path),
    sourceKeys: readStringArray(record.sourceKeys, `${path}.sourceKeys`),
    products: readOptionalStringArray(record.products, `${path}.products`),
    keywords: readOptionalStringArray(record.keywords, `${path}.keywords`),
    handles: readOptionalArray(record.handles, `${path}.handles`)?.map(
      (item, index) => readPlannerHandle(item, `${path}.handles[${index}]`),
    ),
    communities: readOptionalArray(
      record.communities,
      `${path}.communities`,
    )?.map((item, index) =>
      readPlannerCommunity(item, `${path}.communities[${index}]`),
    ),
    maxLanes: readOptionalInteger(record.maxLanes, 1, 100, `${path}.maxLanes`),
    maxLanesPerSource: readOptionalInteger(
      record.maxLanesPerSource,
      1,
      30,
      `${path}.maxLanesPerSource`,
    ),
    maxItemsPerLane: readOptionalInteger(
      record.maxItemsPerLane,
      1,
      1_000,
      `${path}.maxItemsPerLane`,
    ),
    includeEnrichment: readOptionalBoolean(
      record.includeEnrichment,
      `${path}.includeEnrichment`,
    ),
  };
};

const readPlannerHandle = (
  value: unknown,
  path: string,
): NonNullable<SourceQueryPlannerIntent['handles']>[number] => {
  if (typeof value === 'string') {
    return { handle: value };
  }

  const record = readRecord(value, path);

  return {
    handle: readRequiredString(record, 'handle', path),
    sourceKey: readOptionalString(record.sourceKey, `${path}.sourceKey`),
    includePosts: readOptionalBoolean(record.includePosts, `${path}.includePosts`),
    includeMentions: readOptionalBoolean(
      record.includeMentions,
      `${path}.includeMentions`,
    ),
  };
};

const readPlannerCommunity = (
  value: unknown,
  path: string,
): NonNullable<SourceQueryPlannerIntent['communities']>[number] => {
  if (typeof value === 'string') {
    return { name: value };
  }

  const record = readRecord(value, path);

  return {
    name: readRequiredString(record, 'name', path),
    sourceKey: readOptionalString(record.sourceKey, `${path}.sourceKey`),
    listings: readOptionalArray(record.listings, `${path}.listings`)?.map(
      (item, index) => readCommunityListing(item, `${path}.listings[${index}]`),
    ),
  };
};

const readCommunityListing = (
  value: unknown,
  path: string,
): 'top' | 'hot' | 'new' => {
  if (value === 'top' || value === 'hot' || value === 'new') {
    return value;
  }

  throw new Error(`${path} must be top, hot or new`);
};

const readRecord = (value: unknown, path: string): JsonRecord => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }

  return value as JsonRecord;
};

const readRequiredString = (
  record: JsonRecord,
  key: string,
  path: string,
): string => {
  const value = readOptionalString(record[key], `${path}.${key}`);

  if (value === undefined) {
    throw new Error(`${path}.${key} must be a non-empty string`);
  }

  return value;
};

const readStringArray = (value: unknown, path: string): readonly string[] => {
  const items = readArray(value, path).flatMap((item, index) => {
    const parsed = readOptionalString(item, `${path}[${index}]`);

    return parsed === undefined ? [] : [parsed];
  });

  if (items.length === 0) {
    throw new Error(`${path} must contain at least one string`);
  }

  return compactUnique(items);
};

const readOptionalStringArray = (
  value: unknown,
  path: string,
): readonly string[] | undefined =>
  value === undefined ? undefined : readStringArray(value, path);

const readOptionalString = (value: unknown, path: string): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string`);
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

const readOptionalBoolean = (
  value: unknown,
  path: string,
): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean`);
  }

  return value;
};

const readOptionalInteger = (
  value: unknown,
  min: number,
  max: number,
  path: string,
): number | undefined =>
  value === undefined ? undefined : readInteger(value, min, max, path);

const readInteger = (
  value: unknown,
  min: number,
  max: number,
  path: string,
): number => {
  const numberValue = readNumber(value, min, max, path);

  if (!Number.isInteger(numberValue)) {
    throw new Error(`${path} must be an integer`);
  }

  return numberValue;
};

const readNumber = (
  value: unknown,
  min: number,
  max: number,
  path: string,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }

  if (value < min || value > max) {
    throw new Error(`${path} must be between ${min} and ${max}`);
  }

  return value;
};

const readArray = (value: unknown, path: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }

  return value;
};

const readOptionalArray = (
  value: unknown,
  path: string,
): readonly unknown[] | undefined =>
  value === undefined ? undefined : readArray(value, path);

const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];
