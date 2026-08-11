import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
} from "./reader-summary-weekly-canonical-json";

export const readerSummaryWeeklyStoryIdentitySchemaVersion =
  "reader_summary.weekly_story_identity.v1" as const;

export type ReaderSummaryWeeklyReviewedStorySemantics = Readonly<{
  subjectKey: string;
  actionKey: string;
  objectKeys: readonly string[];
  qualifierKeys: readonly string[];
}>;

type ReaderSummaryWeeklyStoryIdentityBody =
  ReaderSummaryWeeklyReviewedStorySemantics &
    Readonly<{
      schemaVersion: typeof readerSummaryWeeklyStoryIdentitySchemaVersion;
    }>;

export type ReaderSummaryWeeklyStoryIdentityBinding =
  ReaderSummaryWeeklyStoryIdentityBody &
    Readonly<{
      identity: string;
      sha256: string;
    }>;

export type ReaderSummaryWeeklyCanonicalStoryIdentity =
  ReaderSummaryWeeklyStoryIdentityBinding &
    Readonly<{
      canonicalJson: string;
      byteLength: number;
      toBytes(): Uint8Array;
    }>;

const reviewedSemanticKeys = [
  "subjectKey",
  "actionKey",
  "objectKeys",
  "qualifierKeys",
] as const;
const identityKeys = [
  "schemaVersion",
  ...reviewedSemanticKeys,
  "identity",
  "sha256",
  "canonicalJson",
  "byteLength",
  "toBytes",
] as const;
const semanticKeyPattern = /^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/u;
const temporalSemanticSegment =
  /(?:^|[._:/-])(?:chronology|date|day|first-seen|last-seen|observed-at|published-at|resolution|resolved-at|sealed-at|timestamp|transition|utc|week|weekly)(?:$|[._:/-])/u;
const utcDateFragment = /\d{4}-\d{2}-\d{2}/u;

export const deriveReaderSummaryWeeklyStoryIdentity = (
  input: ReaderSummaryWeeklyReviewedStorySemantics,
): ReaderSummaryWeeklyCanonicalStoryIdentity => {
  assertReaderSummaryWeeklyExactObject(
    input,
    reviewedSemanticKeys,
    "story reviewed semantics",
  );
  const subjectKey = exactSemanticKey(input.subjectKey, "subject key");
  const actionKey = exactSemanticKey(input.actionKey, "action key");
  const objectKeys = canonicalSemanticKeys(input.objectKeys, "object keys");
  const qualifierKeys = canonicalSemanticKeys(
    input.qualifierKeys,
    "qualifier keys",
  );
  assertNoSemanticCollisions([
    subjectKey,
    actionKey,
    ...objectKeys,
    ...qualifierKeys,
  ]);

  const body = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyStoryIdentitySchemaVersion,
    subjectKey,
    actionKey,
    objectKeys,
    qualifierKeys,
  });
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "story semantic identity",
  );
  return deepFreezeReaderSummaryWeekly({
    ...body,
    identity: `${readerSummaryWeeklyStoryIdentitySchemaVersion}:${canonical.sha256}`,
    sha256: canonical.sha256,
    canonicalJson: canonical.json,
    byteLength: canonical.byteLength,
    toBytes: (): Uint8Array => canonical.toBytes(),
  });
};

export function assertReaderSummaryWeeklyCanonicalStoryIdentity(
  input: unknown,
): asserts input is ReaderSummaryWeeklyCanonicalStoryIdentity {
  assertReaderSummaryWeeklyExactObject(
    input,
    identityKeys,
    "canonical story identity",
    { allowAuthoritativeHashes: true },
  );
  const identity =
    input as unknown as ReaderSummaryWeeklyCanonicalStoryIdentity;
  const expected = deriveReaderSummaryWeeklyStoryIdentity({
    subjectKey: identity.subjectKey,
    actionKey: identity.actionKey,
    objectKeys: identity.objectKeys,
    qualifierKeys: identity.qualifierKeys,
  });
  const bytes = identity.toBytes();
  if (
    identity.schemaVersion !== readerSummaryWeeklyStoryIdentitySchemaVersion ||
    identity.identity !== expected.identity ||
    identity.sha256 !== expected.sha256 ||
    identity.canonicalJson !== expected.canonicalJson ||
    identity.byteLength !== expected.byteLength ||
    !(bytes instanceof Uint8Array) ||
    Buffer.from(bytes).compare(Buffer.from(expected.toBytes())) !== 0
  ) {
    throw new Error(
      "Reader summary weekly canonical story identity seal is invalid",
    );
  }
}

export const readerSummaryWeeklyStoryIdentityBinding = (
  identity: ReaderSummaryWeeklyCanonicalStoryIdentity,
): ReaderSummaryWeeklyStoryIdentityBinding => {
  assertReaderSummaryWeeklyCanonicalStoryIdentity(identity);
  return deepFreezeReaderSummaryWeekly({
    schemaVersion: identity.schemaVersion,
    subjectKey: identity.subjectKey,
    actionKey: identity.actionKey,
    objectKeys: [...identity.objectKeys],
    qualifierKeys: [...identity.qualifierKeys],
    identity: identity.identity,
    sha256: identity.sha256,
  });
};

const exactSemanticKey = (input: unknown, label: string): string => {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > 256 ||
    !semanticKeyPattern.test(input) ||
    temporalSemanticSegment.test(input) ||
    utcDateFragment.test(input)
  ) {
    throw new Error(
      `Reader summary weekly story ${label} is not a stable canonical semantic key`,
    );
  }
  return input;
};

const canonicalSemanticKeys = (
  input: readonly string[],
  label: string,
): readonly string[] => {
  assertReaderSummaryWeeklyDenseArray(input, `story ${label}`);
  if (input.length > 32) {
    throw new Error(`Reader summary weekly story ${label} is not bounded`);
  }
  const values = input.map((value) => exactSemanticKey(value, label));
  if (new Set(values).size !== values.length) {
    throw new Error(`Reader summary weekly story ${label} is ambiguous`);
  }
  return deepFreezeReaderSummaryWeekly([...values].sort(lexicalCompare));
};

const assertNoSemanticCollisions = (values: readonly string[]): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(
      "Reader summary weekly story identity has a semantic role collision",
    );
  }
};

const lexicalCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
