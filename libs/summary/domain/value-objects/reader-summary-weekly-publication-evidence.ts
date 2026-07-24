import {
  assertReaderSummaryWeeklyDailyPeriod,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  canonicalReaderSummaryWeeklyScope,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
  exactReaderSummaryWeeklyUtcTimestamp,
  readerSummaryWeeklyDailyPeriod,
  readerSummaryWeeklyScopeKey,
  type ReaderSummaryWeeklyDailyPeriod,
  type ReaderSummaryWeeklyManifestScope,
} from "./reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyCanonicalProviderKeys,
  type ReaderSummaryWeeklyCanonicalProviderCount,
  type ReaderSummaryWeeklyCanonicalProviderKey,
} from "./reader-summary-weekly-daily-certification";
import {
  assertReaderSummaryWeeklyPublicationGitHubEvidence,
  type ReaderSummaryWeeklyPublicationGitHubEvidence,
} from "./reader-summary-weekly-publication-github-evidence";
import {
  assertGitHubProviderBinding,
  assertPublicationEvidenceSemantics,
  canonicalProviderEvidence,
  exactPublicationSemanticStatus,
} from "./reader-summary-weekly-publication-evidence-validation";

export const readerSummaryWeeklyPublicationEvidenceSchemaVersion =
  "reader_summary.weekly_publication_evidence.v1" as const;

export type ReaderSummaryWeeklyPublicationProviderEvidence = Readonly<{
  citationId: string;
  citationField: "title" | "bodyPreview" | "canonicalUrl";
  feedItemId: string;
  sourceItemId: string;
  sourceBindingId: string;
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey;
  providerItemId: string;
  canonicalUrl: string;
  title: string;
  sourceText: string;
  publishedAt: string;
  observedAt: string;
  sourceContentHash: string;
}>;

export type ReaderSummaryWeeklyPublicationEvidenceAuthority = Readonly<{
  tenantId: string;
  workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope;
  period: ReaderSummaryWeeklyDailyPeriod;
  requestedUtcDate: string;
  publicationId: string;
  artifactId: string;
  jobId: string;
  semanticStatus: "COMPLETED" | "NO_SIGNAL";
  report: unknown;
  exactProof: unknown;
  artifactPayload: unknown;
  providerEvidence: readonly ReaderSummaryWeeklyPublicationProviderEvidence[];
  githubEvidence: ReaderSummaryWeeklyPublicationGitHubEvidence;
  publishedAt: string;
}>;

type PublicationEvidenceBody = Readonly<{
  schemaVersion: typeof readerSummaryWeeklyPublicationEvidenceSchemaVersion;
  tenantId: string;
  workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope;
  period: ReaderSummaryWeeklyDailyPeriod;
  requestedUtcDate: string;
  publicationId: string;
  artifactId: string;
  jobId: string;
  reportId: string;
  proofId: string;
  semanticStatus: "COMPLETED" | "NO_SIGNAL";
  reportSha256: string;
  proofSha256: string;
  artifactPayloadSha256: string;
  providerEvidenceSha256: string;
  providerEvidence: readonly ReaderSummaryWeeklyPublicationProviderEvidence[];
  providerCounts: readonly ReaderSummaryWeeklyCanonicalProviderCount[];
  githubEvidence: ReaderSummaryWeeklyPublicationGitHubEvidence;
  publishedAt: string;
}>;

export type ReaderSummaryWeeklyCanonicalPublicationEvidence =
  PublicationEvidenceBody &
    Readonly<{
      identity: string;
      sha256: string;
      canonicalJson: string;
      byteLength: number;
      toBytes(): Uint8Array;
    }>;

const authorityKeys = [
  "tenantId",
  "workspaceId",
  "scope",
  "period",
  "requestedUtcDate",
  "publicationId",
  "artifactId",
  "jobId",
  "semanticStatus",
  "report",
  "exactProof",
  "artifactPayload",
  "providerEvidence",
  "githubEvidence",
  "publishedAt",
] as const;
const publicationEvidenceBodyKeys = [
  "schemaVersion",
  "tenantId",
  "workspaceId",
  "scope",
  "period",
  "requestedUtcDate",
  "publicationId",
  "artifactId",
  "jobId",
  "reportId",
  "proofId",
  "semanticStatus",
  "reportSha256",
  "proofSha256",
  "artifactPayloadSha256",
  "providerEvidenceSha256",
  "providerEvidence",
  "providerCounts",
  "githubEvidence",
  "publishedAt",
] as const;
const canonicalPublicationEvidenceKeys = [
  ...publicationEvidenceBodyKeys,
  "identity",
  "sha256",
  "canonicalJson",
  "byteLength",
  "toBytes",
] as const;

