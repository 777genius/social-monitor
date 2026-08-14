import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyScopeKey,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-input-manifest";
import { readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion } from "../../libs/summary/domain/value-objects/reader-summary-weekly-publication-github-evidence";
import {
  deriveReaderSummaryWeeklyReviewCitationSelector,
  readerSummaryWeeklyReviewManifestSchemaVersion,
  readerSummaryWeeklyReviewStoryIdentityPrefix,
  type ReaderSummaryWeeklyReviewManifest,
  type ReaderSummaryWeeklyReviewedCitation,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-review-manifest";
import { deriveReaderSummaryWeeklyStoryIdentity } from "../../libs/summary/domain/value-objects/reader-summary-weekly-story-identity";
import {
  assertReaderSummaryWeeklyModelInput,
  readerSummaryWeeklyModelInputSchemaVersion,
  type ReaderSummaryWeeklyClaimType,
  type ReaderSummaryWeeklyModelCitationEvidence,
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelObservationEvidence,
  type ReaderSummaryWeeklyModelStoryEvidence,
} from "../../libs/summary/ports/reader-summary-weekly-model.port";

import type {
  ReaderSummaryWeeklyProductionCertification,
  ReaderSummaryWeeklyProductionDbState,
  ReaderSummaryWeeklyProductionProviderEvidence,
} from "./reader-summary-weekly-production-postgres-contract";

export type ReaderSummaryWeeklyProductionInputAdmission =
  | Readonly<{
      status: "complete";
      input: ReaderSummaryWeeklyModelInput;
      reviewManifest: ReaderSummaryWeeklyReviewManifest;
    }>
  | Readonly<{ status: "partial"; reasons: readonly string[] }>;

type BoundManifestCitation = Readonly<{
  reviewed: ReaderSummaryWeeklyReviewedCitation;
  certification: ReaderSummaryWeeklyProductionCertification;
  evidence: ReaderSummaryWeeklyProductionProviderEvidence;
  modelStoryId: string;
}>;

type CitationClaimPlan = Readonly<{
  citation: BoundManifestCitation;
  claimSupport: readonly ReaderSummaryWeeklyClaimType[];
}>;

const manifestRecordKeys = [
  "schemaVersion",
  "tenantId",
  "workspaceId",
  "scope",
  "scopeKey",
  "weekStartedOn",
  "weekEndedOn",
  "sealId",
  "sealSha256",
  "reviewAuthority",
  "reviewAuthoritySha256",
  "observations",
  "citations",
  "modelResponseSha256",
  "executionAttestation",
  "executionAttestationSha256",
  "manifestId",
  "manifestSha256",
] as const;

export const buildModelInputFromDbState = (
  dbState: ReaderSummaryWeeklyProductionDbState,
  reviewManifest: ReaderSummaryWeeklyReviewManifest | null | undefined,
): ReaderSummaryWeeklyProductionInputAdmission => {
  if (dbState.status !== "complete") {
    return partial(dbState.blockingReasons);
  }
  const sealReasons = certificationSealBlockingReasons(dbState);
  if (sealReasons.length > 0) return partial(sealReasons);
  if (reviewManifest === null || reviewManifest === undefined) {
    return partial(["missing authorized weekly review manifest"]);
  }
  try {
    assertManifestCanonicalIntegrity(reviewManifest);
    assertManifestMatchesCertifiedWeek(reviewManifest, dbState);
    const citations = bindManifestCitations(reviewManifest, dbState);
    const claims = claimPlansForManifest(reviewManifest, citations);
    const input = sealModelInput(dbState, reviewManifest, claims);
    return Object.freeze({
      status: "complete" as const,
      input,
      reviewManifest,
    });
  } catch {
    return partial([
      "weekly review manifest is corrupt or does not match DB certification authority",
    ]);
  }
};

const certificationSealBlockingReasons = (
  dbState: ReaderSummaryWeeklyProductionDbState,
): readonly string[] => {
  const seal = dbState.weeklyCertificationSeal;
  if (seal === null) {
    return ["missing persisted DB weekly certification seal"];
  }
  const { sealId: recordSealId, sealSha: recordSealSha, ...canonicalBody } =
    seal.canonicalRecord;
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    canonicalBody,
    "weekly production persisted certification seal",
  );
  const scopeKey = readerSummaryWeeklyScopeKey(dbState.scope.scope);
  const mismatched =
    recordSealId !== seal.sealId ||
    recordSealSha !== seal.sealSha256 ||
    canonicalBody.schemaVersion !==
      "reader_summary.weekly_certification_seal.v1" ||
    canonicalBody.tenantId !== seal.tenantId ||
    canonicalBody.workspaceId !== seal.workspaceId ||
    canonicalBody.scopeType !== seal.scopeType ||
    canonicalBody.scopeKey !== seal.scopeKey ||
    canonicalBody.weekStartedOn !== seal.weekStartedOn ||
    canonicalBody.weekEndedOn !== seal.weekEndedOn ||
    seal.sealId !==
      `reader_summary.weekly_certification_seal.v1:${seal.sealSha256}` ||
    canonical.sha256 !== seal.sealSha256 ||
    canonical.json !== seal.canonicalBytes ||
    canonicalizeReaderSummaryWeeklyJson(canonicalBody.days).json !==
      canonicalizeReaderSummaryWeeklyJson(seal.days).json ||
    seal.tenantId !== dbState.scope.tenantId ||
    seal.workspaceId !== dbState.scope.workspaceId ||
    seal.scopeType !== dbState.scope.scope.type ||
    seal.scopeKey !== scopeKey ||
    seal.weekStartedOn !== dbState.window.weekStartedOn ||
    seal.weekEndedOn !== dbState.window.weekEndedOn ||
    seal.days.length !== 7 ||
    dbState.certifications.length !== 7 ||
    seal.days.some((day, index) => {
      const certification = dbState.certifications[index];
      return certification === undefined ||
        day.requestedUtcDate !== dbState.window.dates[index] ||
        day.requestedUtcDate !== certification.requestedUtcDate ||
        day.publicationId !== certification.publicationId ||
        day.artifactId !== certification.artifactId ||
        day.jobId !== certification.jobId ||
        day.semanticStatus !== certification.semanticStatus ||
        day.publicationEvidenceIdentity !== certification.identity ||
        day.publicationEvidenceSha256 !== certification.canonicalSha256;
    });
  return mismatched
    ? ["persisted DB weekly certification seal is stale or mismatched"]
    : [];
};

