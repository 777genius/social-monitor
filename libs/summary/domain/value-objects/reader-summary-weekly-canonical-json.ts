import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

export type ReaderSummaryWeeklyJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly ReaderSummaryWeeklyJsonValue[]
  | Readonly<{ [key: string]: ReaderSummaryWeeklyJsonValue }>;

export const readerSummaryWeeklyCanonicalJsonLimits = Object.freeze({
  maxDepth: 24,
  maxBytes: 1_048_576,
  maxObjectKeys: 64,
  maxTotalObjectKeys: 4_096,
  maxArrayElements: 512,
  maxTotalArrayElements: 4_096,
  maxStringLength: 16_384,
  maxNodes: 6_000,
});

// The exact 369-row recovery artifact needs 5,607 keys at full row shape.
export const readerSummaryProductionRecoveryCanonicalJsonLimits =
  Object.freeze({
    ...readerSummaryWeeklyCanonicalJsonLimits,
    maxTotalObjectKeys: 5_700,
  });

// Historical daily artifacts are sealed provider records with a richer nested
// shape. Keep their verification isolated from model and publication limits.
export const readerSummaryWeeklyHistoricalArtifactCanonicalJsonLimits =
  Object.freeze({
    ...readerSummaryWeeklyCanonicalJsonLimits,
    maxTotalObjectKeys: 12_000,
    maxTotalArrayElements: 5_000,
    maxNodes: 18_000,
  });
export type ReaderSummaryWeeklyCanonicalJson = Readonly<{
  json: string;
  sha256: string;
  byteLength: number;
  toBytes(): Uint8Array;
}>;

export type ReaderSummaryWeeklyManifestScope =
  | Readonly<{ type: "workspace" }>
  | Readonly<{ type: "interest"; interestId: string }>;

export type ReaderSummaryWeeklyDailyPeriod = Readonly<{
  cadence: "daily";
  startedAt: string;
  endedAt: string;
  timezone: "UTC";
  periodKey: string;
}>;

const forbiddenInputFields = new Set([
  "artifactPayloadSha256",
  "blockingPassed",
  "canonicalBytes",
  "canonicalJson",
  "byteLength",
  "dailyCertificationSha256",
  "exactProofSha256",
  "githubAuditSha256",
  "hash",
  "identity",
  "period",
  "periodKey",
  "proofSha256",
  "reportSha256",
  "repositoryIdentity",
  "sha256",
  "sourceContentHash",
  "sourceProviderContentHash",
  "status",
  "verified",
  "toBytes",
  "weekEndedUtcDate",
]);

type TraversalBudget = { objectKeys: number; arrayElements: number; nodes: number };

type CanonicalJsonLimits = Readonly<Record<
  keyof typeof readerSummaryWeeklyCanonicalJsonLimits, number
>>;
type CanonicalWriter = TraversalBudget & {
  readonly parts: string[];
  readonly visited: WeakSet<object>;
  readonly limits: CanonicalJsonLimits;
  byteLength: number;
};

export const canonicalizeReaderSummaryWeeklyJson = (
  value: unknown,
  label = "value",
): ReaderSummaryWeeklyCanonicalJson =>
  canonicalizeReaderSummaryJsonWithLimits(value,
    `Reader summary weekly ${label}`, readerSummaryWeeklyCanonicalJsonLimits);
export const canonicalizeReaderSummaryProductionRecoveryJson = (
  value: unknown,
  label = "evidence",
): ReaderSummaryWeeklyCanonicalJson =>
  canonicalizeReaderSummaryJsonWithLimits(value,
    `Reader summary production recovery ${label}`,
    readerSummaryProductionRecoveryCanonicalJsonLimits);
export const canonicalizeReaderSummaryWeeklyHistoricalArtifactJson = (
  value: unknown,
  label = "historical artifact",
): ReaderSummaryWeeklyCanonicalJson =>
  canonicalizeReaderSummaryJsonWithLimits(
    value,
    `Reader summary weekly ${label}`,
    readerSummaryWeeklyHistoricalArtifactCanonicalJsonLimits,
  );

const canonicalizeReaderSummaryJsonWithLimits = (
  value: unknown,
  path: string,
  limits: CanonicalJsonLimits,
): ReaderSummaryWeeklyCanonicalJson => {
  const writer: CanonicalWriter = {
    parts: [],
    visited: new WeakSet<object>(),
    limits,
    byteLength: 0,
    objectKeys: 0,
    arrayElements: 0,
    nodes: 0,
  };
  writeCanonicalValue(value, path, 0, writer);
  const json = writer.parts.join("");
  const bytes = Buffer.from(json, "utf8");
  if (bytes.byteLength !== writer.byteLength) {
    throw new Error(`${path} byte accounting failed`);
  }
  const sha256 = readerSummaryWeeklySha256(bytes);

  return Object.freeze({
    json,
    sha256,
    byteLength: bytes.byteLength,
    toBytes: (): Uint8Array => Uint8Array.from(bytes),
  });
};

