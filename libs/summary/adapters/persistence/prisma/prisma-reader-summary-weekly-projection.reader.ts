import type {
  ReadReaderSummaryWeeklyProjectionQuery,
  ReaderSummaryWeeklyEvidenceLimitation,
  ReaderSummaryWeeklyProjectionRead,
  ReaderSummaryWeeklyProjectionReaderPort,
} from "../../../ports/reader-summary-weekly-projection-reader.port";
import {
  assertReaderSummaryWeeklyPublicationGitHubEvidence,
  readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
  type ReaderSummaryWeeklyPublicationGitHubEvidence,
} from "../../../domain/value-objects/reader-summary-weekly-publication-github-evidence";
import type { ReaderSummaryWeeklyCertificationSealBinding } from "../../../domain/value-objects/reader-summary-weekly-certification-seal";
import { findReaderSummaryWeeklyArtifactById } from "./prisma-reader-summary-weekly-artifact";
import { PrismaReaderSummaryWeeklyCertificationSealAuthority } from "./prisma-reader-summary-weekly-certification-seal-authority";
import { PrismaReaderSummaryWeeklyStoryAuthority } from "./prisma-reader-summary-weekly-story-authority";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import { runSerializableReaderSummaryTransaction } from "./prisma-summary-transaction";

type DailyEvidenceRow = Readonly<{
  requestedUtcDate: Date;
  publicationId: string;
  currentPublicationId: string | null;
  githubEvidence: unknown;
}>;

type ActiveWeeklySlotRow = Readonly<{
  currentPublicationId: string | null;
  publicationId: string | null;
  publicationKind: string | null;
  artifactId: string | null;
}>;

type VerifiedDailyEvidence = Readonly<{
  requestedUtcDate: string;
  publicationId: string;
  artifactId: string;
  jobId: string;
  semanticStatus: "COMPLETED" | "NO_SIGNAL";
  publicationEvidenceIdentity: string;
  publicationEvidenceSha256: string;
  githubEvidenceMode: ReaderSummaryWeeklyPublicationGitHubEvidence["mode"];
}>;

type ActiveWeeklyArtifact = Readonly<{
  artifact: NonNullable<ReaderSummaryWeeklyProjectionRead["artifact"]>;
  seal: ReaderSummaryWeeklyCertificationSealBinding;
}>;

export class PrismaReaderSummaryWeeklyProjectionReader
  implements ReaderSummaryWeeklyProjectionReaderPort
{
  constructor(private readonly prisma: PrismaSummaryClient) {}

  read(
    query: ReadReaderSummaryWeeklyProjectionQuery,
  ): Promise<ReaderSummaryWeeklyProjectionRead> {
    return runSerializableReaderSummaryTransaction(
      this.prisma,
      (transaction) => readProjection(
        transaction as PrismaSummaryClient,
        query,
      ),
    );
  }
}