const assertManifestCanonicalIntegrity = (
  manifest: ReaderSummaryWeeklyReviewManifest,
): void => {
  const record = exactRecord(manifest.canonicalRecord, "review manifest record");
  assertExactKeys(record, manifestRecordKeys, "review manifest record");
  const { manifestId, manifestSha256, ...body } = record;
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "weekly review manifest canonical record",
  );
  const projected = {
    schemaVersion: manifest.schemaVersion,
    tenantId: manifest.tenantId,
    workspaceId: manifest.workspaceId,
    scope: manifest.scope,
    scopeKey: manifest.scopeKey,
    weekStartedOn: manifest.weekStartedOn,
    weekEndedOn: manifest.weekEndedOn,
    sealId: manifest.sealId,
    sealSha256: manifest.sealSha256,
    reviewAuthority: manifest.reviewAuthority,
    reviewAuthoritySha256: manifest.reviewAuthoritySha256,
    observations: manifest.observations,
    citations: manifest.citations,
    modelResponseSha256: manifest.modelResponseSha256,
    executionAttestation: manifest.executionAttestation,
    executionAttestationSha256: manifest.executionAttestationSha256,
    manifestId: manifest.manifestId,
    manifestSha256: manifest.manifestSha256,
  };
  const suppliedBytes = manifest.toBytes();
  if (
    manifest.schemaVersion !== readerSummaryWeeklyReviewManifestSchemaVersion ||
    typeof manifestId !== "string" ||
    typeof manifestSha256 !== "string" ||
    manifestId !== manifest.manifestId ||
    manifestSha256 !== manifest.manifestSha256 ||
    !isSha(manifest.manifestSha256) ||
    manifest.manifestId !==
      `${readerSummaryWeeklyReviewManifestSchemaVersion}:${manifest.manifestSha256}` ||
    canonical.sha256 !== manifest.manifestSha256 ||
    manifest.canonicalJson !== canonical.json ||
    manifest.byteLength !== canonical.byteLength ||
    !(suppliedBytes instanceof Uint8Array) ||
    Buffer.from(suppliedBytes).compare(Buffer.from(canonical.toBytes())) !== 0 ||
    canonicalizeReaderSummaryWeeklyJson(projected).json !==
      canonicalizeReaderSummaryWeeklyJson(record).json ||
    manifest.reviewAuthoritySha256 !==
      canonicalizeReaderSummaryWeeklyJson(
        manifest.reviewAuthority,
        "weekly review manifest authority",
      ).sha256 ||
    manifest.executionAttestationSha256 !==
      canonicalizeReaderSummaryWeeklyJson(
        manifest.executionAttestation,
        "weekly review manifest execution attestation",
      ).sha256
  ) {
    throw new Error("Reader summary weekly review manifest canonical record diverged");
  }
  assertManifestExecutionAttestation(manifest);
};

