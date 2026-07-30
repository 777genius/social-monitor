import { ReaderSummaryWeeklyArtifact } from "../entities/reader-summary-weekly-artifact";
import type {
  ReaderSummaryWeeklyArtifactSnapshot,
  ReaderSummaryWeeklyArtifactProps,
} from "../entities/reader-summary-weekly-artifact";
import {
  assertReaderSummaryWeeklyStoryAuthorityBinding,
  type ReaderSummaryWeeklyStoryAuthorityBinding,
  type ReaderSummaryWeeklyStoryAuthorityEvidence,
} from "../value-objects/reader-summary-weekly-story-authority";
import {
  assertReaderSummaryWeeklySealedInputManifest,
  type ReaderSummaryWeeklySealedInputManifest,
} from "../value-objects/reader-summary-weekly-input-manifest";
import {
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  canonicalReaderSummaryWeeklyScope,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  readerSummaryWeeklyScopeKey,
} from "../value-objects/reader-summary-weekly-canonical-json";
import type {
  ReaderSummaryWeeklyStoryAuthorityHandle,
  ReaderSummaryWeeklyStoryAuthorityPort,
} from "../../ports/reader-summary-weekly-story-authority.port";

export const readerSummaryWeeklyPublicationProofSchemaVersion = "reader_summary.weekly_publication_proof.v1" as const;
export const readerSummaryWeeklyPublicationAuthorizationSchemaVersion = "reader_summary.weekly_publication_authorization.v1" as const;

export type ReaderSummaryWeeklyPublicationQualitySignals = Readonly<{
  kind: "weekly";
  editorialQuality: ReaderSummaryWeeklyArtifactSnapshot["editorialQuality"];
}>;

export type ReaderSummaryWeeklyPublicationAuthorityProof = Readonly<{
  requestedUtcDate: string; publicationId: string;
  publicationEvidenceIdentity: string; publicationEvidenceSha256: string;
  storyAuthorityIdentity: string; storyAuthoritySha256: string;
  githubBoardIdentity: string; githubBoardSha256: string;
}>;

export type ReaderSummaryWeeklyPublicationCitationProof = Readonly<{
  citationId: string; requestedUtcDate: string; publicationId: string;
  publicationEvidenceIdentity: string;
  providerKey: ReaderSummaryWeeklyStoryAuthorityEvidence["providerKey"];
  feedItemId: string; sourceItemId: string; sourceBindingId: string;
  providerItemId: string; canonicalUrl: string; sourceContentHash: string;
}>;

type ReaderSummaryWeeklyPublicationProofBody = Readonly<{
  schemaVersion: typeof readerSummaryWeeklyPublicationProofSchemaVersion;
  artifactId: string; tenantId: string; workspaceId: string;
  scope: ReaderSummaryWeeklySealedInputManifest["scope"];
  weekStartedOn: string; weekEndedOn: string;
  manifestSealId: string; manifestSealSha256: string;
  modelInputSealId: string; modelInputSealSha256: string;
  artifactSha256: string; editorialQualitySha256: string;
  authorities: readonly ReaderSummaryWeeklyPublicationAuthorityProof[];
  citations: readonly ReaderSummaryWeeklyPublicationCitationProof[];
}>;

export type ReaderSummaryWeeklyPublicationProof =
  ReaderSummaryWeeklyPublicationProofBody &
    Readonly<{
      authorizationId: string;
      sha256: string;
    }>;

declare const readerSummaryWeeklyPublicationAuthorizationBrand: unique symbol;

export type ReaderSummaryWeeklyPublicationAuthorization = Readonly<{
  readonly [readerSummaryWeeklyPublicationAuthorizationBrand]:
    "reader_summary.weekly_publication_authorization.opaque";
}>;

export type AuthorizeReaderSummaryWeeklyPublicationCommand = Readonly<{
  artifactId: string; artifact: ReaderSummaryWeeklyArtifact;
  modelInput: ReaderSummaryWeeklyArtifactProps["input"];
  manifest: ReaderSummaryWeeklySealedInputManifest;
  dailyAuthorityHandles: readonly ReaderSummaryWeeklyStoryAuthorityHandle[];
}>;