export const deriveReaderSummaryWeeklyPublicationEvidence = (
  input: ReaderSummaryWeeklyPublicationEvidenceAuthority,
): ReaderSummaryWeeklyCanonicalPublicationEvidence => {
  assertReaderSummaryWeeklyExactObject(
    input,
    authorityKeys,
    "publication evidence authority",
  );
  const requestedUtcDate = exactReaderSummaryWeeklyUtcDay(
    input.requestedUtcDate,
  );
  assertReaderSummaryWeeklyDailyPeriod(
    input.period,
    requestedUtcDate,
    "publication evidence",
  );
  assertReaderSummaryWeeklyPublicationGitHubEvidence(input.githubEvidence);
  if (input.githubEvidence.requestedUtcDay !== requestedUtcDate) {
    throw new Error(
      "Reader summary weekly publication and GitHub days do not match",
    );
  }
  const semanticStatus = exactPublicationSemanticStatus(
    input.semanticStatus,
    input.artifactPayload,
  );
  const providerEvidence = canonicalProviderEvidence(input.providerEvidence);
  assertGitHubProviderBinding(providerEvidence, input.githubEvidence);
  const providerCounts = readerSummaryWeeklyCanonicalProviderKeys.map(
    (providerKey) => ({
      providerKey,
      count: providerEvidence.filter(
        (evidence) => evidence.providerKey === providerKey,
      ).length,
    }),
  );
  assertPublicationEvidenceSemantics(
    semanticStatus,
    providerEvidence,
    providerCounts,
    input.githubEvidence,
  );
  const publicationId = exactReaderSummaryWeeklyIdentity(
    input.publicationId,
    "publication id",
  );
  const artifactId = exactReaderSummaryWeeklyIdentity(
    input.artifactId,
    "artifact id",
  );
  if (publicationId !== artifactId) {
    throw new Error(
      "Reader summary weekly publication and artifact identities do not match",
    );
  }
  const body = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyPublicationEvidenceSchemaVersion,
    tenantId: exactReaderSummaryWeeklyIdentity(input.tenantId, "tenant id"),
    workspaceId: exactReaderSummaryWeeklyIdentity(
      input.workspaceId,
      "workspace id",
    ),
    scope: canonicalReaderSummaryWeeklyScope(input.scope),
    period: readerSummaryWeeklyDailyPeriod(requestedUtcDate),
    requestedUtcDate,
    publicationId,
    artifactId,
    jobId: exactReaderSummaryWeeklyIdentity(input.jobId, "job id"),
    reportId: `reader-summary-report:${publicationId}`,
    proofId: `reader-summary-proof:${publicationId}`,
    semanticStatus,
    reportSha256: canonicalizeReaderSummaryWeeklyJson(
      input.report,
      "publication report",
    ).sha256,
    proofSha256: canonicalizeReaderSummaryWeeklyJson(
      input.exactProof,
      "publication exact proof",
    ).sha256,
    artifactPayloadSha256: canonicalizeReaderSummaryWeeklyJson(
      input.artifactPayload,
      "publication artifact payload",
    ).sha256,
    providerEvidenceSha256: canonicalizeReaderSummaryWeeklyJson(
      providerEvidence,
      "publication provider evidence",
    ).sha256,
    providerEvidence,
    providerCounts,
    githubEvidence: input.githubEvidence,
    publishedAt: exactReaderSummaryWeeklyUtcTimestamp(
      input.publishedAt,
      "publication publishedAt",
    ),
  });
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "canonical publication evidence",
  );
  return deepFreezeReaderSummaryWeekly({
    ...body,
    identity: `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${canonical.sha256}`,
    sha256: canonical.sha256,
    canonicalJson: canonical.json,
    byteLength: canonical.byteLength,
    toBytes: (): Uint8Array => canonical.toBytes(),
  });
};