const assertManifestExecutionAttestation = (
  manifest: ReaderSummaryWeeklyReviewManifest,
): void => {
  const attestation = manifest.executionAttestation;
  if (
    attestation.schemaVersion !== 1 ||
    attestation.purpose !== "social_monitor.reader_summary.weekly.review" ||
    attestation.provider !== "codex" ||
    attestation.model !== "gpt-5.6-sol" ||
    attestation.reasoningEffort !== "xhigh" ||
    attestation.runtimeEngine !== "subscription-runtime-cli" ||
    attestation.selectedOutputKind !== "structured_output" ||
    !isSha(attestation.canonicalRequestSha256) ||
    !isSha(attestation.launcherSha256) ||
    !isSha(attestation.selectedOutputSha256) ||
    !isSha(manifest.modelResponseSha256) ||
    attestation.selectedOutputSha256 !== manifest.modelResponseSha256
  ) {
    throw new Error("Reader summary weekly review manifest attestation diverged");
  }
};

const assertManifestMatchesCertifiedWeek = (
  manifest: ReaderSummaryWeeklyReviewManifest,
  dbState: ReaderSummaryWeeklyProductionDbState,
): void => {
  const seal = dbState.weeklyCertificationSeal;
  if (seal === null) throw new Error("Reader summary weekly DB seal is absent");
  const scopeKey = readerSummaryWeeklyScopeKey(dbState.scope.scope);
  if (
    manifest.tenantId !== dbState.scope.tenantId ||
    manifest.workspaceId !== dbState.scope.workspaceId ||
    manifest.scopeKey !== scopeKey ||
    canonicalizeReaderSummaryWeeklyJson(manifest.scope).json !==
      canonicalizeReaderSummaryWeeklyJson(dbState.scope.scope).json ||
    manifest.weekStartedOn !== dbState.window.weekStartedOn ||
    manifest.weekEndedOn !== dbState.window.weekEndedOn ||
    manifest.sealId !== seal.sealId ||
    manifest.sealSha256 !== seal.sealSha256
  ) {
    throw new Error("Reader summary weekly review manifest scope or seal diverged");
  }
  const authority = manifest.reviewAuthority;
  if (
    authority.schemaVersion !== "reader_summary.weekly_review_authority.v1" ||
    authority.tenantId !== manifest.tenantId ||
    authority.workspaceId !== manifest.workspaceId ||
    authority.scopeKey !== manifest.scopeKey ||
    canonicalizeReaderSummaryWeeklyJson(authority.scope).json !==
      canonicalizeReaderSummaryWeeklyJson(manifest.scope).json ||
    authority.weekStartedOn !== manifest.weekStartedOn ||
    authority.weekEndedOn !== manifest.weekEndedOn ||
    authority.sealId !== manifest.sealId ||
    authority.sealSha256 !== manifest.sealSha256 ||
    authority.days.length !== 7 ||
    dbState.certifications.length !== 7
  ) {
    throw new Error("Reader summary weekly review authority diverged");
  }
  authority.days.forEach((day, index) => {
    const certification = dbState.certifications[index];
    if (
      certification === undefined ||
      day.requestedUtcDate !== dbState.window.dates[index] ||
      day.requestedUtcDate !== certification.requestedUtcDate ||
      day.publicationId !== certification.publicationId ||
      day.publicationEvidenceIdentity !== certification.identity ||
      day.publicationEvidenceSha256 !== certification.canonicalSha256 ||
      day.providerEvidenceSha256 !==
        canonicalizeReaderSummaryWeeklyJson(
          certification.providerEvidence,
          "weekly review provider evidence",
        ).sha256 ||
      day.githubEvidenceSha256 !== githubEvidenceSha(certification) ||
      day.semanticStatus !== certification.semanticStatus ||
      day.githubMode !== githubEvidenceMode(certification)
    ) {
      throw new Error("Reader summary weekly review authority day diverged");
    }
  });
};