const readProjection = async (
  prisma: PrismaSummaryClient,
  query: ReadReaderSummaryWeeklyProjectionQuery,
): Promise<ReaderSummaryWeeklyProjectionRead> => {
  const [dailyRows, slotRows] = await Promise.all([
    prisma.$queryRaw<readonly DailyEvidenceRow[]>`
      SELECT
        evidence."requested_utc_date" AS "requestedUtcDate",
        evidence."publication_id"::TEXT AS "publicationId",
        daily_slot."current_publication_id"::TEXT AS "currentPublicationId",
        evidence."github_evidence" AS "githubEvidence"
      FROM "reader_summary_weekly_publication_evidence" AS evidence
      JOIN "reader_summary_publication_slots" AS daily_slot
        ON daily_slot."tenant_id" = evidence."tenant_id"
       AND daily_slot."workspace_id" = evidence."workspace_id"
       AND daily_slot."scope_type" = evidence."scope_type"
       AND daily_slot."scope_key" = evidence."scope_key"
       AND daily_slot."cadence" = evidence."cadence"
       AND daily_slot."period_started_at" = evidence."period_started_at"
       AND daily_slot."period_ended_at" = evidence."period_ended_at"
       AND daily_slot."period_timezone" = evidence."period_timezone"
       AND daily_slot."current_publication_id" = evidence."publication_id"
      JOIN "reader_summary_publications" AS daily_publication
        ON daily_publication."id" = daily_slot."current_publication_id"
       AND daily_publication."id" = evidence."publication_id"
       AND daily_publication."tenant_id" = evidence."tenant_id"
       AND daily_publication."workspace_id" = evidence."workspace_id"
       AND daily_publication."scope_type" = evidence."scope_type"
       AND daily_publication."scope_key" = evidence."scope_key"
       AND daily_publication."cadence" = evidence."cadence"
       AND daily_publication."period_started_at" = evidence."period_started_at"
       AND daily_publication."period_ended_at" = evidence."period_ended_at"
       AND daily_publication."period_timezone" = evidence."period_timezone"
       AND daily_publication."requested_utc_date" = evidence."requested_utc_date"
       AND daily_publication."semantic_status" = evidence."semantic_status"
      WHERE evidence."tenant_id" = ${query.tenantId}::UUID
        AND evidence."workspace_id" = ${query.workspaceId}::UUID
        AND evidence."scope_type" = 'workspace'
        AND evidence."scope_key" = 'workspace'
        AND evidence."cadence" = 'daily'
        AND daily_publication."publication_kind" = 'EXACT'
        AND daily_publication."semantic_status" IN ('COMPLETED', 'NO_SIGNAL')
        AND evidence."requested_utc_date" >= ${query.weekStartedOn}::DATE
        AND evidence."requested_utc_date" <= ${query.weekEndedOn}::DATE
      ORDER BY evidence."requested_utc_date", evidence."publication_id"
    `,
    prisma.$queryRaw<readonly ActiveWeeklySlotRow[]>`
      SELECT
        slot."current_publication_id"::TEXT AS "currentPublicationId",
        publication."id"::TEXT AS "publicationId",
        publication."publication_kind" AS "publicationKind",
        publication."reader_summary_artifact_id"::TEXT AS "artifactId"
      FROM "reader_summary_publication_slots" AS slot
      LEFT JOIN "reader_summary_publications" AS publication
        ON publication."id" = slot."current_publication_id"
      WHERE slot."tenant_id" = ${query.tenantId}::UUID
        AND slot."workspace_id" = ${query.workspaceId}::UUID
        AND slot."scope_type" = 'workspace'
        AND slot."scope_key" = 'workspace'
        AND slot."cadence" = 'weekly'
        AND slot."period_started_at" = (
          ${query.weekStartedOn}::DATE::TIMESTAMP AT TIME ZONE 'UTC'
        )
        AND slot."period_ended_at" = (
          ((${query.weekEndedOn}::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC')
        )
        AND slot."period_timezone" = 'UTC'
      LIMIT 2
    `,
  ]);

  if (slotRows.length > 1) {
    throw new Error("Reader summary weekly projection active slot is ambiguous");
  }
  const active = await activeWeeklyArtifact(
    prisma,
    query,
    slotRows[0] ?? null,
  );
  if (active === null) {
    const dailyEvidence = await verifiedDailyEvidence(prisma, query, dailyRows);
    return Object.freeze({
      certifiedDailyEvidenceDates: Object.freeze(
        dailyEvidence.map((item) => item.requestedUtcDate),
      ),
      activeWeeklyCertifiedArtifactPresent: false,
      evidenceLimitations: evidenceLimitations(dailyEvidence),
      artifact: null,
    });
  }
  const dailyEvidence = await verifiedDailyEvidence(
    prisma,
    query,
    dailyRows,
    active.seal,
    active.artifact.proof.authorities,
  );
  return Object.freeze({
    certifiedDailyEvidenceDates: Object.freeze(
      dailyEvidence.map((item) => item.requestedUtcDate),
    ),
    activeWeeklyCertifiedArtifactPresent: true,
    evidenceLimitations: evidenceLimitations(dailyEvidence),
    artifact: active.artifact,
  });
};

