import {
  assertReaderSummaryWeeklyCanonicalPublicationEvidence,
  type ReaderSummaryWeeklyCanonicalPublicationEvidence,
  type ReaderSummaryWeeklyPublicationProviderEvidence,
} from "../../../domain/value-objects/reader-summary-weekly-publication-evidence";
import {
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyHistoricalArtifactJson,
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  readerSummaryWeeklyScopeKey,
} from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  assertReaderSummaryWeeklyPublicationGitHubEvidence,
  type ReaderSummaryWeeklyPublicationGitHubEvidence,
} from "../../../domain/value-objects/reader-summary-weekly-publication-github-evidence";
import {
  assertReaderSummaryWeeklyStoryAuthorityBinding,
  readerSummaryWeeklyStoryAuthoritySchemaVersion,
  type ReaderSummaryWeeklyStoryAuthorityBinding,
  type ReaderSummaryWeeklyStoryAuthorityEvidence,
} from "../../../domain/value-objects/reader-summary-weekly-story-authority";
import type {
  LoadReaderSummaryWeeklyStoryAuthorityQuery,
  ReaderSummaryWeeklyStoryAuthorityHandle,
  ReaderSummaryWeeklyStoryAuthorityPort,
} from "../../../ports/reader-summary-weekly-story-authority.port";
import type { PrismaSummaryClient } from "./prisma-summary-client";

type WeeklyPublicationEvidenceRow = Readonly<{
  publicationId: string;
  tenantId: string;
  workspaceId: string;
  scopeType: string;
  scopeKey: string;
  cadence: string;
  periodStartedAt: Date;
  periodEndedAt: Date;
  periodTimezone: string;
  requestedUtcDate: Date;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  reportId: string;
  proofId: string;
  semanticStatus: string;
  report: unknown;
  reportSha256: string;
  exactProof: unknown;
  proofSha256: string;
  artifactPayloadSha256: string;
  providerEvidence: unknown;
  providerEvidenceSha256: string;
  githubEvidence: unknown;
  canonicalRecord: unknown;
  canonicalBytes: Uint8Array;
  canonicalSha256: string;
  identity: string;
  recordedAt: Date;
}>;

const authorityConstructorToken = Object.freeze({});
const prismaLoadedAuthorities = new WeakSet<object>();
const prismaAuthorityBindings =
  new WeakMap<object, ReaderSummaryWeeklyStoryAuthorityBinding>();

class PrismaLoadedReaderSummaryWeeklyStoryAuthorityHandle {
  constructor(
    token: object,
    binding: ReaderSummaryWeeklyStoryAuthorityBinding,
  ) {
    if (token !== authorityConstructorToken) {
      throw new Error(
        "Reader summary weekly story authority is not publicly constructible",
      );
    }
    assertReaderSummaryWeeklyStoryAuthorityBinding(binding);
    prismaAuthorityBindings.set(this, cloneAuthorityBinding(binding));
    prismaLoadedAuthorities.add(this);
    Object.freeze(this);
  }
}
Object.freeze(PrismaLoadedReaderSummaryWeeklyStoryAuthorityHandle.prototype);