const bindManifestCitations = (
  manifest: ReaderSummaryWeeklyReviewManifest,
  dbState: ReaderSummaryWeeklyProductionDbState,
): ReadonlyMap<string, BoundManifestCitation> => {
  if (manifest.citations.length === 0) {
    throw new Error("Reader summary weekly review manifest selected no citations");
  }
  const certificationByDate = new Map(
    dbState.certifications.map((certification) => [
      certification.requestedUtcDate,
      certification,
    ] as const),
  );
  const bound = new Map<string, BoundManifestCitation>();
  for (const reviewed of manifest.citations) {
    const certification = certificationByDate.get(reviewed.requestedUtcDate);
    if (
      certification === undefined ||
      bound.has(reviewed.selector) ||
      reviewed.publicationId !== certification.publicationId ||
      reviewed.publicationEvidenceIdentity !== certification.identity ||
      reviewed.publicationEvidenceSha256 !== certification.canonicalSha256 ||
      reviewed.selector !== deriveReaderSummaryWeeklyReviewCitationSelector({
        requestedUtcDate: reviewed.requestedUtcDate,
        publicationId: reviewed.publicationId,
        publicationEvidenceSha256: reviewed.publicationEvidenceSha256,
        providerKey: reviewed.providerKey,
        citationId: reviewed.citationId,
        sourceItemId: reviewed.sourceItemId,
        sourceContentHash: reviewed.sourceContentHash,
      })
    ) {
      throw new Error("Reader summary weekly review citation authority diverged");
    }
    const matches = certification.providerEvidence.filter((evidence) =>
      evidence.publishedAt.slice(0, 10) === reviewed.requestedUtcDate &&
      evidence.providerKey === reviewed.providerKey &&
      evidence.citationId === reviewed.citationId &&
      evidence.sourceItemId === reviewed.sourceItemId &&
      evidence.sourceContentHash === reviewed.sourceContentHash,
    );
    if (matches.length !== 1 || matches[0] === undefined) {
      throw new Error("Reader summary weekly review citation lacks one DB evidence row");
    }
    const evidence = matches[0];
    const expectedStory = deriveReaderSummaryWeeklyStoryIdentity({
      subjectKey: `provider:${evidence.providerKey}`,
      actionKey: "action:tracked",
      objectKeys: [
        `resource:${canonicalizeReaderSummaryWeeklyJson({
          canonicalUrl: evidence.canonicalUrl,
        }).sha256}`,
      ],
      qualifierKeys: ["review:aggregate"],
    });
    if (reviewed.storyId !== expectedStory.identity) {
      throw new Error("Reader summary weekly review story identity diverged");
    }
    bound.set(reviewed.selector, Object.freeze({
      reviewed,
      certification,
      evidence,
      modelStoryId: modelStoryId(reviewed.storyId),
    }));
  }
  return bound;
};

