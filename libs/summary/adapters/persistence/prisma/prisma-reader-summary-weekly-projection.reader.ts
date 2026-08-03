import type {
  ReadReaderSummaryWeeklyProjectionQuery,
  ReaderSummaryWeeklyProjectionRead,
  ReaderSummaryWeeklyProjectionReaderPort,
} from "../../../ports/reader-summary-weekly-projection-reader.port";
import { findReaderSummaryWeeklyArtifactById } from "./prisma-reader-summary-weekly-artifact";
import { PrismaReaderSummaryWeeklyCertificationSealAuthority } from "./prisma-reader-summary-weekly-certification-seal-authority";
import { PrismaReaderSummaryWeeklyStoryAuthority } from "./prisma-reader-summary-weekly-story-authority";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import { runSerializableReaderSummaryTransaction } from "./prisma-summary-transaction";

type DailyEvidenceRow = Readonly<{
  requestedUtcDate: Date;
  publicationId: string;
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
        evidence."publication_id"::TEXT AS "publicationId"
      FROM "reader_summary_weekly_publication_evidence" AS evidence
      WHERE evidence."tenant_id" = ${query.tenantId}::UUID
        AND evidence."workspace_id" = ${query.workspaceId}::UUID
        AND evidence."scope_type" = 'workspace'
        AND evidence."scope_key" = 'workspace'
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
  const dailyEvidence = await verifiedDailyEvidence(prisma, query, dailyRows);
  const artifact = await activeWeeklyArtifact(
    prisma,
    query,
    slotRows[0] ?? null,
    dailyEvidence,
  );
  return Object.freeze({
    certifiedDailyEvidenceDates: Object.freeze(
      [...new Set(dailyEvidence.map((item) => item.requestedUtcDate))],
    ),
    artifact,
  });
};

const verifiedDailyEvidence = async (
  prisma: PrismaSummaryClient,
  query: ReadReaderSummaryWeeklyProjectionQuery,
  rows: readonly DailyEvidenceRow[],
): Promise<readonly VerifiedDailyEvidence[]> => {
  const authority = new PrismaReaderSummaryWeeklyStoryAuthority(prisma);
  return Promise.all(rows.map(async (row) => {
    const requestedUtcDate = exactDatabaseDate(
      row.requestedUtcDate,
      "daily evidence date",
    );
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
      binding.requestedUtcDate !== requestedUtcDate ||
      binding.scope.type !== "workspace"
    ) {
      throw new Error(
        "Reader summary weekly projection daily evidence authority diverged",
      );
    }
    return Object.freeze({
      requestedUtcDate,
      publicationId: binding.publicationId,
    });
  }));
};

const activeWeeklyArtifact = async (
  prisma: PrismaSummaryClient,
  query: ReadReaderSummaryWeeklyProjectionQuery,
  slot: ActiveWeeklySlotRow | null,
  dailyEvidence: readonly VerifiedDailyEvidence[],
) => {
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
  await assertSealBinding(prisma, query, artifact);
  if (new Set(dailyEvidence.map((item) => item.requestedUtcDate)).size === 7) {
    assertDailyProofBinding(dailyEvidence, artifact.proof.authorities);
  }
  return artifact;
};

const assertSealBinding = async (
  prisma: PrismaSummaryClient,
  query: ReadReaderSummaryWeeklyProjectionQuery,
  artifact: NonNullable<ReaderSummaryWeeklyProjectionRead["artifact"]>,
): Promise<void> => {
  const authority = new PrismaReaderSummaryWeeklyCertificationSealAuthority(
    prisma,
  );
  const handle = await authority.load({
    tenantId: query.tenantId,
    workspaceId: query.workspaceId,
    scope: { type: "workspace" },
    weekStartedOn: query.weekStartedOn,
  });
  if (handle === null) {
    throw new Error(
      "Reader summary weekly projection certification seal is missing",
    );
  }
  const seal = authority.readVerifiedBinding(handle);
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
};

const assertDailyProofBinding = (
  dailyEvidence: readonly VerifiedDailyEvidence[],
  authorities: readonly Readonly<{
    requestedUtcDate: string;
    publicationId: string;
  }>[],
): void => {
  const evidence = new Set(
    dailyEvidence.map((item) =>
      `${item.requestedUtcDate}:${item.publicationId}`,
    ),
  );
  if (
    authorities.length !== 7 ||
    authorities.some((item) =>
      !evidence.has(`${item.requestedUtcDate}:${item.publicationId}`),
    )
  ) {
    throw new Error(
      "Reader summary weekly projection artifact proof diverged from daily evidence",
    );
  }
};

const exactDatabaseDate = (value: unknown, label: string): string => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`Reader summary weekly projection ${label} is invalid`);
  }
  return value.toISOString().slice(0, 10);
};