export function assertReaderSummaryWeeklyCanonicalPublicationEvidence(
  input: unknown,
): asserts input is ReaderSummaryWeeklyCanonicalPublicationEvidence {
  assertReaderSummaryWeeklyExactObject(
    input,
    canonicalPublicationEvidenceKeys,
    "canonical publication evidence",
    { allowAuthoritativeHashes: true },
  );
  const evidence =
    input as unknown as ReaderSummaryWeeklyCanonicalPublicationEvidence;
  const body = JSON.parse(evidence.canonicalJson) as unknown;
  assertReaderSummaryWeeklyExactObject(
    body,
    publicationEvidenceBodyKeys,
    "persisted publication evidence body",
    { allowAuthoritativeHashes: true },
  );
  const persistedBody = body as unknown as PublicationEvidenceBody;
  const requestedUtcDate = exactReaderSummaryWeeklyUtcDay(
    evidence.requestedUtcDate,
  );
  assertReaderSummaryWeeklyDailyPeriod(
    evidence.period,
    requestedUtcDate,
    "persisted publication evidence",
  );
  canonicalReaderSummaryWeeklyScope(evidence.scope);
  assertReaderSummaryWeeklyPublicationGitHubEvidence(evidence.githubEvidence);
  if (evidence.githubEvidence.requestedUtcDay !== requestedUtcDate) {
    throw new Error(
      "Reader summary weekly publication and GitHub days do not match",
    );
  }
  const providerEvidence = canonicalProviderEvidence(
    evidence.providerEvidence,
  );
  assertGitHubProviderBinding(providerEvidence, evidence.githubEvidence);
  if (
    canonicalizeReaderSummaryWeeklyJson(providerEvidence).sha256 !==
    exactReaderSummaryWeeklySha256(
      evidence.providerEvidenceSha256,
      "publication provider evidence hash",
    )
  ) {
    throw new Error(
      "Reader summary weekly publication provider evidence seal is invalid",
    );
  }
  assertPublicationEvidenceSemantics(
    evidence.semanticStatus,
    providerEvidence,
    evidence.providerCounts,
    evidence.githubEvidence,
  );
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    persistedBody,
    "persisted publication evidence",
  );
  const bytes = evidence.toBytes();
  if (
    evidence.schemaVersion !==
      readerSummaryWeeklyPublicationEvidenceSchemaVersion ||
    evidence.publicationId !== evidence.artifactId ||
    evidence.reportId !== `reader-summary-report:${evidence.publicationId}` ||
    evidence.proofId !== `reader-summary-proof:${evidence.publicationId}` ||
    exactReaderSummaryWeeklyIdentity(evidence.tenantId, "tenant id") !==
      evidence.tenantId ||
    exactReaderSummaryWeeklyIdentity(evidence.workspaceId, "workspace id") !==
      evidence.workspaceId ||
    exactReaderSummaryWeeklyIdentity(
      evidence.publicationId,
      "publication id",
    ) !== evidence.publicationId ||
    exactReaderSummaryWeeklyIdentity(evidence.jobId, "job id") !==
      evidence.jobId ||
    exactReaderSummaryWeeklySha256(
      evidence.reportSha256,
      "publication report hash",
    ) !== evidence.reportSha256 ||
    exactReaderSummaryWeeklySha256(
      evidence.proofSha256,
      "publication proof hash",
    ) !== evidence.proofSha256 ||
    exactReaderSummaryWeeklySha256(
      evidence.artifactPayloadSha256,
      "publication artifact hash",
    ) !== evidence.artifactPayloadSha256 ||
    exactReaderSummaryWeeklyUtcTimestamp(
      evidence.publishedAt,
      "publication publishedAt",
    ) !== evidence.publishedAt ||
    exactReaderSummaryWeeklySha256(evidence.sha256, "publication evidence hash") !==
      canonical.sha256 ||
    evidence.identity !==
      `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${canonical.sha256}` ||
    evidence.byteLength !== canonical.byteLength ||
    evidence.canonicalJson !== canonical.json ||
    !(bytes instanceof Uint8Array) ||
    Buffer.from(bytes).compare(Buffer.from(canonical.toBytes())) !== 0 ||
    canonicalizeReaderSummaryWeeklyJson(
      publicationEvidenceBody(evidence),
      "publication evidence body",
    ).json !== canonical.json
  ) {
    throw new Error(
      "Reader summary weekly canonical publication evidence seal is invalid",
    );
  }
}

const publicationEvidenceBody = (
  evidence: ReaderSummaryWeeklyCanonicalPublicationEvidence,
): PublicationEvidenceBody => {
  const {
    identity: _identity,
    sha256: _sha256,
    canonicalJson: _canonicalJson,
    byteLength: _byteLength,
    toBytes: _toBytes,
    ...body
  } = evidence;
  return body;
};