const claimPlansForManifest = (
  manifest: ReaderSummaryWeeklyReviewManifest,
  citations: ReadonlyMap<string, BoundManifestCitation>,
): readonly CitationClaimPlan[] => {
  const plans = new Map<string, CitationClaimPlan>();
  for (const observation of manifest.observations) {
    const storyId = modelStoryId(observation.storyId);
    if (
      observation.story !== storyId ||
      !Array.isArray(observation.citationSelectors) ||
      observation.citationSelectors.length === 0 ||
      new Set(observation.citationSelectors).size !==
        observation.citationSelectors.length
    ) {
      throw new Error("Reader summary weekly review observation is invalid");
    }
    const selected = observation.citationSelectors.map((selector) => {
      const citation = citations.get(selector);
      if (citation === undefined || citation.reviewed.storyId !== observation.storyId) {
        throw new Error("Reader summary weekly review observation escaped citation authority");
      }
      return citation;
    });
    const claims = claimsForReviewedObservation(observation, selected);
    selected.forEach((citation) => {
      if (plans.has(citation.reviewed.selector)) {
        throw new Error("Reader summary weekly review selector has multiple observations");
      }
      plans.set(citation.reviewed.selector, Object.freeze({
        citation,
        claimSupport: claims.get(citation.reviewed.selector)!,
      }));
    });
  }
  if (plans.size !== citations.size) {
    throw new Error("Reader summary weekly review left a citation selector unobserved");
  }
  return Object.freeze([...plans.values()].sort((left, right) =>
    left.citation.reviewed.selector.localeCompare(right.citation.reviewed.selector),
  ));
};

const claimsForReviewedObservation = (
  observation: ReaderSummaryWeeklyReviewManifest["observations"][number],
  selected: readonly BoundManifestCitation[],
): ReadonlyMap<string, readonly ReaderSummaryWeeklyClaimType[]> => {
  const claims = new Map<string, readonly ReaderSummaryWeeklyClaimType[]>();
  const selectedBySelector = new Map(selected.map((citation) => [
    citation.reviewed.selector,
    citation,
  ] as const));
  selected.forEach((citation) => {
    claims.set(citation.reviewed.selector, Object.freeze(["snapshot"]));
  });
  if (observation.label === "observation") {
    if (
      observation.beforeCitationSelector !== undefined ||
      observation.afterCitationSelector !== undefined ||
      observation.terminalCitationSelector !== undefined
    ) {
      throw new Error("Reader summary weekly snapshot observation has claim pointers");
    }
    return claims;
  }
  if (observation.label === "evolution") {
    const before = selectedBySelector.get(observation.beforeCitationSelector ?? "");
    const after = selectedBySelector.get(observation.afterCitationSelector ?? "");
    if (
      before === undefined ||
      after === undefined ||
      observation.terminalCitationSelector !== undefined ||
      before.reviewed.requestedUtcDate >= after.reviewed.requestedUtcDate
    ) {
      throw new Error("Reader summary weekly evolution observation is invalid");
    }
    claims.set(
      after.reviewed.selector,
      Object.freeze(["snapshot", "evolution"]),
    );
    return claims;
  }
  if (observation.label === "resolution") {
    const terminal = selectedBySelector.get(
      observation.terminalCitationSelector ?? "",
    );
    if (
      terminal === undefined ||
      observation.beforeCitationSelector !== undefined ||
      observation.afterCitationSelector !== undefined ||
      selected.some((citation) =>
        citation.reviewed.requestedUtcDate >
          terminal.reviewed.requestedUtcDate,
      )
    ) {
      throw new Error("Reader summary weekly resolution observation is invalid");
    }
    claims.set(
      terminal.reviewed.selector,
      Object.freeze(["snapshot", "resolution"]),
    );
    return claims;
  }
  throw new Error("Reader summary weekly review observation label is invalid");
};