export type ReaderSummaryWeeklyPublicationAuthorizationDetails = Readonly<{
  artifactId: string; artifact: ReaderSummaryWeeklyArtifactSnapshot;
  qualitySignals: ReaderSummaryWeeklyPublicationQualitySignals;
  proof: ReaderSummaryWeeklyPublicationProof;
}>;

const issuedAuthorizations =
  new WeakMap<object, ReaderSummaryWeeklyPublicationAuthorizationDetails>();

export const authorizeReaderSummaryWeeklyPublication = (
  command: AuthorizeReaderSummaryWeeklyPublicationCommand,
  authorityPort: Pick<
    ReaderSummaryWeeklyStoryAuthorityPort,
    "readVerifiedBinding"
  >,
): ReaderSummaryWeeklyPublicationAuthorization => {
  assertReaderSummaryWeeklyExactObject(
    command,
    ["artifactId", "artifact", "modelInput", "manifest",
      "dailyAuthorityHandles"],
    "weekly publication authorization command",
  );
  assertReaderSummaryWeeklySealedInputManifest(command.manifest);
  const artifactId = exactReaderSummaryWeeklyIdentity(
    command.artifactId,
    "weekly publication artifact id",
  );
  const artifact = verifiedArtifact(command.artifact, command.modelInput);
  assertManifestBinding(command.manifest, command.modelInput, artifact);
  if (
    !Array.isArray(command.dailyAuthorityHandles) ||
    command.dailyAuthorityHandles.length !== 7
  ) {
    throw new Error(
      "Reader summary weekly publication requires exact seven DB-owned daily authorities",
    );
  }
  const authorities = command.dailyAuthorityHandles.map((handle) => {
    const binding = authorityPort.readVerifiedBinding(handle);
    assertReaderSummaryWeeklyStoryAuthorityBinding(binding);
    return binding;
  });
  const orderedAuthorities = exactAuthorities(command.manifest, authorities);
  const citationProof = exactCitationCoverage(
    command.modelInput,
    artifact.output,
    command.manifest,
    orderedAuthorities,
  );
  const artifactSha256 = canonicalizeReaderSummaryWeeklyJson(
    artifact.output,
    "authorized weekly artifact",
  ).sha256;
  const editorialQualitySha256 = canonicalizeReaderSummaryWeeklyJson(
    artifact.editorialQuality,
    "authorized weekly editorial quality",
  ).sha256;
  const proofBody = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyPublicationProofSchemaVersion,
    artifactId,
    tenantId: command.manifest.tenantId,
    workspaceId: command.manifest.workspaceId,
    scope: command.manifest.scope,
    weekStartedOn: command.manifest.weekStartedUtcDate,
    weekEndedOn: command.manifest.weekEndedUtcDate,
    manifestSealId: command.manifest.identity,
    manifestSealSha256: command.manifest.sha256,
    modelInputSealId: command.modelInput.sealId,
    modelInputSealSha256: command.modelInput.sealSha,
    artifactSha256,
    editorialQualitySha256,
    authorities: orderedAuthorities.map((binding, index) =>
      authorityProof(binding, command.manifest.days[index]!),
    ),
    citations: citationProof,
  });
  const sha256 = canonicalizeReaderSummaryWeeklyJson(
    proofBody,
    "weekly publication proof",
  ).sha256;
  const proof = deepFreezeReaderSummaryWeekly({
    ...proofBody,
    authorizationId:
      `${readerSummaryWeeklyPublicationAuthorizationSchemaVersion}:${sha256}`,
    sha256,
  });
  const authorization = Object.freeze(
    Object.create(null) as ReaderSummaryWeeklyPublicationAuthorization,
  );
  issuedAuthorizations.set(authorization, {
    artifactId,
    artifact,
    qualitySignals: deepFreezeReaderSummaryWeekly({
      kind: "weekly",
      editorialQuality: artifact.editorialQuality,
    }),
    proof,
  });
  return authorization;
};

