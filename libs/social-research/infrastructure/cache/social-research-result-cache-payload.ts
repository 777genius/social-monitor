import {
  isJsonObject,
  type JsonObject,
} from '@social-monitor/shared-kernel';

export type SocialResearchResultCachePayload = JsonObject & {
  readonly schemaVersion: 1;
  readonly value: JsonObject;
};

export const encodeSocialResearchResultCachePayload = (
  value: unknown,
): SocialResearchResultCachePayload => {
  const encoded = JSON.parse(JSON.stringify(value)) as unknown;

  if (!isJsonObject(encoded)) {
    throw new Error('Social research cache value must serialize to a JSON object');
  }

  return {
    schemaVersion: 1,
    value: encoded,
  };
};

export const decodeSocialResearchResultCachePayload = <TValue>(
  payload: unknown,
): TValue | null => {
  if (!isJsonObject(payload) || payload.schemaVersion !== 1) {
    return null;
  }

  if (!isJsonObject(payload.value)) {
    return null;
  }

  return reviveSocialResearchDates(payload.value) as TValue;
};

const reviveSocialResearchDates = (value: unknown, key = ''): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => reviveSocialResearchDates(item));
  }

  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        reviveSocialResearchDates(nestedValue, nestedKey),
      ]),
    );
  }

  if (
    key === 'publishedAt' &&
    typeof value === 'string' &&
    value.trim().length > 0
  ) {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }

  return value;
};