const sealModelInput = (
  dbState: ReaderSummaryWeeklyProductionDbState,
  reviewManifest: ReaderSummaryWeeklyReviewManifest,
  plans: readonly CitationClaimPlan[],
): ReaderSummaryWeeklyModelInput => {
  const seal = dbState.weeklyCertificationSeal;
  if (seal === null) throw new Error("Reader summary weekly DB seal is absent");
  const storiesById = new Map<string, string>();
  const observations: ReaderSummaryWeeklyModelObservationEvidence[] = [];
  const citations: ReaderSummaryWeeklyModelCitationEvidence[] = [];
  for (const plan of plans) {
    const { certification, evidence, modelStoryId, reviewed } = plan.citation;
    const label = boundedText(evidence.title, 180);
    const priorLabel = storiesById.get(modelStoryId);
    if (priorLabel === undefined || label.localeCompare(priorLabel) < 0) {
      storiesById.set(modelStoryId, label);
    }
    const observationId = `observation:${reviewed.selector.slice("citation:".length)}`;
    const citationId = reviewed.selector;
    observations.push(Object.freeze({
      observationId,
      storyId: modelStoryId,
      observedOn: certification.requestedUtcDate,
      providerKey: evidence.providerKey,
      text: boundedText(`${evidence.title}: ${evidence.sourceText}`, 4_000),
      claimSupport: plan.claimSupport,
      citationIds: Object.freeze([citationId]),
      dailyCertificationId: certification.identity,
      dailyCertificationSha: certification.canonicalSha256,
      sourceSha256: evidence.sourceContentHash,
    }));
    citations.push(Object.freeze({
      citationId,
      observationId,
      storyId: modelStoryId,
      observedOn: certification.requestedUtcDate,
      providerKey: evidence.providerKey,
      title: boundedText(evidence.title, 240),
      canonicalUrl: evidence.canonicalUrl,
      dailyCertificationId: certification.identity,
      dailyCertificationSha: certification.canonicalSha256,
      sourceSha256: evidence.sourceContentHash,
    }));
  }
  assertUnique(citations.map((citation) => citation.citationId), "citation ids");
  const stories: ReaderSummaryWeeklyModelStoryEvidence[] = [...storiesById]
    .map(([storyId, label]) => Object.freeze({ storyId, label }))
    .sort(by("storyId"));
  const body = {
    schemaVersion: readerSummaryWeeklyModelInputSchemaVersion,
    manifestSealId: seal.sealId,
    manifestSealSha: seal.sealSha256,
    tenantId: dbState.scope.tenantId,
    workspaceId: dbState.scope.workspaceId,
    scope: cloneScope(dbState.scope.scope),
    weekStartedOn: dbState.window.weekStartedOn,
    weekEndedOn: dbState.window.weekEndedOn,
    days: modelDays(dbState),
    stories,
    observations: Object.freeze(observations.sort(by("observationId"))),
    citations: Object.freeze(citations.sort(by("citationId"))),
  };
  const sealSha = canonicalizeReaderSummaryWeeklyJson(
    body,
    "weekly production model input",
  ).sha256;
  const input = Object.freeze({
    ...body,
    sealId: `${readerSummaryWeeklyModelInputSchemaVersion}:${sealSha}`,
    sealSha,
  });
  assertReaderSummaryWeeklyModelInput(input);
  if (
    reviewManifest.manifestId !== reviewManifest.canonicalRecord.manifestId ||
    reviewManifest.manifestSha256 !== reviewManifest.canonicalRecord.manifestSha256
  ) {
    throw new Error("Reader summary weekly review manifest identity diverged");
  }
  return input;
};