export const readReaderSummaryWeeklyPublicationAuthorization = (
  authorization: ReaderSummaryWeeklyPublicationAuthorization,
): ReaderSummaryWeeklyPublicationAuthorizationDetails => {
  if (typeof authorization !== "object" || authorization === null) {
    throw invalidAuthorization();
  }
  const details = issuedAuthorizations.get(authorization);
  if (details === undefined) {
    throw invalidAuthorization();
  }
  assertReaderSummaryWeeklyPublicationProof(details.proof);
  return details;
};

export function assertReaderSummaryWeeklyPublicationProof(
  input: unknown,
): asserts input is ReaderSummaryWeeklyPublicationProof {
  assertReaderSummaryWeeklyExactObject(
    input,
    [
      "schemaVersion", "artifactId", "tenantId", "workspaceId", "scope",
      "weekStartedOn", "weekEndedOn", "manifestSealId",
      "manifestSealSha256", "modelInputSealId", "modelInputSealSha256",
      "artifactSha256", "editorialQualitySha256", "authorities", "citations",
      "authorizationId", "sha256",
    ],
    "weekly publication proof",
    { allowAuthoritativeHashes: true },
  );
  const proof = input as ReaderSummaryWeeklyPublicationProof;
  const { authorizationId, sha256, ...body } = proof;
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "weekly publication proof body",
  );
  if (
    proof.schemaVersion !== readerSummaryWeeklyPublicationProofSchemaVersion ||
    exactReaderSummaryWeeklySha256(
      sha256,
      "weekly publication proof hash",
    ) !== canonical.sha256 ||
    authorizationId !==
      `${readerSummaryWeeklyPublicationAuthorizationSchemaVersion}:${canonical.sha256}` ||
    proof.authorities.length !== 7 ||
    new Set(proof.authorities.map((item) => item.requestedUtcDate)).size !== 7 ||
    new Set(proof.authorities.map((item) => item.publicationId)).size !== 7 ||
    new Set(proof.citations.map((item) => item.citationId)).size !==
      proof.citations.length
  ) {
    throw new Error("Reader summary weekly publication proof is invalid");
  }
}

const verifiedArtifact = (
  artifact: ReaderSummaryWeeklyArtifact,
  modelInput: ReaderSummaryWeeklyArtifactProps["input"],
): ReaderSummaryWeeklyArtifactSnapshot => {
  if (
    typeof artifact !== "object" ||
    artifact === null ||
    typeof artifact.toSnapshot !== "function"
  ) {
    throw new Error("Reader summary weekly publication requires a truthful weekly artifact");
  }
  const supplied = artifact.toSnapshot();
  const verified = ReaderSummaryWeeklyArtifact.create({
    input: modelInput,
    output: supplied.output,
  }).toSnapshot();
  if (
    canonicalizeReaderSummaryWeeklyJson(supplied).json !==
    canonicalizeReaderSummaryWeeklyJson(verified).json ||
    verified.editorialQuality.blockingPassed !== true ||
    verified.editorialQuality.publicationDecision !== "allow"
  ) {
    throw new Error("Reader summary weekly publication requires truthful editorial quality");
  }
  return verified;
};

const assertManifestBinding = (
  manifest: ReaderSummaryWeeklySealedInputManifest,
  modelInput: ReaderSummaryWeeklyArtifactProps["input"],
  artifact: ReaderSummaryWeeklyArtifactSnapshot,
): void => {
  const scope = canonicalReaderSummaryWeeklyScope(modelInput.scope);
  if (
    modelInput.manifestSealId !== manifest.identity ||
    modelInput.manifestSealSha !== manifest.sha256 ||
    modelInput.tenantId !== manifest.tenantId ||
    modelInput.workspaceId !== manifest.workspaceId ||
    readerSummaryWeeklyScopeKey(scope) !==
      readerSummaryWeeklyScopeKey(manifest.scope) ||
    modelInput.weekStartedOn !== manifest.weekStartedUtcDate ||
    modelInput.weekEndedOn !== manifest.weekEndedUtcDate ||
    artifact.output.sealId !== modelInput.sealId ||
    artifact.output.sealSha !== modelInput.sealSha
  ) {
    throw new Error("Reader summary weekly publication has a mismatched sealed manifest");
  }
};

