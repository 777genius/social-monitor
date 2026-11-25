import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
} from "../value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyCanonicalProviderKeys,
  type ReaderSummaryWeeklyCanonicalProviderKey,
} from "../value-objects/reader-summary-weekly-daily-certification";
import {
  assertReaderSummaryWeeklyStoryAuthorityBinding,
  type ReaderSummaryWeeklyStoryAuthorityBinding,
  type ReaderSummaryWeeklyStoryAuthorityEvidence,
} from "../value-objects/reader-summary-weekly-story-authority";
import {
  assertReaderSummaryWeeklyCanonicalStoryIdentity,
  deriveReaderSummaryWeeklyStoryIdentity,
  readerSummaryWeeklyStoryIdentityBinding,
  type ReaderSummaryWeeklyCanonicalStoryIdentity,
  type ReaderSummaryWeeklyStoryIdentityBinding,
} from "../value-objects/reader-summary-weekly-story-identity";

export const readerSummaryWeeklyStoryObservationSchemaVersion =
  "reader_summary.weekly_story_observation.v1" as const;
export const readerSummaryWeeklyStoryDateKeySchemaVersion =
  "reader_summary.weekly_story_date_key.v1" as const;

export type ReaderSummaryWeeklyStoryEvidenceSelector = Readonly<{
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey;
  citationId: string;
  sourceItemId: string;
  sourceContentHash: string;
}>;

export type ReaderSummaryWeeklyStoryObservationInput = Readonly<{
  storyIdentity: ReaderSummaryWeeklyCanonicalStoryIdentity;
  authority: ReaderSummaryWeeklyStoryAuthorityBinding;
  evidence: readonly ReaderSummaryWeeklyStoryEvidenceSelector[];
}>;

type ReaderSummaryWeeklyStoryObservationBody = Readonly<{
  schemaVersion: typeof readerSummaryWeeklyStoryObservationSchemaVersion;
  uniquenessKey: string;
  story: ReaderSummaryWeeklyStoryIdentityBinding;
  authority: ReaderSummaryWeeklyStoryAuthorityBinding;
  observedUtcDate: string;
  evidence: readonly ReaderSummaryWeeklyStoryAuthorityEvidence[];
}>;

export type ReaderSummaryWeeklyCanonicalStoryObservation =
  ReaderSummaryWeeklyStoryObservationBody &
    Readonly<{
      identity: string;
      sha256: string;
      canonicalJson: string;
      byteLength: number;
      toBytes(): Uint8Array;
    }>;

const observationInputKeys = [
  "storyIdentity",
  "authority",
  "evidence",
] as const;
const selectorKeys = [
  "providerKey",
  "citationId",
  "sourceItemId",
  "sourceContentHash",
] as const;
const canonicalObservationKeys = [
  "schemaVersion",
  "uniquenessKey",
  "story",
  "authority",
  "observedUtcDate",
  "evidence",
  "identity",
  "sha256",
  "canonicalJson",
  "byteLength",
  "toBytes",
] as const;

export const readerSummaryWeeklyStoryDateKey = (
  storyIdentity: ReaderSummaryWeeklyCanonicalStoryIdentity,
  requestedUtcDate: string,
): string => {
  assertReaderSummaryWeeklyCanonicalStoryIdentity(storyIdentity);
  const body = {
    schemaVersion: readerSummaryWeeklyStoryDateKeySchemaVersion,
    storyIdentity: storyIdentity.identity,
    requestedUtcDate: exactReaderSummaryWeeklyUtcDay(requestedUtcDate),
  };
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "story date uniqueness key",
  );
  return `${readerSummaryWeeklyStoryDateKeySchemaVersion}:${canonical.sha256}`;
};

