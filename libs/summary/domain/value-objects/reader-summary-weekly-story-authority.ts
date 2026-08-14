import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  canonicalReaderSummaryWeeklyScope,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyHttpsUrl,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklyProviderItemId,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
  exactReaderSummaryWeeklyUtcTimestamp,
  type ReaderSummaryWeeklyManifestScope,
} from "./reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyCanonicalProviderKeys,
  type ReaderSummaryWeeklyCanonicalProviderKey,
} from "./reader-summary-weekly-daily-certification";
import {
  readerSummaryWeeklyPublicationEvidenceSchemaVersion,
} from "./reader-summary-weekly-publication-evidence";

export const readerSummaryWeeklyStoryAuthoritySchemaVersion =
  "reader_summary.weekly_story_authority.v1" as const;

export type ReaderSummaryWeeklyStoryAuthorityEvidence = Readonly<{
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey;
  citationId: string;
  citationField: "title" | "bodyPreview" | "canonicalUrl";
  feedItemId: string;
  sourceItemId: string;
  sourceBindingId: string;
  providerItemId: string;
  canonicalUrl: string;
  sourceContentHash: string;
  publishedAt: string;
  observedAt: string;
}>;

type ReaderSummaryWeeklyStoryAuthorityBody = Readonly<{
  schemaVersion: typeof readerSummaryWeeklyStoryAuthoritySchemaVersion;
  tenantId: string;
  workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope;
  requestedUtcDate: string;
  publicationId: string;
  artifactId: string;
  jobId: string;
  reportId: string;
  proofId: string;
  publicationEvidenceIdentity: string;
  publicationEvidenceSha256: string;
  reportSha256: string;
  proofSha256: string;
  artifactPayloadSha256: string;
  providerEvidenceSha256: string;
  githubEvidenceSha256: string;
  semanticStatus: "COMPLETED" | "NO_SIGNAL";
  publishedAt: string;
  evidence: readonly ReaderSummaryWeeklyStoryAuthorityEvidence[];
}>;

export type ReaderSummaryWeeklyStoryAuthorityBinding =
  ReaderSummaryWeeklyStoryAuthorityBody &
    Readonly<{
      identity: string;
      sha256: string;
    }>;

const authorityBindingKeys = [
  "schemaVersion",
  "tenantId",
  "workspaceId",
  "scope",
  "requestedUtcDate",
  "publicationId",
  "artifactId",
  "jobId",
  "reportId",
  "proofId",
  "publicationEvidenceIdentity",
  "publicationEvidenceSha256",
  "reportSha256",
  "proofSha256",
  "artifactPayloadSha256",
  "providerEvidenceSha256",
  "githubEvidenceSha256",
  "semanticStatus",
  "publishedAt",
  "evidence",
  "identity",
  "sha256",
] as const;
const evidenceKeys = [
  "providerKey",
  "citationId",
  "citationField",
  "feedItemId",
  "sourceItemId",
  "sourceBindingId",
  "providerItemId",
  "canonicalUrl",
  "sourceContentHash",
  "publishedAt",
  "observedAt",
] as const;