const verifiedDailyEvidence = async (
  prisma: PrismaSummaryClient,
  query: ReadReaderSummaryWeeklyProjectionQuery,
  rows: readonly DailyEvidenceRow[],
  seal?: ReaderSummaryWeeklyCertificationSealBinding,
  artifactAuthorities?: NonNullable<
    ReaderSummaryWeeklyProjectionRead["artifact"]
  >["proof"]["authorities"],
): Promise<readonly VerifiedDailyEvidence[]> => {
  const currentRows = rows.filter((row) =>
    row.currentPublicationId !== null &&
    row.publicationId === row.currentPublicationId
  );
  if (seal !== undefined) {
    assertExactDailyAuthoritySet(currentRows, seal.days);
  }
  const authority = new PrismaReaderSummaryWeeklyStoryAuthority(prisma);
  return Promise.all(currentRows.map(async (row, index) => {
    const requestedUtcDate = exactDatabaseDate(
      row.requestedUtcDate,
      "daily evidence date",
    );
    const sealed = seal?.days[index];
    const handle = await authority.load({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      publicationId: row.publicationId,
    });
    if (handle === null) {
      throw new Error(
        "Reader summary weekly projection daily evidence authority is missing",
      );
    }
    const binding = authority.readVerifiedBinding(handle);
    if (
      binding.scope.type !== "workspace" ||
      binding.requestedUtcDate !== requestedUtcDate ||
      binding.publicationId !== row.publicationId ||
      (sealed !== undefined && (
        binding.publicationId !== sealed.publicationId ||
        binding.artifactId !== sealed.artifactId ||
        binding.jobId !== sealed.jobId ||
        binding.semanticStatus !== sealed.semanticStatus ||
        binding.publicationEvidenceIdentity !==
          sealed.publicationEvidenceIdentity ||
        binding.publicationEvidenceSha256 !==
          sealed.publicationEvidenceSha256
      ))
    ) {
      throw new Error(
        "Reader summary weekly projection daily evidence authority diverged",
      );
    }
    assertReaderSummaryWeeklyPublicationGitHubEvidence(row.githubEvidence);
    if (
      row.githubEvidence.requestedUtcDay !== requestedUtcDate ||
      row.githubEvidence.sha256 !== binding.githubEvidenceSha256
    ) {
      throw new Error(
        "Reader summary weekly projection GitHub evidence date diverged",
      );
    }
    const artifactAuthority = artifactAuthorities?.[index];
    if (artifactAuthority !== undefined && (
      artifactAuthority.requestedUtcDate !== binding.requestedUtcDate ||
      artifactAuthority.publicationId !== binding.publicationId ||
      artifactAuthority.publicationEvidenceIdentity !==
        binding.publicationEvidenceIdentity ||
      artifactAuthority.publicationEvidenceSha256 !==
        binding.publicationEvidenceSha256 ||
      artifactAuthority.storyAuthorityIdentity !== binding.identity ||
      artifactAuthority.storyAuthoritySha256 !== binding.sha256 ||
      artifactAuthority.githubBoardIdentity !==
        `${readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion}:${binding.githubEvidenceSha256}` ||
      artifactAuthority.githubBoardSha256 !== binding.githubEvidenceSha256
    )) {
      throw new Error(
        "Reader summary weekly projection artifact authority diverged",
      );
    }
    return Object.freeze({
      requestedUtcDate,
      publicationId: binding.publicationId,
      artifactId: binding.artifactId,
      jobId: binding.jobId,
      semanticStatus: binding.semanticStatus,
      publicationEvidenceIdentity: binding.publicationEvidenceIdentity,
      publicationEvidenceSha256: binding.publicationEvidenceSha256,
      githubEvidenceMode: row.githubEvidence.mode,
    });
  }));
};

const assertExactDailyAuthoritySet = (
  rows: readonly DailyEvidenceRow[],
  sealed: ReaderSummaryWeeklyCertificationSealBinding["days"],
): void => {
  const selected = rows.map((row) => ({
    requestedUtcDate: exactDatabaseDate(row.requestedUtcDate, "daily evidence date"),
    publicationId: row.publicationId,
  }));
  if (
    !hasSevenUniqueAuthorities(sealed) ||
    !hasSevenUniqueAuthorities(selected) ||
    sealed.some((day, index) =>
      authorityKey(day) !== authorityKey(selected[index]!)
    )
  ) {
    throw new Error(
      "Reader summary weekly projection sealed and current daily authorities diverged",
    );
  }
};

const hasSevenUniqueAuthorities = (
  authorities: readonly Readonly<{
    requestedUtcDate: string;
    publicationId: string;
  }>[],
): boolean =>
  authorities.length === 7 &&
  new Set(authorities.map((item) => item.requestedUtcDate)).size === 7 &&
  new Set(authorities.map((item) => item.publicationId)).size === 7;

const authorityKey = (authority: Readonly<{
  requestedUtcDate: string;
  publicationId: string;
}>): string => `${authority.requestedUtcDate}:${authority.publicationId}`;