export const observeReaderSummaryWeeklyStory = (
  input: ReaderSummaryWeeklyStoryObservationInput,
  existingObservations: readonly ReaderSummaryWeeklyCanonicalStoryObservation[],
): ReaderSummaryWeeklyCanonicalStoryObservation => {
  assertReaderSummaryWeeklyExactObject(
    input,
    observationInputKeys,
    "story observation input",
  );
  assertReaderSummaryWeeklyCanonicalStoryIdentity(input.storyIdentity);
  const story = readerSummaryWeeklyStoryIdentityBinding(input.storyIdentity);
  assertReaderSummaryWeeklyStoryAuthorityBinding(input.authority);
  const authority = input.authority;
  if (authority.semanticStatus !== "COMPLETED") {
    throw new Error(
      "Reader summary weekly story observation requires a completed daily publication",
    );
  }
  const evidence = selectSameDayEvidence(authority, input.evidence);
  const body = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyStoryObservationSchemaVersion,
    uniquenessKey: readerSummaryWeeklyStoryDateKey(
      input.storyIdentity,
      authority.requestedUtcDate,
    ),
    story,
    authority,
    observedUtcDate: authority.requestedUtcDate,
    evidence,
  });
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "story observation",
  );
  const observation = deepFreezeReaderSummaryWeekly({
    ...body,
    identity: `${readerSummaryWeeklyStoryObservationSchemaVersion}:${canonical.sha256}`,
    sha256: canonical.sha256,
    canonicalJson: canonical.json,
    byteLength: canonical.byteLength,
    toBytes: (): Uint8Array => canonical.toBytes(),
  });
  assertReaderSummaryWeeklyStoryObservationUniqueness([
    ...existingObservations,
    observation,
  ]);
  return observation;
};

export const observeReaderSummaryWeeklyStories = (
  inputs: readonly ReaderSummaryWeeklyStoryObservationInput[],
): readonly ReaderSummaryWeeklyCanonicalStoryObservation[] => {
  assertReaderSummaryWeeklyDenseArray(inputs, "story observation inputs");
  const observations: ReaderSummaryWeeklyCanonicalStoryObservation[] = [];
  for (const input of inputs) {
    observations.push(
      observeReaderSummaryWeeklyStory(input, observations),
    );
  }
  return deepFreezeReaderSummaryWeekly(observations);
};

export const assertReaderSummaryWeeklyStoryObservationUniqueness = (
  observations: readonly ReaderSummaryWeeklyCanonicalStoryObservation[],
): void => {
  assertReaderSummaryWeeklyDenseArray(
    observations,
    "canonical story observations",
  );
  observations.forEach(assertCanonicalStoryObservation);
  const keys = observations.map((observation) => observation.uniquenessKey);
  if (new Set(keys).size !== keys.length) {
    throw new Error(
      "Reader summary weekly story already has an observation for the requested UTC date",
    );
  }
};

const assertCanonicalStoryObservation = (
  observation: ReaderSummaryWeeklyCanonicalStoryObservation,
): void => {
  assertReaderSummaryWeeklyExactObject(
    observation,
    canonicalObservationKeys,
    "canonical story observation",
    { allowAuthoritativeHashes: true },
  );
  const storyIdentity = deriveReaderSummaryWeeklyStoryIdentity({
    subjectKey: observation.story.subjectKey,
    actionKey: observation.story.actionKey,
    objectKeys: observation.story.objectKeys,
    qualifierKeys: observation.story.qualifierKeys,
  });
  const expectedStory = readerSummaryWeeklyStoryIdentityBinding(storyIdentity);
  if (
    canonicalizeReaderSummaryWeeklyJson(observation.story).json !==
    canonicalizeReaderSummaryWeeklyJson(expectedStory).json
  ) {
    throw new Error(
      "Reader summary weekly story observation has an invalid stable story binding",
    );
  }
  assertReaderSummaryWeeklyStoryAuthorityBinding(observation.authority);
  const observedUtcDate = exactReaderSummaryWeeklyUtcDay(
    observation.observedUtcDate,
  );
  if (observedUtcDate !== observation.authority.requestedUtcDate) {
    throw new Error(
      "Reader summary weekly story observation cannot invent chronology or a cross-day transition",
    );
  }
  const evidence = selectSameDayEvidence(
    observation.authority,
    observation.evidence.map((item) => ({
      providerKey: item.providerKey,
      citationId: item.citationId,
      sourceItemId: item.sourceItemId,
      sourceContentHash: item.sourceContentHash,
    })),
  );
  const body = {
    schemaVersion: readerSummaryWeeklyStoryObservationSchemaVersion,
    uniquenessKey: readerSummaryWeeklyStoryDateKey(
      storyIdentity,
      observedUtcDate,
    ),
    story: expectedStory,
    authority: observation.authority,
    observedUtcDate,
    evidence,
  };
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "story observation",
  );
  const bytes = observation.toBytes();
  if (
    observation.schemaVersion !==
      readerSummaryWeeklyStoryObservationSchemaVersion ||
    observation.uniquenessKey !== body.uniquenessKey ||
    observation.identity !==
      `${readerSummaryWeeklyStoryObservationSchemaVersion}:${canonical.sha256}` ||
    observation.sha256 !== canonical.sha256 ||
    observation.canonicalJson !== canonical.json ||
    observation.byteLength !== canonical.byteLength ||
    !(bytes instanceof Uint8Array) ||
    Buffer.from(bytes).compare(Buffer.from(canonical.toBytes())) !== 0
  ) {
    throw new Error(
      "Reader summary weekly canonical story observation seal is invalid",
    );
  }
};

