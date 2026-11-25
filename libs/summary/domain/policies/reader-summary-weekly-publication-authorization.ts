import type {
  ReaderSummaryWeeklyArtifact,
  ReaderSummaryWeeklyArtifactSnapshot,
  ReaderSummaryWeeklyArtifactProps,
} from "../entities/reader-summary-weekly-artifact";
import {
  assertReaderSummaryWeeklyStoryAuthorityBinding,
  type ReaderSummaryWeeklyStoryAuthorityEvidence,
} from "../value-objects/reader-summary-weekly-story-authority";
import {
  assertReaderSummaryWeeklySealedInputManifest,
  type ReaderSummaryWeeklySealedInputManifest,
} from "../value-objects/reader-summary-weekly-input-manifest";
import {
  assertReaderSummaryWeeklyCertificationSealBinding,
  readerSummaryWeeklyCertificationSealScope,
} from "../value-objects/reader-summary-weekly-certification-seal";
import {
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
} from "../value-objects/reader-summary-weekly-canonical-json";
import type {
  ReaderSummaryWeeklyStoryAuthorityHandle,
  ReaderSummaryWeeklyStoryAuthorityPort,
} from "../../ports/reader-summary-weekly-story-authority.port";
import type {
  ReaderSummaryWeeklyCertificationSealAuthorityPort,
  ReaderSummaryWeeklyCertificationSealHandle,
} from "../../ports/reader-summary-weekly-certification-seal-authority.port";
import {
  assertCertifiedSealBinding,
  assertManifestBinding,
  authorityProof,
  certifiedAuthorityProof,
  exactAuthorities,
  exactCertifiedAuthorities,
  exactCertifiedCitationCoverage,
  exactCitationCoverage,
  invalidAuthorization,
  verifiedArtifact,
} from "./reader-summary-weekly-publication-authorization-support";

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

export type AuthorizeReaderSummaryWeeklyCertifiedPublicationCommand = Readonly<{
  artifactId: string; artifact: ReaderSummaryWeeklyArtifact;
  modelInput: ReaderSummaryWeeklyArtifactProps["input"];
  certificationSealHandle: ReaderSummaryWeeklyCertificationSealHandle;
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

export const authorizeReaderSummaryWeeklyCertifiedPublication = (
  command: AuthorizeReaderSummaryWeeklyCertifiedPublicationCommand,
  sealAuthority: Pick<
    ReaderSummaryWeeklyCertificationSealAuthorityPort,
    "readVerifiedBinding"
  >,
  storyAuthority: Pick<
    ReaderSummaryWeeklyStoryAuthorityPort,
    "readVerifiedBinding"
  >,
): ReaderSummaryWeeklyPublicationAuthorization => {
  assertReaderSummaryWeeklyExactObject(
    command,
    ["artifactId", "artifact", "modelInput", "certificationSealHandle",
      "dailyAuthorityHandles"],
    "weekly certified publication authorization command",
  );
  const seal = sealAuthority.readVerifiedBinding(command.certificationSealHandle);
  assertReaderSummaryWeeklyCertificationSealBinding(seal);
  const artifactId = exactReaderSummaryWeeklyIdentity(
    command.artifactId,
    "weekly certified publication artifact id",
  );
  const artifact = verifiedArtifact(command.artifact, command.modelInput);
  assertCertifiedSealBinding(seal, command.modelInput, artifact);
  if (!Array.isArray(command.dailyAuthorityHandles) ||
      command.dailyAuthorityHandles.length !== 7) {
    throw new Error(
      "Reader summary weekly certified publication requires exact seven DB-owned daily authorities",
    );
  }
  const authorities = command.dailyAuthorityHandles.map((handle) => {
    const binding = storyAuthority.readVerifiedBinding(handle);
    assertReaderSummaryWeeklyStoryAuthorityBinding(binding);
    return binding;
  });
  const orderedAuthorities = exactCertifiedAuthorities(
    seal,
    command.modelInput,
    authorities,
  );
  const citations = exactCertifiedCitationCoverage(
    command.modelInput,
    artifact.output,
    seal,
    orderedAuthorities,
  );
  const artifactSha256 = canonicalizeReaderSummaryWeeklyJson(
    artifact.output,
    "authorized weekly certified artifact",
  ).sha256;
  const editorialQualitySha256 = canonicalizeReaderSummaryWeeklyJson(
    artifact.editorialQuality,
    "authorized weekly certified editorial quality",
  ).sha256;
  const proofBody = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyPublicationProofSchemaVersion,
    artifactId,
    tenantId: seal.tenantId,
    workspaceId: seal.workspaceId,
    scope: readerSummaryWeeklyCertificationSealScope(seal),
    weekStartedOn: seal.weekStartedOn,
    weekEndedOn: seal.weekEndedOn,
    manifestSealId: seal.sealId,
    manifestSealSha256: seal.sealSha,
    modelInputSealId: command.modelInput.sealId,
    modelInputSealSha256: command.modelInput.sealSha,
    artifactSha256,
    editorialQualitySha256,
    authorities: orderedAuthorities.map((authority, index) =>
      certifiedAuthorityProof(authority, command.modelInput.days[index]!),
    ),
    citations,
  });
  const sha256 = canonicalizeReaderSummaryWeeklyJson(
    proofBody,
    "weekly certified publication proof",
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