export function assertReaderSummaryWeeklyStoryAuthorityBinding(
  input: unknown,
): asserts input is ReaderSummaryWeeklyStoryAuthorityBinding {
  assertReaderSummaryWeeklyExactObject(
    input,
    authorityBindingKeys,
    "story authority binding",
    { allowAuthoritativeHashes: true },
  );
  const binding =
    input as unknown as ReaderSummaryWeeklyStoryAuthorityBinding;
  const requestedUtcDate = exactReaderSummaryWeeklyUtcDay(
    binding.requestedUtcDate,
  );
  const publicationId = exactReaderSummaryWeeklyIdentity(
    binding.publicationId,
    "story authority publication id",
  );
  const publicationEvidenceSha256 = exactReaderSummaryWeeklySha256(
    binding.publicationEvidenceSha256,
    "story publication evidence hash",
  );
  const evidence = canonicalAuthorityEvidence(
    binding.evidence,
    requestedUtcDate,
  );
  const body = authorityBody(binding, evidence);
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "story authority binding body",
  );
  if (
    binding.schemaVersion !== readerSummaryWeeklyStoryAuthoritySchemaVersion ||
    binding.tenantId !==
      exactReaderSummaryWeeklyIdentity(
        binding.tenantId,
        "story authority tenant id",
      ) ||
    binding.workspaceId !==
      exactReaderSummaryWeeklyIdentity(
        binding.workspaceId,
        "story authority workspace id",
      ) ||
    canonicalizeReaderSummaryWeeklyJson(binding.scope).json !==
      canonicalizeReaderSummaryWeeklyJson(
        canonicalReaderSummaryWeeklyScope(binding.scope),
      ).json ||
    binding.artifactId !== publicationId ||
    binding.reportId !== `reader-summary-report:${publicationId}` ||
    binding.proofId !== `reader-summary-proof:${publicationId}` ||
    binding.publicationEvidenceIdentity !==
      `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${publicationEvidenceSha256}` ||
    binding.identity !==
      `${readerSummaryWeeklyStoryAuthoritySchemaVersion}:${canonical.sha256}` ||
    exactReaderSummaryWeeklySha256(
      binding.sha256,
      "story authority hash",
    ) !== canonical.sha256 ||
    canonicalizeReaderSummaryWeeklyJson(binding.evidence).json !==
      canonicalizeReaderSummaryWeeklyJson(evidence).json
  ) {
    throw new Error(
      "Reader summary weekly story authority binding seal is invalid",
    );
  }
}

const authorityBody = (
  binding: ReaderSummaryWeeklyStoryAuthorityBinding,
  evidence: readonly ReaderSummaryWeeklyStoryAuthorityEvidence[],
): ReaderSummaryWeeklyStoryAuthorityBody => {
  const status = exactSemanticStatus(binding.semanticStatus);
  assertEvidenceSemantics(status, evidence);
  return {
    schemaVersion: readerSummaryWeeklyStoryAuthoritySchemaVersion,
    tenantId: binding.tenantId,
    workspaceId: binding.workspaceId,
    scope: binding.scope,
    requestedUtcDate: binding.requestedUtcDate,
    publicationId: binding.publicationId,
    artifactId: binding.artifactId,
    jobId: exactReaderSummaryWeeklyIdentity(
      binding.jobId,
      "story authority job id",
    ),
    reportId: binding.reportId,
    proofId: binding.proofId,
    publicationEvidenceIdentity: binding.publicationEvidenceIdentity,
    publicationEvidenceSha256: binding.publicationEvidenceSha256,
    reportSha256: exactReaderSummaryWeeklySha256(
      binding.reportSha256,
      "story authority report hash",
    ),
    proofSha256: exactReaderSummaryWeeklySha256(
      binding.proofSha256,
      "story authority proof hash",
    ),
    artifactPayloadSha256: exactReaderSummaryWeeklySha256(
      binding.artifactPayloadSha256,
      "story authority artifact payload hash",
    ),
    providerEvidenceSha256: exactReaderSummaryWeeklySha256(
      binding.providerEvidenceSha256,
      "story authority provider evidence hash",
    ),
    githubEvidenceSha256: exactReaderSummaryWeeklySha256(
      binding.githubEvidenceSha256,
      "story authority GitHub evidence hash",
    ),
    semanticStatus: status,
    publishedAt: exactReaderSummaryWeeklyUtcTimestamp(
      binding.publishedAt,
      "story authority publishedAt",
    ),
    evidence,
  };
};

const canonicalAuthorityEvidence = (
  input: readonly ReaderSummaryWeeklyStoryAuthorityEvidence[],
  requestedUtcDate: string,
): readonly ReaderSummaryWeeklyStoryAuthorityEvidence[] => {
  assertReaderSummaryWeeklyDenseArray(input, "story authority evidence");
  const evidence = input
    .map((item) => canonicalAuthorityEvidenceItem(item, requestedUtcDate))
    .sort(compareAuthorityEvidence);
  assertSameDayEvidenceUniqueness(evidence);
  return deepFreezeReaderSummaryWeekly(evidence);
};