export class PrismaReaderSummaryWeeklyStoryAuthority
  implements ReaderSummaryWeeklyStoryAuthorityPort
{
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async load(
    query: LoadReaderSummaryWeeklyStoryAuthorityQuery,
  ): Promise<ReaderSummaryWeeklyStoryAuthorityHandle | null> {
    const exactQuery = exactAuthorityQuery(query);
    const rows = await this.prisma.$queryRaw<
      readonly WeeklyPublicationEvidenceRow[]
    >`
      SELECT
        "publication_id"::text AS "publicationId",
        "tenant_id"::text AS "tenantId",
        "workspace_id"::text AS "workspaceId",
        "scope_type" AS "scopeType",
        "scope_key" AS "scopeKey",
        "cadence",
        "period_started_at" AS "periodStartedAt",
        "period_ended_at" AS "periodEndedAt",
        "period_timezone" AS "periodTimezone",
        "requested_utc_date" AS "requestedUtcDate",
        "reader_summary_job_id"::text AS "readerSummaryJobId",
        "reader_summary_artifact_id"::text AS "readerSummaryArtifactId",
        "report_id" AS "reportId",
        "proof_id" AS "proofId",
        "semantic_status"::text AS "semanticStatus",
        "report",
        btrim("report_sha256") AS "reportSha256",
        "exact_proof" AS "exactProof",
        btrim("proof_sha256") AS "proofSha256",
        btrim("artifact_payload_sha256") AS "artifactPayloadSha256",
        "provider_evidence" AS "providerEvidence",
        btrim("provider_evidence_sha256") AS "providerEvidenceSha256",
        "github_evidence" AS "githubEvidence",
        "canonical_record" AS "canonicalRecord",
        "canonical_bytes" AS "canonicalBytes",
        btrim("canonical_sha256") AS "canonicalSha256",
        "identity",
        "recorded_at" AS "recordedAt"
      FROM "reader_summary_weekly_publication_evidence"
      WHERE "tenant_id" = ${exactQuery.tenantId}::uuid
        AND "workspace_id" = ${exactQuery.workspaceId}::uuid
        AND "publication_id" = ${exactQuery.publicationId}::uuid
      LIMIT 2
    `;
    if (rows.length === 0) {
      return null;
    }
    if (rows.length !== 1) {
      throw new Error(
        "Reader summary weekly story authority lookup was not unique",
      );
    }
    return authorityFromVerifiedRow(rows[0]!, exactQuery);
  }

  readVerifiedBinding(
    handle: ReaderSummaryWeeklyStoryAuthorityHandle,
  ): ReaderSummaryWeeklyStoryAuthorityBinding {
    if (typeof handle !== "object" || handle === null) {
      throw untrustedAuthorityError();
    }
    const loadedHandle = handle as unknown as object;
    const binding = prismaAuthorityBindings.get(loadedHandle);
    if (
      !prismaLoadedAuthorities.has(loadedHandle) ||
      binding === undefined
    ) {
      throw untrustedAuthorityError();
    }
    assertReaderSummaryWeeklyStoryAuthorityBinding(binding);
    return cloneAuthorityBinding(binding);
  }
}

const exactAuthorityQuery = (
  query: LoadReaderSummaryWeeklyStoryAuthorityQuery,
): LoadReaderSummaryWeeklyStoryAuthorityQuery => {
  assertReaderSummaryWeeklyExactObject(
    query,
    ["tenantId", "workspaceId", "publicationId"],
    "story authority query",
  );
  return {
    tenantId: exactReaderSummaryWeeklyIdentity(
      query.tenantId,
      "story authority query tenant id",
    ),
    workspaceId: exactReaderSummaryWeeklyIdentity(
      query.workspaceId,
      "story authority query workspace id",
    ),
    publicationId: exactReaderSummaryWeeklyIdentity(
      query.publicationId,
      "story authority query publication id",
    ),
  };
};

const authorityFromVerifiedRow = (
  row: WeeklyPublicationEvidenceRow,
  query: LoadReaderSummaryWeeklyStoryAuthorityQuery,
): ReaderSummaryWeeklyStoryAuthorityHandle => {
  assertExactRowScope(row, query);
  const canonicalRecord = canonicalizeReaderSummaryWeeklyJson(
    row.canonicalRecord,
    "persisted story publication canonical record",
  );
  const canonicalBytes = exactBytes(
    row.canonicalBytes,
    "persisted story publication canonical bytes",
  );
  const canonicalSha256 = exactReaderSummaryWeeklySha256(
    row.canonicalSha256,
    "persisted story publication canonical hash",
  );
  if (
    Buffer.from(canonicalRecord.toBytes()).compare(canonicalBytes) !== 0 ||
    canonicalRecord.sha256 !== canonicalSha256 ||
    row.identity !==
      `reader_summary.weekly_publication_evidence.v1:${canonicalSha256}`
  ) {
    throw new Error(
      "Reader summary weekly story publication canonical record, bytes, hash, or identity diverged",
    );
  }

  const publication = publicationFromCanonicalBytes(
    canonicalBytes,
    row.identity,
    canonicalSha256,
  );
  assertReaderSummaryWeeklyCanonicalPublicationEvidence(publication);
  assertPersistedHashes(row, publication);
  assertPersistedBindings(row, publication);
  return createLoadedAuthority(storyAuthorityBinding(publication));
};

