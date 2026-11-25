export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonObject = Readonly<Record<string, JsonValue>>;

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const normalizeJsonObject = (value: unknown): JsonObject => {
  if (!isJsonObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => isJsonValue(item))
      .map(([key, item]) => [key, normalizeJsonValue(item)]),
  );
};

export const emptyJsonObjectAsUndefined = (value: JsonObject | undefined): JsonObject | undefined =>
  value === undefined || Object.keys(value).length === 0 ? undefined : value;

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return Number.isFinite(value) || typeof value !== 'number';
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (typeof value === 'object') {
    return value !== null && Object.values(value).every(isJsonValue);
  }

  return false;
};

const normalizeJsonValue = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }

  if (typeof value === 'object' && value !== null) {
    return normalizeJsonObject(value);
  }

  return value;
};