const exactAuthorities = (
  manifest: ReaderSummaryWeeklySealedInputManifest,
  authorities: readonly ReaderSummaryWeeklyStoryAuthorityBinding[],
): readonly ReaderSummaryWeeklyStoryAuthorityBinding[] => {
  const byDate = new Map<string, ReaderSummaryWeeklyStoryAuthorityBinding>();
  for (const authority of authorities) {
    if (byDate.has(authority.requestedUtcDate)) {
      throw new Error(
        "Reader summary weekly publication has duplicate daily authorities",
      );
    }
    byDate.set(authority.requestedUtcDate, authority);
  }
  const ordered = manifest.days.map((day) => {
    const authority = byDate.get(day.requestedUtcDate);
    if (authority === undefined) {
      throw new Error(
        `Reader summary weekly publication is missing DB authority for ${day.requestedUtcDate}`,
      );
    }
    assertAuthorityBinding(manifest, day, authority);
    return authority;
  });
  if (byDate.size !== ordered.length) {
    throw new Error(
      "Reader summary weekly publication contains an out-of-week authority",
    );
  }
  return deepFreezeReaderSummaryWeekly(ordered);
};

const assertAuthorityBinding = (
  manifest: ReaderSummaryWeeklySealedInputManifest,
  day: ReaderSummaryWeeklySealedInputManifest["days"][number],
  authority: ReaderSummaryWeeklyStoryAuthorityBinding,
): void => {
  const certification = day.dailyCertification;
  if (
    authority.tenantId !== manifest.tenantId ||
    authority.workspaceId !== manifest.workspaceId ||
    readerSummaryWeeklyScopeKey(authority.scope) !==
      readerSummaryWeeklyScopeKey(manifest.scope) ||
    authority.requestedUtcDate !== day.requestedUtcDate ||
    authority.publicationId !== certification.publicationId ||
    authority.artifactId !== certification.artifactId ||
    authority.jobId !== certification.jobId ||
    authority.reportId !== certification.reportId ||
    authority.proofId !== certification.proofId ||
    authority.reportSha256 !== certification.reportSha256 ||
    authority.proofSha256 !== certification.exactProofSha256 ||
    authority.artifactPayloadSha256 !==
      certification.artifactPayloadSha256
  ) {
    throw new Error(
      `Reader summary weekly publication DB authority does not match the sealed manifest for ${day.requestedUtcDate}`,
    );
  }
  const actualCounts = certification.providerCounts.map((entry) => ({
    providerKey: entry.providerKey,
    count: authority.evidence.filter(
      (evidence) => evidence.providerKey === entry.providerKey,
    ).length,
  }));
  if (
    canonicalizeReaderSummaryWeeklyJson(actualCounts).json !==
    canonicalizeReaderSummaryWeeklyJson(certification.providerCounts).json
  ) {
    throw new Error(
      `Reader summary weekly publication authority citation counts do not match ${day.requestedUtcDate}`,
    );
  }
  assertStrictGitHubBoard(day, authority);
};

const assertStrictGitHubBoard = (
  day: ReaderSummaryWeeklySealedInputManifest["days"][number],
  authority: ReaderSummaryWeeklyStoryAuthorityBinding,
): void => {
  const board = day.githubAudit;
  const github = authority.evidence.filter(
    (item) => item.providerKey === "github-trending-page",
  );
  const repositories = board.repositories.map((repository) => {
    const matching = github.filter(
      (item) =>
        item.canonicalUrl === repository.canonicalUrl &&
        item.sourceContentHash === repository.sourceContentHash,
    );
    if (matching.length !== 1) {
      throw new Error(
        `Reader summary weekly publication is missing the strict GitHub board for ${day.requestedUtcDate}`,
      );
    }
    const evidence = matching[0]!;
    return {
      rank: repository.rank,
      citationId: evidence.citationId,
      feedItemId: evidence.feedItemId,
      sourceItemId: evidence.sourceItemId,
      repositoryIdentity: repository.repositoryIdentity,
      canonicalUrl: repository.canonicalUrl,
      sourceContentHash: repository.sourceContentHash,
      sourceProviderContentHash: repository.sourceProviderContentHash,
    };
  });
  const githubBody = {
    schemaVersion:
      "reader_summary.weekly_publication_github_evidence.v1" as const,
    mode: "verified" as const,
    requestedUtcDay: board.requestedUtcDay,
    providerKey: "github-trending-page" as const,
    scanJobId: board.scanJobId,
    sourceBindingId: board.sourceBindingId,
    evidenceCount: repositories.length,
    historicalUnavailableReason: null,
    authorizedAt: null,
    sourceProviderContentHash: board.sourceProviderContentHash,
    repositories,
  };
  if (
    github.length !== 10 ||
    repositories.length !== 10 ||
    canonicalizeReaderSummaryWeeklyJson(githubBody).sha256 !==
      authority.githubEvidenceSha256
  ) {
    throw new Error(
      `Reader summary weekly publication is missing the strict GitHub board for ${day.requestedUtcDate}`,
    );
  }
};

