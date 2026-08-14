import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  canonicalReaderSummaryWeeklyScope,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
} from "../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyCanonicalProviderKeys,
  type ReaderSummaryWeeklyCanonicalProviderKey,
} from "../domain/value-objects/reader-summary-weekly-daily-certification";
import {
  assertReaderSummaryWeeklySealedInputManifest,
  readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
  readerSummaryWeeklyInputManifestSchemaVersion,
  type ReaderSummaryWeeklySealedInputManifest,
} from "../domain/value-objects/reader-summary-weekly-input-manifest";
import {
  readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
} from "../domain/value-objects/reader-summary-weekly-publication-github-evidence";
import {
  readerSummaryWeeklyClaimTypes,
  readerSummaryWeeklyModelInputSchemaVersion,
  type ReaderSummaryWeeklyClaimType,
  type ReaderSummaryWeeklyModelCitation,
  type ReaderSummaryWeeklyModelCitationEvidence,
  type ReaderSummaryWeeklyModelDay,
  type ReaderSummaryWeeklyModelEvidenceInput,
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelObservation,
  type ReaderSummaryWeeklyModelObservationEvidence,
  type ReaderSummaryWeeklyModelProviderCount,
  type ReaderSummaryWeeklyModelStory,
  type ReaderSummaryWeeklyModelStoryEvidence,
} from "./reader-summary-weekly-model-contract";

export * from "./reader-summary-weekly-model-contract";
const modelInputKeys = ["schemaVersion", "sealId", "sealSha",
  "manifestSealId", "manifestSealSha", "tenantId", "workspaceId", "scope",
  "weekStartedOn", "weekEndedOn", "days", "stories", "observations",
  "citations"] as const;
const readerSummaryWeeklyCertificationSealSchemaVersion =
  "reader_summary.weekly_certification_seal.v1" as const;
const acceptedManifestSealSchemaVersions = Object.freeze([
  readerSummaryWeeklyInputManifestSchemaVersion,
  readerSummaryWeeklyCertificationSealSchemaVersion,
]);
const modelInputBodyKeys = modelInputKeys.filter((key) =>
  key !== "sealId" && key !== "sealSha",
) as readonly Exclude<(typeof modelInputKeys)[number], "sealId" | "sealSha">[];
const dayKeys = ["date", "dailyCertificationId", "dailyCertificationSha",
  "dailyCertificationStatus", "githubBoardId", "githubBoardSha",
  "githubBoardStatus",
  "providerCounts"] as const;
const historicalDayKeys = [
  "date", "dailyCertificationId", "dailyCertificationSha",
  "dailyCertificationStatus", "githubBoardId", "githubBoardSha",
  "githubBoardStatus", "githubAuthorizationIdentity", "providerCounts",
] as const;
const storyKeys = ["storyId", "label"] as const;
const observationKeys = ["observationId", "storyId", "observedOn",
  "providerKey", "text", "claimSupport", "citationIds",
  "dailyCertificationId", "dailyCertificationSha", "sourceSha256"] as const;
const citationKeys = ["citationId", "observationId", "storyId", "observedOn",
  "providerKey", "title", "canonicalUrl", "dailyCertificationId",
  "dailyCertificationSha", "sourceSha256"] as const;