const publicationFromCanonicalBytes = (
  bytes: Buffer,
  identity: string,
  sha256: string,
): ReaderSummaryWeeklyCanonicalPublicationEvidence => {
  let body: unknown;
  try {
    body = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new Error(
      "Reader summary weekly story publication canonical bytes are not JSON",
    );
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error(
      "Reader summary weekly story publication canonical bytes are invalid",
    );
  }
  const canonicalJson = bytes.toString("utf8");
  return {
    ...(body as Omit<
      ReaderSummaryWeeklyCanonicalPublicationEvidence,
      "identity" | "sha256" | "canonicalJson" | "byteLength" | "toBytes"
    >),
    identity,
    sha256,
    canonicalJson,
    byteLength: bytes.byteLength,
    toBytes: (): Uint8Array => Uint8Array.from(bytes),
  };
};

const assertExactRowScope = (
  row: WeeklyPublicationEvidenceRow,
  query: LoadReaderSummaryWeeklyStoryAuthorityQuery,
): void => {
  if (
    row.tenantId !== query.tenantId ||
    row.workspaceId !== query.workspaceId ||
    row.publicationId !== query.publicationId
  ) {
    throw new Error(
      "Reader summary weekly story authority row escaped exact tenant, workspace, or publication scope",
    );
  }
};

const assertPersistedHashes = (
  row: WeeklyPublicationEvidenceRow,
  publication: ReaderSummaryWeeklyCanonicalPublicationEvidence,
): void => {
  assertReaderSummaryWeeklyPublicationGitHubEvidence(row.githubEvidence);
  const githubEvidence =
    row.githubEvidence as ReaderSummaryWeeklyPublicationGitHubEvidence;
  const reportArtifactPayload = artifactPayloadFromReport(row.report);
  const persistedHashes = [
    [
      canonicalizeReaderSummaryWeeklyHistoricalArtifactJson(
        row.report,
        "persisted story publication report",
      ).sha256,
      row.reportSha256,
      publication.reportSha256,
    ],
    [
      canonicalizeReaderSummaryWeeklyJson(row.exactProof).sha256,
      row.proofSha256,
      publication.proofSha256,
    ],
    [
      canonicalizeReaderSummaryWeeklyHistoricalArtifactJson(
        reportArtifactPayload,
        "persisted story publication artifact payload",
      ).sha256,
      row.artifactPayloadSha256,
      publication.artifactPayloadSha256,
    ],
    [
      canonicalizeReaderSummaryWeeklyJson(row.providerEvidence).sha256,
      row.providerEvidenceSha256,
      publication.providerEvidenceSha256,
    ],
  ] as const;
  if (
    persistedHashes.some(
      ([computed, persisted, canonical]) =>
        computed !==
          exactReaderSummaryWeeklySha256(
            persisted,
            "persisted story publication hash",
          ) || persisted !== canonical,
    ) ||
    canonicalizeReaderSummaryWeeklyJson(row.providerEvidence).json !==
      canonicalizeReaderSummaryWeeklyJson(
        publication.providerEvidence,
      ).json ||
    canonicalizeReaderSummaryWeeklyJson(githubEvidence).json !==
      canonicalizeReaderSummaryWeeklyJson(
        publication.githubEvidence,
      ).json
  ) {
    throw new Error(
      "Reader summary weekly story publication persisted hash diverged",
    );
  }
};

const artifactPayloadFromReport = (report: unknown): unknown => {
  if (
    typeof report !== "object" ||
    report === null ||
    Array.isArray(report) ||
    !Object.hasOwn(report, "artifactPayload")
  ) {
    throw new Error(
      "Reader summary weekly story publication report artifact payload is missing",
    );
  }
  return (report as Readonly<Record<string, unknown>>).artifactPayload;
};

const assertPersistedBindings = (
  row: WeeklyPublicationEvidenceRow,
  publication: ReaderSummaryWeeklyCanonicalPublicationEvidence,
): void => {
  const startedAt = exactDate(row.periodStartedAt, "period start");
  const endedAt = exactDate(row.periodEndedAt, "period end");
  const requestedUtcDate = exactDate(
    row.requestedUtcDate,
    "requested UTC date",
  );
  const recordedAt = exactDate(row.recordedAt, "recorded at");
  if (
    row.tenantId !== publication.tenantId ||
    row.workspaceId !== publication.workspaceId ||
    row.publicationId !== publication.publicationId ||
    row.readerSummaryArtifactId !== publication.artifactId ||
    row.readerSummaryJobId !== publication.jobId ||
    row.reportId !== publication.reportId ||
    row.proofId !== publication.proofId ||
    row.semanticStatus !== publication.semanticStatus ||
    row.scopeType !== publication.scope.type ||
    row.scopeKey !== readerSummaryWeeklyScopeKey(publication.scope) ||
    row.cadence !== publication.period.cadence ||
    row.periodTimezone !== publication.period.timezone ||
    startedAt !== publication.period.startedAt ||
    endedAt !== publication.period.endedAt ||
    requestedUtcDate.slice(0, 10) !== publication.requestedUtcDate ||
    requestedUtcDate !== `${publication.requestedUtcDate}T00:00:00.000Z` ||
    recordedAt !== publication.publishedAt
  ) {
    throw new Error(
      "Reader summary weekly story publication persisted identity or scope diverged",
    );
  }
};