const exactCitationCoverage = (
  modelInput: ReaderSummaryWeeklyArtifactProps["input"],
  output: ReaderSummaryWeeklyArtifactSnapshot["output"],
  manifest: ReaderSummaryWeeklySealedInputManifest,
  authorities: readonly ReaderSummaryWeeklyStoryAuthorityBinding[],
): readonly ReaderSummaryWeeklyPublicationCitationProof[] => {
  const cited = new Set([
    ...output.headlineCitationIds,
    ...output.takeawayCitationIds,
    ...output.synthesisCitationIds,
    ...output.stories.flatMap((story) => story.citationIds),
    ...output.sections.flatMap((section) => section.citationIds),
  ]);
  if (
    cited.size !== modelInput.citations.length ||
    modelInput.citations.some((citation) => !cited.has(citation.citationId))
  ) {
    throw new Error(
      "Reader summary weekly publication requires 1:1 citation coverage",
    );
  }
  const proof = modelInput.citations.map((citation) => {
    const dayIndex = manifest.days.findIndex(
      (day) => day.requestedUtcDate === citation.observedOn,
    );
    const day = manifest.days[dayIndex];
    const authority = authorities[dayIndex];
    if (
      day === undefined ||
      authority === undefined ||
      citation.dailyCertificationId !== day.dailyCertification.identity ||
      citation.dailyCertificationSha !== day.dailyCertification.sha256
    ) {
      throw new Error(
        `Reader summary weekly citation ${citation.citationId} is outside the sealed week`,
      );
    }
    const matching = authority.evidence.filter(
      (evidence) =>
        evidence.citationId === citation.citationId &&
        evidence.providerKey === citation.providerKey &&
        evidence.canonicalUrl === citation.canonicalUrl &&
        evidence.sourceContentHash === citation.sourceSha256,
    );
    if (matching.length !== 1) {
      throw new Error(
        `Reader summary weekly citation ${citation.citationId} lacks 1:1 DB authority`,
      );
    }
    const evidence = matching[0]!;
    return {
      citationId: citation.citationId,
      requestedUtcDate: citation.observedOn,
      publicationId: authority.publicationId,
      publicationEvidenceIdentity: authority.publicationEvidenceIdentity,
      providerKey: evidence.providerKey,
      feedItemId: evidence.feedItemId,
      sourceItemId: evidence.sourceItemId,
      sourceBindingId: evidence.sourceBindingId,
      providerItemId: evidence.providerItemId,
      canonicalUrl: evidence.canonicalUrl,
      sourceContentHash: evidence.sourceContentHash,
    };
  });
  return deepFreezeReaderSummaryWeekly(proof);
};
const authorityProof = (
  authority: ReaderSummaryWeeklyStoryAuthorityBinding,
  day: ReaderSummaryWeeklySealedInputManifest["days"][number],
): ReaderSummaryWeeklyPublicationAuthorityProof => ({
  requestedUtcDate: authority.requestedUtcDate,
  publicationId: authority.publicationId,
  publicationEvidenceIdentity: authority.publicationEvidenceIdentity,
  publicationEvidenceSha256: authority.publicationEvidenceSha256,
  storyAuthorityIdentity: authority.identity,
  storyAuthoritySha256: authority.sha256,
  githubBoardIdentity: day.githubAudit.identity,
  githubBoardSha256: day.githubAudit.sha256,
});
const invalidAuthorization = (): Error => new Error(
  "Reader summary weekly publication authorization is forged or unavailable");