export const sealReaderSummaryWeeklyModelInput = (
  input: ReaderSummaryWeeklyModelEvidenceInput,
): ReaderSummaryWeeklyModelInput => {
  assertReaderSummaryWeeklySealedInputManifest(input.manifest);
  assertReaderSummaryWeeklyDenseArray(input.stories, "weekly model stories");
  assertReaderSummaryWeeklyDenseArray(
    input.observations, "weekly model observations");
  assertReaderSummaryWeeklyDenseArray(input.citations, "weekly model citations");
  const days = modelDays(input.manifest);
  assertModelDays(days, input.manifest.weekStartedUtcDate);
  const stories = input.stories.map(canonicalStory).sort(by("storyId"));
  const observations = input.observations
    .map((item) => canonicalObservation(item, days)).sort(by("observationId"));
  const citations = input.citations
    .map((item) => canonicalCitation(item, days, input.manifest))
    .sort(by("citationId"));
  assertEvidenceGraph(stories, observations, citations);
  const body = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyModelInputSchemaVersion,
    manifestSealId: input.manifest.identity,
    manifestSealSha: input.manifest.sha256,
    tenantId: input.manifest.tenantId, workspaceId: input.manifest.workspaceId,
    scope: input.manifest.scope,
    weekStartedOn: input.manifest.weekStartedUtcDate,
    weekEndedOn: input.manifest.weekEndedUtcDate,
    days, stories, observations, citations,
  });
  const sealSha =
    canonicalizeReaderSummaryWeeklyJson(body, "weekly model input").sha256;
  return deepFreezeReaderSummaryWeekly({
    ...body,
    sealId: `${readerSummaryWeeklyModelInputSchemaVersion}:${sealSha}`,
    sealSha,
  });
};
export function assertReaderSummaryWeeklyModelInput(
  input: unknown,
): asserts input is ReaderSummaryWeeklyModelInput {
  canonicalizeReaderSummaryWeeklyJson(input, "sealed weekly model input");
  assertReaderSummaryWeeklyExactObject(input, modelInputKeys,
    "sealed weekly model input", { allowAuthoritativeHashes: true });
  const model = input as unknown as ReaderSummaryWeeklyModelInput;
  if (model.schemaVersion !== readerSummaryWeeklyModelInputSchemaVersion) {
    throw new Error("Reader summary weekly model input schema is invalid");
  }
  const weekStartedOn = exactReaderSummaryWeeklyUtcDay(model.weekStartedOn);
  if (new Date(`${weekStartedOn}T00:00:00.000Z`).getUTCDay() !== 1 ||
      utcDayAfter(weekStartedOn, 6) !==
        exactReaderSummaryWeeklyUtcDay(model.weekEndedOn)) {
    throw new Error("Reader summary weekly model input must be Monday-Sunday");
  }
  const days = assertModelDays(model.days, weekStartedOn);
  const stories = canonicalModelArray(
    model.stories, canonicalStory, "storyId", "model stories");
  const observations = canonicalModelArray(
    model.observations, (item) => canonicalObservation(item, days),
    "observationId", "model observations");
  const citations = canonicalModelArray(
    model.citations, (item) => canonicalCitation(item, days),
    "citationId", "model citations");
  assertEvidenceGraph(stories, observations, citations);
  exactReaderSummaryWeeklyIdentity(model.tenantId, "tenant id");
  exactReaderSummaryWeeklyIdentity(model.workspaceId, "workspace id");
  canonicalReaderSummaryWeeklyScope(model.scope);
  const manifestSha =
    exactReaderSummaryWeeklySha256(model.manifestSealSha, "manifest seal");
  if (!acceptedManifestSealSchemaVersions.some(
    (schemaVersion) =>
      model.manifestSealId === `${schemaVersion}:${manifestSha}`,
  )) {
    throw new Error("Reader summary weekly manifest seal is invalid");
  }
  const body = Object.fromEntries(
    modelInputBodyKeys.map((key) => [key, model[key]]));
  const expected =
    canonicalizeReaderSummaryWeeklyJson(body, "model input body").sha256;
  if (exactReaderSummaryWeeklySha256(model.sealSha, "model input seal") !==
      expected ||
      model.sealId !== `${readerSummaryWeeklyModelInputSchemaVersion}:${expected}`) {
    throw new Error("Reader summary weekly model input seal is invalid");
  }
}
const canonicalStory = (
  input: ReaderSummaryWeeklyModelStoryEvidence,
): ReaderSummaryWeeklyModelStory => {
  assertReaderSummaryWeeklyExactObject(input, storyKeys, "weekly model story");
  const storyId = exactReaderSummaryWeeklyIdentity(input.storyId, "story id");
  if (!/^story:[a-z0-9][a-z0-9._:-]{1,158}$/u.test(storyId)) {
    throw new Error("Reader summary weekly story id is not stable");
  }
  return deepFreezeReaderSummaryWeekly({
    storyId, label: exactText(input.label, "story label", 180),
  });
};
const canonicalObservation = (
  input: ReaderSummaryWeeklyModelObservationEvidence,
  days: readonly ReaderSummaryWeeklyModelDay[],
): ReaderSummaryWeeklyModelObservation => {
  assertReaderSummaryWeeklyExactObject(input, observationKeys,
    "weekly model observation", { allowAuthoritativeHashes: true });
  assertReaderSummaryWeeklyDenseArray(
    input.claimSupport, "observation claim support");
  assertReaderSummaryWeeklyDenseArray(
    input.citationIds, "observation citation ids");
  const day = boundDay(input, days, "observation");
  const claimSupport = input.claimSupport.map(exactClaimType).sort(
    (left, right) => readerSummaryWeeklyClaimTypes.indexOf(left) -
      readerSummaryWeeklyClaimTypes.indexOf(right));
  const citationIds = input.citationIds.map((id) =>
    exactReaderSummaryWeeklyIdentity(id, "observation citation id")).sort();
  if (!claimSupport.includes("snapshot") || citationIds.length === 0) {
    throw new Error(
      "Reader summary weekly observation must be cited snapshot evidence");
  }
  assertUnique(claimSupport, "observation claim support");
  assertUnique(citationIds, "observation citation ids");
  const providerKey = exactProviderKey(input.providerKey);
  assertProviderHasCertifiedEvidence(day, providerKey);
  return deepFreezeReaderSummaryWeekly({
    observationId: exactReaderSummaryWeeklyIdentity(
      input.observationId, "observation id"),
    storyId: exactReaderSummaryWeeklyIdentity(input.storyId, "story id"),
    observedOn: day.date, providerKey,
    text: exactText(input.text, "observation text", 4_000),
    claimSupport, citationIds,
    dailyCertificationId: day.dailyCertificationId,
    dailyCertificationSha: day.dailyCertificationSha,
    sourceSha256: exactReaderSummaryWeeklySha256(
      input.sourceSha256, "observation source hash"),
  });
};
const canonicalCitation = (
  input: ReaderSummaryWeeklyModelCitationEvidence,
  days: readonly ReaderSummaryWeeklyModelDay[],
  manifest?: ReaderSummaryWeeklySealedInputManifest,
): ReaderSummaryWeeklyModelCitation => {
  assertReaderSummaryWeeklyExactObject(input, citationKeys,
    "weekly model citation", { allowAuthoritativeHashes: true });
  const day = boundDay(input, days, "citation");
  const providerKey = exactProviderKey(input.providerKey);
  const sourceSha256 = exactReaderSummaryWeeklySha256(
    input.sourceSha256, "citation source hash");
  const canonicalUrl = exactHttpsUrl(input.canonicalUrl);
  assertProviderHasCertifiedEvidence(day, providerKey);
  if (manifest !== undefined && providerKey === "github-trending-page") {
    assertVerifiedGitHubCitation(
      manifest, day.date, canonicalUrl, sourceSha256);
  }
  return deepFreezeReaderSummaryWeekly({
    citationId: exactReaderSummaryWeeklyIdentity(
      input.citationId, "citation id"),
    observationId: exactReaderSummaryWeeklyIdentity(
      input.observationId, "citation observation id"),
    storyId: exactReaderSummaryWeeklyIdentity(input.storyId, "story id"),
    observedOn: day.date, providerKey,
    title: exactText(input.title, "citation title", 240), canonicalUrl,
    dailyCertificationId: day.dailyCertificationId,
    dailyCertificationSha: day.dailyCertificationSha, sourceSha256,
  });
};
const assertEvidenceGraph = (
  stories: readonly ReaderSummaryWeeklyModelStory[],
  observations: readonly ReaderSummaryWeeklyModelObservation[],
  citations: readonly ReaderSummaryWeeklyModelCitation[],
): void => {
  assertUnique(stories.map((item) => item.storyId), "story ids");
  assertUnique(observations.map((item) => item.observationId), "observation ids");
  assertUnique(citations.map((item) => item.citationId), "citation ids");
  const storyIds = new Set(stories.map((item) => item.storyId));
  const observationById = new Map(
    observations.map((item) => [item.observationId, item] as const));
  const citationById = new Map(
    citations.map((item) => [item.citationId, item] as const));
  for (const observation of observations) {
    if (!storyIds.has(observation.storyId) ||
        observation.citationIds.some((id) => {
          const citation = citationById.get(id);
          return citation === undefined ||
            !sameEvidenceAuthority(observation, citation);
        })) {
      throw new Error("Reader summary weekly observation binding is invalid");
    }
  }
  for (const citation of citations) {
    const observation = observationById.get(citation.observationId);
    if (!storyIds.has(citation.storyId) || observation === undefined ||
        !observation.citationIds.includes(citation.citationId) ||
        !sameEvidenceAuthority(observation, citation)) {
      throw new Error("Reader summary weekly citation binding is invalid");
    }
  }
  if (stories.length === 0 || observations.length === 0 ||
      citations.length === 0 || stories.some((story) =>
        !observations.some((item) => item.storyId === story.storyId))) {
    throw new Error("Reader summary weekly model evidence is incomplete");
  }
};
const sameEvidenceAuthority = (
  observation: ReaderSummaryWeeklyModelObservation,
  citation: ReaderSummaryWeeklyModelCitation,
): boolean =>
  observation.storyId === citation.storyId &&
  observation.observedOn === citation.observedOn &&
  observation.providerKey === citation.providerKey &&
  observation.dailyCertificationId === citation.dailyCertificationId &&
  observation.dailyCertificationSha === citation.dailyCertificationSha &&
  observation.sourceSha256 === citation.sourceSha256;