const storyAuthorityBinding = (
  publication: ReaderSummaryWeeklyCanonicalPublicationEvidence,
): ReaderSummaryWeeklyStoryAuthorityBinding => {
  const body = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyStoryAuthoritySchemaVersion,
    tenantId: publication.tenantId,
    workspaceId: publication.workspaceId,
    scope: publication.scope,
    requestedUtcDate: publication.requestedUtcDate,
    publicationId: publication.publicationId,
    artifactId: publication.artifactId,
    jobId: publication.jobId,
    reportId: publication.reportId,
    proofId: publication.proofId,
    publicationEvidenceIdentity: publication.identity,
    publicationEvidenceSha256: publication.sha256,
    reportSha256: publication.reportSha256,
    proofSha256: publication.proofSha256,
    artifactPayloadSha256: publication.artifactPayloadSha256,
    providerEvidenceSha256: publication.providerEvidenceSha256,
    githubEvidenceSha256: publication.githubEvidence.sha256,
    semanticStatus: publication.semanticStatus,
    publishedAt: publication.publishedAt,
    evidence: publication.providerEvidence
      .filter((item) => factualEvidenceForRequestedDay(
        item,
        publication.requestedUtcDate,
      ))
      .map(authorityEvidenceReference),
  });
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "Prisma-loaded story authority",
  );
  const binding = deepFreezeReaderSummaryWeekly({
    ...body,
    identity:
      `${readerSummaryWeeklyStoryAuthoritySchemaVersion}:${canonical.sha256}`,
    sha256: canonical.sha256,
  });
  assertReaderSummaryWeeklyStoryAuthorityBinding(binding);
  return binding;
};

const authorityEvidenceReference = (
  input: ReaderSummaryWeeklyPublicationProviderEvidence,
): ReaderSummaryWeeklyStoryAuthorityEvidence => ({
  providerKey: input.providerKey,
  citationId: input.citationId,
  citationField: input.citationField,
  feedItemId: input.feedItemId,
  sourceItemId: input.sourceItemId,
  sourceBindingId: input.sourceBindingId,
  providerItemId: input.providerItemId,
  canonicalUrl: input.canonicalUrl,
  sourceContentHash: input.sourceContentHash,
  publishedAt: input.publishedAt,
  observedAt: input.observedAt,
});

const factualEvidenceForRequestedDay = (
  input: ReaderSummaryWeeklyPublicationProviderEvidence,
  requestedUtcDate: string,
): boolean =>
  input.publishedAt.slice(0, 10) === requestedUtcDate;

const createLoadedAuthority = (
  binding: ReaderSummaryWeeklyStoryAuthorityBinding,
): ReaderSummaryWeeklyStoryAuthorityHandle =>
  new PrismaLoadedReaderSummaryWeeklyStoryAuthorityHandle(
    authorityConstructorToken,
    binding,
  ) as unknown as ReaderSummaryWeeklyStoryAuthorityHandle;

const cloneAuthorityBinding = (
  binding: ReaderSummaryWeeklyStoryAuthorityBinding,
): ReaderSummaryWeeklyStoryAuthorityBinding =>
  deepFreezeReaderSummaryWeekly({
    ...binding,
    scope: { ...binding.scope },
    evidence: binding.evidence.map((item) => ({ ...item })),
  });

const exactBytes = (input: unknown, label: string): Buffer => {
  if (!(input instanceof Uint8Array)) {
    throw new Error(`Reader summary weekly ${label} are invalid`);
  }
  return Buffer.from(input);
};

const exactDate = (input: unknown, label: string): string => {
  if (!(input instanceof Date) || !Number.isFinite(input.getTime())) {
    throw new Error(`Reader summary weekly persisted ${label} is invalid`);
  }
  return input.toISOString();
};

const untrustedAuthorityError = (): Error =>
  new Error(
    "Reader summary weekly story authority was not loaded by verified Prisma publication evidence",
  );