const canonicalAuthorityEvidenceItem = (
  input: ReaderSummaryWeeklyStoryAuthorityEvidence,
  requestedUtcDate: string,
): ReaderSummaryWeeklyStoryAuthorityEvidence => {
  assertReaderSummaryWeeklyExactObject(
    input,
    evidenceKeys,
    "story authority evidence item",
    { allowAuthoritativeHashes: true },
  );
  if (!readerSummaryWeeklyCanonicalProviderKeys.includes(input.providerKey)) {
    throw new Error("Reader summary weekly story provider is not canonical");
  }
  const publishedAt = exactReaderSummaryWeeklyUtcTimestamp(
    input.publishedAt,
    "story evidence publishedAt",
  );
  const observedAt = exactReaderSummaryWeeklyUtcTimestamp(
    input.observedAt,
    "story evidence observedAt",
  );
  if (publishedAt.slice(0, 10) !== requestedUtcDate) {
    throw new Error(
      "Reader summary weekly story evidence is not factual for the requested UTC date",
    );
  }
  return {
    providerKey: input.providerKey,
    citationId: exactReaderSummaryWeeklyIdentity(
      input.citationId,
      "story citation id",
    ),
    citationField: exactCitationField(input.citationField),
    feedItemId: exactReaderSummaryWeeklyIdentity(
      input.feedItemId,
      "story feed item id",
    ),
    sourceItemId: exactReaderSummaryWeeklyIdentity(
      input.sourceItemId,
      "story source item id",
    ),
    sourceBindingId: exactReaderSummaryWeeklyIdentity(
      input.sourceBindingId,
      "story source binding id",
    ),
    providerItemId: exactReaderSummaryWeeklyProviderItemId(
      input.providerItemId,
      "story provider item id",
    ),
    canonicalUrl: exactCanonicalUrl(input.canonicalUrl),
    sourceContentHash: exactReaderSummaryWeeklySha256(
      input.sourceContentHash,
      "story source content hash",
    ),
    publishedAt,
    observedAt,
  };
};

const exactSemanticStatus = (
  input: unknown,
): "COMPLETED" | "NO_SIGNAL" => {
  if (input !== "COMPLETED" && input !== "NO_SIGNAL") {
    throw new Error("Reader summary weekly story authority status is invalid");
  }
  return input;
};

const assertEvidenceSemantics = (
  status: "COMPLETED" | "NO_SIGNAL",
  evidence: readonly ReaderSummaryWeeklyStoryAuthorityEvidence[],
): void => {
  if (
    (status === "COMPLETED" && evidence.length === 0) ||
    (status === "NO_SIGNAL" && evidence.length !== 0)
  ) {
    throw new Error(
      "Reader summary weekly story authority evidence contradicts publication status",
    );
  }
};

const exactCitationField = (
  input: unknown,
): ReaderSummaryWeeklyStoryAuthorityEvidence["citationField"] => {
  if (
    input !== "title" &&
    input !== "bodyPreview" &&
    input !== "canonicalUrl"
  ) {
    throw new Error("Reader summary weekly story citation field is invalid");
  }
  return input;
};

const exactCanonicalUrl = (input: unknown): string => {
  return exactReaderSummaryWeeklyHttpsUrl(
    input,
    "story canonical URL",
  );
};

const assertSameDayEvidenceUniqueness = (
  evidence: readonly ReaderSummaryWeeklyStoryAuthorityEvidence[],
): void => {
  for (const [values, label] of [
    [evidence.map((item) => item.citationId), "citation identities"],
    [evidence.map((item) => item.feedItemId), "feed identities"],
    [evidence.map((item) => item.sourceItemId), "source identities"],
    [
      evidence.map(
        (item) => `${item.providerKey}\u0000${item.providerItemId}`,
      ),
      "provider item identities",
    ],
  ] as const) {
    if (new Set(values).size !== values.length) {
      throw new Error(
        `Reader summary weekly story authority has ambiguous ${label}`,
      );
    }
  }
};

const compareAuthorityEvidence = (
  left: ReaderSummaryWeeklyStoryAuthorityEvidence,
  right: ReaderSummaryWeeklyStoryAuthorityEvidence,
): number =>
  readerSummaryWeeklyCanonicalProviderKeys.indexOf(left.providerKey) -
    readerSummaryWeeklyCanonicalProviderKeys.indexOf(right.providerKey) ||
  lexicalCompare(left.sourceItemId, right.sourceItemId) ||
  lexicalCompare(left.citationId, right.citationId);

const lexicalCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