const modelDays = (
  dbState: ReaderSummaryWeeklyProductionDbState,
): ReaderSummaryWeeklyModelInput["days"] => Object.freeze(
  dbState.certifications.map((certification) => {
    const githubSha = githubEvidenceSha(certification);
    const mode = githubEvidenceMode(certification);
    const common = {
      date: certification.requestedUtcDate,
      dailyCertificationId: certification.identity,
      dailyCertificationSha: certification.canonicalSha256,
      dailyCertificationStatus: "certified" as const,
      githubBoardId:
        `${readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion}:${githubSha}`,
      githubBoardSha: githubSha,
      providerCounts: certification.providerCounts,
    };
    if (mode === "historical_unavailable") {
      return Object.freeze({
        ...common,
        githubBoardStatus: "historical_unavailable" as const,
        githubAuthorizationIdentity:
          readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
      });
    }
    if (mode !== "verified") {
      throw new Error("Reader summary weekly non-verified GitHub authority is not modelable");
    }
    return Object.freeze({
      ...common,
      githubBoardStatus: "verified" as const,
    });
  }),
);

const modelStoryId = (internalStoryId: string): string => {
  if (!internalStoryId.startsWith(readerSummaryWeeklyReviewStoryIdentityPrefix)) {
    throw new Error("Reader summary weekly review story identity is invalid");
  }
  const sha = internalStoryId.slice(readerSummaryWeeklyReviewStoryIdentityPrefix.length);
  if (!isSha(sha)) {
    throw new Error("Reader summary weekly review story identity is invalid");
  }
  return `story:${sha}`;
};

const githubEvidenceSha = (
  certification: ReaderSummaryWeeklyProductionCertification,
): string => {
  const value = certification.githubEvidence.sha256;
  if (!isSha(value)) {
    throw new Error("Reader summary weekly GitHub evidence hash is invalid");
  }
  return value;
};

const githubEvidenceMode = (
  certification: ReaderSummaryWeeklyProductionCertification,
): "verified" | "ordinary_not_required" | "historical_unavailable" => {
  const mode = certification.githubEvidence.mode;
  if (
    mode !== "verified" &&
    mode !== "ordinary_not_required" &&
    mode !== "historical_unavailable"
  ) {
    throw new Error("Reader summary weekly GitHub evidence mode is invalid");
  }
  return mode;
};

const partial = (
  reasons: readonly string[],
): Extract<ReaderSummaryWeeklyProductionInputAdmission, { status: "partial" }> =>
  Object.freeze({ status: "partial" as const, reasons: Object.freeze([...reasons]) });

const exactRecord = (
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value as Readonly<Record<string, unknown>>;
};

const assertExactKeys = (
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void => {
  const actual = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (
    actual.length !== expectedKeys.length ||
    actual.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`Reader summary weekly ${label} shape is invalid`);
  }
};

const isSha = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

const assertUnique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(`Reader summary weekly duplicate ${label}`);
  }
};

const boundedText = (input: string, max: number): string => {
  const normalized = input.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) {
    throw new Error("Reader summary weekly evidence text is empty");
  }
  return normalized.length <= max ? normalized : normalized.slice(0, max).trim();
};

const cloneScope = (
  scope: ReaderSummaryWeeklyProductionDbState["scope"]["scope"],
): ReaderSummaryWeeklyProductionDbState["scope"]["scope"] =>
  scope.type === "workspace"
    ? Object.freeze({ type: "workspace" as const })
    : Object.freeze({ type: "interest" as const, interestId: scope.interestId });

const by = <TKey extends string>(key: TKey) =>
  <TValue extends Readonly<Record<TKey, string>>>(
    left: TValue,
    right: TValue,
  ): number => left[key].localeCompare(right[key]);