export const readerSummaryWeeklySha256 = (
  value: string | Uint8Array,
): string => createHash("sha256").update(value).digest("hex");

export function assertReaderSummaryWeeklyExactObject<
  TKey extends string,
>(
  value: unknown,
  expectedKeys: readonly TKey[],
  label: string,
  options: Readonly<{ allowAuthoritativeHashes?: boolean }> = {},
): asserts value is Readonly<Record<TKey, unknown>> {
  assertReaderSummaryWeeklyPlainObject(value, label);
  const actualKeys = readerSummaryWeeklyOwnDataKeys(value, label);
  const expected = new Set<string>(expectedKeys);
  const forgedKey = actualKeys.find(
    (key) =>
      forbiddenInputFields.has(key) &&
      !expected.has(key) &&
      options.allowAuthoritativeHashes !== true,
  );
  if (forgedKey !== undefined) {
    throw new Error(
      `Reader summary weekly ${label} must not supply derived field "${forgedKey}"`,
    );
  }
  if (
    actualKeys.length !== expected.size ||
    actualKeys.some((key) => !expected.has(key))
  ) {
    throw new Error(
      `Reader summary weekly ${label} must contain exactly ${expectedKeys.join(", ")}`,
    );
  }
}

export function assertReaderSummaryWeeklyPlainObject(
  value: unknown,
  label: string,
): asserts value is Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`Reader summary weekly ${label} must be a plain object`);
  }
}

export function assertReaderSummaryWeeklyDenseArray(
  value: unknown,
  label: string,
): asserts value is readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Reflect.ownKeys(value).length !== value.length + 1
  ) {
    throw new Error(
      `Reader summary weekly ${label} must be a dense data array`,
    );
  }
  if (value.length > readerSummaryWeeklyCanonicalJsonLimits.maxArrayElements) {
    throw new Error(
      `Reader summary weekly ${label} exceeds the array element limit`,
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, `${index}`);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new Error(
        `Reader summary weekly ${label} must be a dense data array`,
      );
    }
  }
}

export const readerSummaryWeeklyOwnDataKeys = (
  value: Readonly<Record<string, unknown>>,
  label: string,
): readonly string[] =>
  Reflect.ownKeys(value).map((key) => {
    if (typeof key !== "string") {
      throw new Error(
        `Reader summary weekly ${label} must not contain symbol keys`,
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new Error(
        `Reader summary weekly ${label} must contain enumerable data fields only`,
      );
    }
    return key;
  });

export const deepFreezeReaderSummaryWeekly = <TValue>(
  value: TValue,
): TValue => {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreezeReaderSummaryWeekly(child);
    }
    Object.freeze(value);
  }
  return value;
};

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
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value)
  ) {
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
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== value
  ) {
    throw new Error(
      `Reader summary weekly ${label} must use exact ISO UTC form`,
    );
  }
  return value;
};

export const canonicalReaderSummaryWeeklyScope = (
  input: ReaderSummaryWeeklyManifestScope,
): ReaderSummaryWeeklyManifestScope => {
  assertReaderSummaryWeeklyPlainObject(input, "scope");
  if (input.type === "workspace") {
    assertReaderSummaryWeeklyExactObject(input, ["type"], "workspace scope");
    return Object.freeze({ type: "workspace" });
  }
  if (input.type === "interest") {
    assertReaderSummaryWeeklyExactObject(
      input,
      ["type", "interestId"],
      "interest scope",
    );
    return Object.freeze({
      type: "interest",
      interestId: exactReaderSummaryWeeklyIdentity(
        input.interestId,
        "scope interest id",
      ),
    });
  }
  throw new Error("Reader summary weekly scope is invalid");
};

export const readerSummaryWeeklyScopeKey = (
  scope: ReaderSummaryWeeklyManifestScope,
): string =>
  scope.type === "workspace" ? "workspace" : `interest:${scope.interestId}`;