const evidenceLimitations = (
  evidence: readonly VerifiedDailyEvidence[],
): readonly ReaderSummaryWeeklyEvidenceLimitation[] => {
  return Object.freeze(
    evidence
      .filter((item) => item.githubEvidenceMode === "historical_unavailable")
      .map((item) => Object.freeze({
        requestedUtcDate: item.requestedUtcDate,
        providerKey: "github-trending-page" as const,
        evidenceState: "historical_unavailable" as const,
      }))
      .sort((left, right) =>
        left.requestedUtcDate < right.requestedUtcDate
          ? -1
          : left.requestedUtcDate > right.requestedUtcDate
            ? 1
            : 0
      ),
  );
};

const activeWeeklyArtifact = async (
  prisma: PrismaSummaryClient,
  query: ReadReaderSummaryWeeklyProjectionQuery,
  slot: ActiveWeeklySlotRow | null,
): Promise<ActiveWeeklyArtifact | null> => {
  if (slot === null || slot.currentPublicationId === null) return null;
  if (
    slot.publicationId === null ||
    slot.currentPublicationId !== slot.publicationId
  ) {
    throw new Error(
      "Reader summary weekly projection active publication is invalid",
    );
  }
  if (slot.publicationKind !== "WEEKLY_CERTIFIED") return null;
  if (slot.artifactId === null) {
    throw new Error(
      "Reader summary weekly projection active artifact identity is missing",
    );
  }
  const artifact = await findReaderSummaryWeeklyArtifactById(prisma, {
    tenantId: query.tenantId,
    workspaceId: query.workspaceId,
    artifactId: slot.artifactId,
  });
  if (artifact === null) {
    throw new Error(
      "Reader summary weekly projection active artifact is missing",
    );
  }
  const seal = await assertSealBinding(prisma, query, artifact);
  assertArtifactProofBinding(artifact.proof.authorities, seal.days);
  return Object.freeze({ artifact, seal });
};

const assertSealBinding = async (
  prisma: PrismaSummaryClient,
  query: ReadReaderSummaryWeeklyProjectionQuery,
  artifact: NonNullable<ReaderSummaryWeeklyProjectionRead["artifact"]>,
): Promise<ReaderSummaryWeeklyCertificationSealBinding> => {
  const seal = await certificationSeal(prisma, query);
  if (seal === null) {
    throw new Error(
      "Reader summary weekly projection certification seal is missing",
    );
  }
  if (
    artifact.proof.weekStartedOn !== query.weekStartedOn ||
    artifact.proof.weekEndedOn !== query.weekEndedOn ||
    artifact.proof.manifestSealId !== seal.sealId ||
    artifact.proof.manifestSealSha256 !== seal.sealSha
  ) {
    throw new Error(
      "Reader summary weekly projection artifact seal binding diverged",
    );
  }
  return seal;
};

const certificationSeal = async (
  prisma: PrismaSummaryClient,
  query: ReadReaderSummaryWeeklyProjectionQuery,
): Promise<ReaderSummaryWeeklyCertificationSealBinding | null> => {
  const authority = new PrismaReaderSummaryWeeklyCertificationSealAuthority(
    prisma,
  );
  const handle = await authority.load({
    tenantId: query.tenantId,
    workspaceId: query.workspaceId,
    scope: { type: "workspace" },
    weekStartedOn: query.weekStartedOn,
  });
  if (handle === null) return null;
  const seal = authority.readVerifiedBinding(handle);
  return seal;
};

const assertArtifactProofBinding = (
  authorities: NonNullable<ReaderSummaryWeeklyProjectionRead["artifact"]>["proof"]["authorities"],
  sealed: ReaderSummaryWeeklyCertificationSealBinding["days"],
): void => {
  if (
    authorities.length !== 7 ||
    authorities.some((item, index) => {
      const day = sealed[index];
      return day === undefined ||
        item.requestedUtcDate !== day.requestedUtcDate ||
        item.publicationId !== day.publicationId ||
        item.publicationEvidenceIdentity !== day.publicationEvidenceIdentity ||
        item.publicationEvidenceSha256 !== day.publicationEvidenceSha256;
    })
  ) {
    throw new Error(
      "Reader summary weekly projection artifact proof diverged from certification seal",
    );
  }
};

const exactDatabaseDate = (value: unknown, label: string): string => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`Reader summary weekly projection ${label} is invalid`);
  }
  return value.toISOString().slice(0, 10);
};