const modelDays = (
  manifest: ReaderSummaryWeeklySealedInputManifest,
): readonly ReaderSummaryWeeklyModelDay[] =>
  deepFreezeReaderSummaryWeekly(manifest.days.map((entry) => {
    const day = {
      date: entry.requestedUtcDate,
      dailyCertificationId: entry.dailyCertification.identity,
      dailyCertificationSha: entry.dailyCertification.sha256,
      dailyCertificationStatus: entry.dailyCertification.status,
      githubBoardId: entry.githubAudit.identity,
      githubBoardSha: entry.githubAudit.sha256,
      githubBoardStatus: entry.githubAudit.status,
      providerCounts: entry.dailyCertification.providerCounts,
    };
    return entry.githubAudit.status === "historical_unavailable"
      ? {
          ...day,
          date: entry.requestedUtcDate,
          githubBoardStatus: "historical_unavailable" as const,
          githubAuthorizationIdentity:
            entry.githubAudit.authorizationIdentity,
        }
      : {
          ...day,
          githubBoardStatus: "verified" as const,
        };
  }));
const assertModelDays = (
  input: readonly ReaderSummaryWeeklyModelDay[],
  weekStartedOn: string,
): readonly ReaderSummaryWeeklyModelDay[] => {
  assertReaderSummaryWeeklyDenseArray(input, "weekly model days");
  if (input.length !== 7) {
    throw new Error("Reader summary weekly model input requires 7/7 days");
  }
  input.forEach((day, index) => {
    if (day.date !== utcDayAfter(weekStartedOn, index) ||
        day.dailyCertificationStatus !== "certified") {
      throw new Error("Reader summary weekly model day is not certified");
    }
    exactReaderSummaryWeeklyIdentity(
      day.dailyCertificationId, "daily certification id");
    exactReaderSummaryWeeklySha256(
      day.dailyCertificationSha, "daily certification hash");
    const githubBoardSha = exactReaderSummaryWeeklySha256(
      day.githubBoardSha,
      "GitHub board hash",
    );
    const githubBoardStatus: unknown = day.githubBoardStatus;
    if (githubBoardStatus === "historical_unavailable") {
      assertReaderSummaryWeeklyExactObject(
        day,
        historicalDayKeys,
        `weekly model day ${index + 1}`,
        { allowAuthoritativeHashes: true },
      );
      if (
        !("githubAuthorizationIdentity" in day) ||
        day.date !== utcDayAfter(weekStartedOn, index) ||
        day.githubAuthorizationIdentity !==
          readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity ||
        day.githubBoardId !==
          `${readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion}:${githubBoardSha}`
      ) {
        throw new Error(
          "Reader summary weekly model GitHub authority is invalid",
        );
      }
    } else if (githubBoardStatus === "verified") {
      assertReaderSummaryWeeklyExactObject(
        day,
        dayKeys,
        `weekly model day ${index + 1}`,
        { allowAuthoritativeHashes: true },
      );
      exactReaderSummaryWeeklyIdentity(day.githubBoardId, "GitHub board id");
    } else {
      throw new Error("Reader summary weekly model day is not certified");
    }
    canonicalProviderCounts(
      day.providerCounts,
      githubBoardStatus,
    );
  });
  assertUnique(input.map((day) => day.date), "model days");
  assertUnique(input.map((day) => day.dailyCertificationId),
    "daily certification ids");
  assertUnique(input.map((day) => day.githubBoardId), "GitHub board ids");
  return input;
};
const canonicalProviderCounts = (
  input: readonly ReaderSummaryWeeklyModelProviderCount[],
  githubBoardStatus: ReaderSummaryWeeklyModelDay["githubBoardStatus"],
): void => {
  assertReaderSummaryWeeklyDenseArray(input, "model day provider counts");
  if (input.length !== readerSummaryWeeklyCanonicalProviderKeys.length) {
    throw new Error(
      "Reader summary weekly model day provider counts are incomplete");
  }
  input.forEach((entry, index) => {
    assertReaderSummaryWeeklyExactObject(
      entry, ["providerKey", "count"], `provider count ${index + 1}`);
    if (exactProviderKey(entry.providerKey) !==
        readerSummaryWeeklyCanonicalProviderKeys[index] ||
        !Number.isSafeInteger(entry.count) || entry.count < 0) {
      throw new Error("Reader summary weekly provider count is invalid");
    }
  });
  const expectedGitHubCount =
    githubBoardStatus === "verified" ? 10 : 0;
  if (input[0]?.count !== expectedGitHubCount) {
    throw new Error(
      "Reader summary weekly day does not bind truthful GitHub evidence");
  }
};
const boundDay = (
  input: Readonly<{ observedOn: string; dailyCertificationId: string;
    dailyCertificationSha: string }>,
  days: readonly ReaderSummaryWeeklyModelDay[],
  label: string,
): ReaderSummaryWeeklyModelDay => {
  const date = exactReaderSummaryWeeklyUtcDay(input.observedOn);
  const day = days.find((item) => item.date === date);
  if (day === undefined ||
      input.dailyCertificationId !== day.dailyCertificationId ||
      input.dailyCertificationSha !== day.dailyCertificationSha) {
    throw new Error(`Reader summary weekly ${label} day binding is invalid`);
  }
  return day;
};
const assertProviderHasCertifiedEvidence = (
  day: ReaderSummaryWeeklyModelDay,
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey,
): void => {
  if ((day.providerCounts.find(
    (entry) => entry.providerKey === providerKey)?.count ?? 0) <= 0) {
    throw new Error(
      `Reader summary weekly ${providerKey} is not certified for ${day.date}`);
  }
};
const assertVerifiedGitHubCitation = (
  manifest: ReaderSummaryWeeklySealedInputManifest,
  date: string, url: string, sha: string,
): void => {
  const board = manifest.days.find(
    (day) => day.requestedUtcDate === date)?.githubAudit;
  const source = board?.repositories.find((item) => item.canonicalUrl === url);
  if (board?.status !== "verified" || source?.sourceContentHash !== sha) {
    throw new Error(
      "Reader summary weekly GitHub citation is outside the verified board");
  }
};
const exactProviderKey = (
  value: unknown,
): ReaderSummaryWeeklyCanonicalProviderKey => {
  if (!readerSummaryWeeklyCanonicalProviderKeys.includes(
    value as ReaderSummaryWeeklyCanonicalProviderKey)) {
    throw new Error("Reader summary weekly provider key is invalid");
  }
  return value as ReaderSummaryWeeklyCanonicalProviderKey;
};
const exactClaimType = (value: unknown): ReaderSummaryWeeklyClaimType => {
  if (!readerSummaryWeeklyClaimTypes.includes(
    value as ReaderSummaryWeeklyClaimType)) {
    throw new Error("Reader summary weekly claim support is invalid");
  }
  return value as ReaderSummaryWeeklyClaimType;
};
const exactText = (value: unknown, label: string, max: number): string => {
  if (typeof value !== "string" || value.trim().length === 0 ||
      value !== value.trim() || value.length > max || value.includes("\0")) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value;
};
const exactHttpsUrl = (value: unknown): string => {
  if (typeof value !== "string" || value.length > 2_048) {
    throw new Error("Reader summary weekly citation URL is invalid");
  }
  let parsed: URL;
  try { parsed = new URL(value); } catch {
    throw new Error("Reader summary weekly citation URL is invalid");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.hash || parsed.toString() !== value) {
    throw new Error("Reader summary weekly citation URL is invalid");
  }
  return value;
};
const canonicalModelArray = <
  TInput, TValue extends Readonly<Record<TKey, string>>, TKey extends string,
>(
  input: readonly TInput[], convert: (item: TInput) => TValue,
  key: TKey, label: string,
): readonly TValue[] => {
  assertReaderSummaryWeeklyDenseArray(input, label);
  const canonical = input.map(convert);
  if (canonicalizeReaderSummaryWeeklyJson(input, label).json !==
      canonicalizeReaderSummaryWeeklyJson(canonical, `canonical ${label}`).json ||
      canonical.some((item, index) => index > 0 &&
        canonical[index - 1]![key].localeCompare(item[key]) >= 0)) {
    throw new Error(`Reader summary weekly ${label} are not canonical`);
  }
  return canonical;
};
const assertUnique = (values: readonly unknown[], label: string): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(`Reader summary weekly has duplicate ${label}`);
  }
};
const utcDayAfter = (start: string, offset: number): string =>
  new Date(Date.parse(`${start}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString().slice(0, 10);
const by = <TKey extends string>(key: TKey) =>
  <TValue extends Readonly<Record<TKey, string>>>(left: TValue, right: TValue) =>
    left[key].localeCompare(right[key]);