export const readerSummaryWeeklyDailyPeriod = (
  requestedUtcDay: string,
): ReaderSummaryWeeklyDailyPeriod => {
  const day = exactReaderSummaryWeeklyUtcDay(requestedUtcDay);
  const startedAt = `${day}T00:00:00.000Z`;
  const endedAt = new Date(Date.parse(startedAt) + 86_400_000).toISOString();
  return deepFreezeReaderSummaryWeekly({
    cadence: "daily" as const,
    startedAt,
    endedAt,
    timezone: "UTC" as const,
    periodKey: `daily:${startedAt}:${endedAt}:UTC`,
  });
};

export const assertReaderSummaryWeeklyDailyPeriod = (
  input: ReaderSummaryWeeklyDailyPeriod,
  requestedUtcDay: string,
  label: string,
): void => {
  assertReaderSummaryWeeklyExactObject(
    input,
    ["cadence", "startedAt", "endedAt", "timezone", "periodKey"],
    `${label} period`,
  );
  const expected = readerSummaryWeeklyDailyPeriod(requestedUtcDay);
  if (
    input.cadence !== expected.cadence ||
    input.startedAt !== expected.startedAt ||
    input.endedAt !== expected.endedAt ||
    input.timezone !== expected.timezone ||
    input.periodKey !== expected.periodKey
  ) {
    throw new Error(
      `Reader summary weekly ${label} period does not bind requested UTC day`,
    );
  }
};

const writeCanonicalValue = (
  value: unknown,
  path: string,
  depth: number,
  writer: CanonicalWriter,
): void => {
  writer.nodes += 1;
  if (writer.nodes > writer.limits.maxNodes) {
    throw new Error(`${path} exceeds the JSON node limit`);
  }
  if (depth > writer.limits.maxDepth) {
    throw new Error(`${path} exceeds the JSON depth limit`);
  }
  if (value === null || typeof value === "boolean") {
    appendCanonicalChunk(JSON.stringify(value), path, writer);
    return;
  }
  if (typeof value === "string") {
    if (
      value.length >
      writer.limits.maxStringLength
    ) {
      throw new Error(`${path} exceeds the string length limit`);
    }
    appendCanonicalChunk(JSON.stringify(value), path, writer);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error(`${path} must contain unambiguous finite numbers`);
    }
    appendCanonicalChunk(JSON.stringify(value), path, writer);
    return;
  }
  if (Array.isArray(value)) {
    assertReaderSummaryWeeklyDenseArray(value, path);
    assertUnvisited(value, path, writer.visited);
    writer.arrayElements += value.length;
    if (
      writer.arrayElements >
      writer.limits.maxTotalArrayElements
    ) {
      throw new Error(`${path} exceeds the total array element limit`);
    }
    appendCanonicalChunk("[", path, writer);
    value.forEach((item, index) => {
      if (index > 0) {
        appendCanonicalChunk(",", path, writer);
      }
      writeCanonicalValue(item, `${path}[${index}]`, depth + 1, writer);
    });
    appendCanonicalChunk("]", path, writer);
    return;
  }
  assertReaderSummaryWeeklyPlainObject(value, path);
  assertUnvisited(value, path, writer.visited);
  const keys = readerSummaryWeeklyOwnDataKeys(value, path);
  if (keys.length > writer.limits.maxObjectKeys) {
    throw new Error(`${path} exceeds the object key limit`);
  }
  writer.objectKeys += keys.length;
  if (
    writer.objectKeys >
    writer.limits.maxTotalObjectKeys
  ) {
    throw new Error(`${path} exceeds the total object key limit`);
  }
  appendCanonicalChunk("{", path, writer);
  [...keys].sort(lexicalCompare).forEach((key, index) => {
    if (
      key.length > writer.limits.maxStringLength
    ) {
      throw new Error(`${path} has an object key above the string limit`);
    }
    if (index > 0) {
      appendCanonicalChunk(",", path, writer);
    }
    appendCanonicalChunk(JSON.stringify(key), path, writer);
    appendCanonicalChunk(":", path, writer);
    writeCanonicalValue(
      value[key], `${path}.${key}`, depth + 1, writer,
    );
  });
  appendCanonicalChunk("}", path, writer);
};

const appendCanonicalChunk = (
  chunk: string,
  path: string,
  writer: CanonicalWriter,
): void => {
  const nextByteLength = writer.byteLength + Buffer.byteLength(chunk, "utf8");
  if (nextByteLength > writer.limits.maxBytes) {
    throw new Error(`${path} exceeds the canonical byte limit`);
  }
  writer.parts.push(chunk);
  writer.byteLength = nextByteLength;
};

const assertUnvisited = (
  value: object,
  path: string,
  visited: WeakSet<object>,
): void => {
  if (visited.has(value)) {
    throw new Error(`${path} must not contain repeated or circular objects`);
  }
  visited.add(value);
};

const lexicalCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