const selectSameDayEvidence = (
  authority: ReaderSummaryWeeklyStoryAuthorityBinding,
  input: readonly ReaderSummaryWeeklyStoryEvidenceSelector[],
): readonly ReaderSummaryWeeklyStoryAuthorityEvidence[] => {
  assertReaderSummaryWeeklyDenseArray(input, "story evidence selectors");
  if (input.length === 0 || input.length > 64) {
    throw new Error(
      "Reader summary weekly story observation requires bounded same-day evidence",
    );
  }
  const selectors = input.map(canonicalSelector);
  const selectorIdentities = selectors.map(
    (selector) =>
      canonicalizeReaderSummaryWeeklyJson(
        selector,
        "story evidence selector",
      ).json,
  );
  if (new Set(selectorIdentities).size !== selectors.length) {
    throw new Error(
      "Reader summary weekly story evidence selection is ambiguous",
    );
  }

  const selected = selectors.map((selector) => {
    const matches = authority.evidence.filter(
      (candidate) =>
        candidate.providerKey === selector.providerKey &&
        candidate.citationId === selector.citationId &&
        candidate.sourceItemId === selector.sourceItemId &&
        candidate.sourceContentHash === selector.sourceContentHash,
    );
    if (matches.length !== 1) {
      throw new Error(
        "Reader summary weekly story evidence does not bind exact sealed publication provider, citation and source identities",
      );
    }
    const match = matches[0]!;
    if (
      match.observedAt.slice(0, 10) !== authority.requestedUtcDate ||
      Date.parse(match.publishedAt) > Date.parse(match.observedAt)
    ) {
      throw new Error(
        "Reader summary weekly story observation cannot invent chronology or a cross-day transition",
      );
    }
    return deepFreezeReaderSummaryWeekly({ ...match });
  });
  assertSelectedEvidenceUniqueness(selected);
  return deepFreezeReaderSummaryWeekly(
    [...selected].sort(compareSelectedEvidence),
  );
};

const canonicalSelector = (
  input: ReaderSummaryWeeklyStoryEvidenceSelector,
): ReaderSummaryWeeklyStoryEvidenceSelector => {
  assertReaderSummaryWeeklyExactObject(
    input,
    selectorKeys,
    "story evidence selector",
    { allowAuthoritativeHashes: true },
  );
  if (!readerSummaryWeeklyCanonicalProviderKeys.includes(input.providerKey)) {
    throw new Error(
      "Reader summary weekly story evidence provider is not canonical",
    );
  }
  return deepFreezeReaderSummaryWeekly({
    providerKey: input.providerKey,
    citationId: exactReaderSummaryWeeklyIdentity(
      input.citationId,
      "selected story citation id",
    ),
    sourceItemId: exactReaderSummaryWeeklyIdentity(
      input.sourceItemId,
      "selected story source item id",
    ),
    sourceContentHash: exactReaderSummaryWeeklySha256(
      input.sourceContentHash,
      "selected story source content hash",
    ),
  });
};

const assertSelectedEvidenceUniqueness = (
  evidence: readonly ReaderSummaryWeeklyStoryAuthorityEvidence[],
): void => {
  for (const values of [
    evidence.map((item) => item.citationId),
    evidence.map((item) => item.sourceItemId),
    evidence.map((item) => `${item.providerKey}\u0000${item.providerItemId}`),
  ]) {
    if (new Set(values).size !== values.length) {
      throw new Error(
        "Reader summary weekly story observation has ambiguous same-day evidence",
      );
    }
  }
};

const compareSelectedEvidence = (
  left: ReaderSummaryWeeklyStoryAuthorityEvidence,
  right: ReaderSummaryWeeklyStoryAuthorityEvidence,
): number =>
  readerSummaryWeeklyCanonicalProviderKeys.indexOf(left.providerKey) -
    readerSummaryWeeklyCanonicalProviderKeys.indexOf(right.providerKey) ||
  lexicalCompare(left.sourceItemId, right.sourceItemId) ||
  lexicalCompare(left.citationId, right.citationId);

const lexicalCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
