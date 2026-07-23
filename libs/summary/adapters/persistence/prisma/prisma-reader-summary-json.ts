import type { ReaderSummaryArtifact } from "../../../domain";

export const serializeReaderSummaryArtifact = (
  artifact: ReaderSummaryArtifact,
): Readonly<Record<string, unknown>> => {
  const snapshot = artifact.toSnapshot();

  return jsonObjectForPrisma(
    {
      ...snapshot,
      period: {
        cadence: snapshot.period.cadence,
        startedAt: snapshot.period.startedAt.toISOString(),
        endedAt: snapshot.period.endedAt.toISOString(),
        timezone: snapshot.period.timezone,
        periodKey: snapshot.period.periodKey,
      },
      sourceWindow: {
        ...snapshot.sourceWindow,
        startedAt: snapshot.sourceWindow.startedAt.toISOString(),
        endedAt: snapshot.sourceWindow.endedAt.toISOString(),
      },
      storyClusters: snapshot.storyClusters.map((cluster) => ({
        ...cluster,
        observedAtRange: {
          startedAt: cluster.observedAtRange.startedAt.toISOString(),
          endedAt: cluster.observedAtRange.endedAt.toISOString(),
        },
      })),
      contextArtifacts: snapshot.contextArtifacts.map((contextArtifact) => ({
        ...contextArtifact,
        period: {
          cadence: contextArtifact.period.cadence,
          startedAt: contextArtifact.period.startedAt.toISOString(),
          endedAt: contextArtifact.period.endedAt.toISOString(),
          timezone: contextArtifact.period.timezone,
          periodKey: contextArtifact.period.periodKey,
        },
        generatedAt: contextArtifact.generatedAt.toISOString(),
      })),
    },
    "Reader summary artifact payload",
  );
};

export const readerSummaryCitationsToPrisma = (
  artifact: ReaderSummaryArtifact,
): readonly unknown[] => {
  const value = jsonValueForPrisma(
    artifact.toSnapshot().citationMap,
    "Reader summary citations",
  );
  if (!Array.isArray(value)) {
    throw new Error("Reader summary citations must serialize to an array");
  }

  return value;
};

export const readerSummaryQualitySignalsToPrisma = (
  artifact: ReaderSummaryArtifact,
): Readonly<Record<string, unknown>> => {
  const snapshot = artifact.toSnapshot();

  return jsonObjectForPrisma(
    {
      qualityFlags: snapshot.qualityFlags,
      confidence: snapshot.confidence,
      usage: snapshot.usage,
    },
    "Reader summary quality signals",
  );
};

type PrismaJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly PrismaJsonValue[]
  | { readonly [key: string]: PrismaJsonValue };

const jsonObjectForPrisma = (
  value: unknown,
  path: string,
): Readonly<Record<string, unknown>> => {
  const normalized = jsonValueForPrisma(value, path);
  if (
    normalized === null ||
    typeof normalized !== "object" ||
    Array.isArray(normalized)
  ) {
    throw new Error(`${path} must serialize to a JSON object`);
  }

  return normalized as Readonly<Record<string, unknown>>;
};

const jsonValueForPrisma = (
  value: unknown,
  path: string,
): PrismaJsonValue | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return jsonStringForPrisma(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} must not contain non-finite numbers`);
    }

    return value;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`${path} must not contain invalid dates`);
    }

    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(
      (item, index) => jsonValueForPrisma(item, `${path}[${index}]`) ?? null,
    );
  }
  if (typeof value === "object") {
    const result: Record<string, PrismaJsonValue> = {};

    for (const [key, child] of Object.entries(value)) {
      const normalized = jsonValueForPrisma(child, `${path}.${key}`);
      if (normalized !== undefined) {
        result[jsonStringForPrisma(key)] = normalized;
      }
    }

    return result;
  }

  throw new Error(`${path} contains a value that cannot be serialized as JSON`);
};

const jsonStringForPrisma = (value: string): string => {
  const withoutNullBytes = value.split("\u0000").join("");
  let result = "";

  for (let index = 0; index < withoutNullBytes.length; index += 1) {
    const code = withoutNullBytes.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = withoutNullBytes.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        result +=
          withoutNullBytes.charAt(index) + withoutNullBytes.charAt(index + 1);
        index += 1;
      } else {
        result += "\uFFFD";
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      result += "\uFFFD";
      continue;
    }
    result += withoutNullBytes.charAt(index);
  }

  return result;
};
