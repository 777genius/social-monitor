import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { runWithTenantDatabaseAccess } from
  "@social-monitor/platform-persistence";
import type { PrismaSummaryClient } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";

import type { ReaderSummaryDayDatasetGuard } from
  "./reader-summary-day-dataset-guard";

export const historicalPromotionUnderLockDriftReason =
  "authoritative_input_drift_under_lock" as const;
export const historicalPromotionUnderLockUnavailableReason =
  "authoritative_input_revalidation_unavailable_under_lock" as const;
export const historicalPromotionRevalidationFailurePathEnv =
  "DURABLE_READER_SUMMARY_PROMOTION_REVALIDATION_FAILURE_PATH" as const;

export type HistoricalPromotionUnderLockReason =
  | typeof historicalPromotionUnderLockDriftReason
  | typeof historicalPromotionUnderLockUnavailableReason;

type ActivePublicationRow = Readonly<{
  publicationId: string;
  artifactId: string;
  reportSha256: string;
  proofSha256: string;
}>;

export const assertHistoricalPromotionInputCurrentBeforeMutation = async (
  input: {
    readonly datasetGuard: Pick<
      ReaderSummaryDayDatasetGuard,
      "assertCurrentBeforeMutation"
    >;
    readonly client: Pick<PrismaSummaryClient, "$queryRaw">;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly date: string;
    readonly sourcePublication: Readonly<{
      publicationId: string;
      artifactId: string;
      reportSha256: string;
      proofSha256: string;
    }>;
    readonly failureMarkerPath?: string;
  },
): Promise<void> => {
  try {
    await runWithTenantDatabaseAccess(input, async () => {
      await input.datasetGuard.assertCurrentBeforeMutation();
      const rows = await input.client.$queryRaw<readonly ActivePublicationRow[]>`
        select publication.id::text as "publicationId",
          publication.reader_summary_artifact_id::text as "artifactId",
          btrim(publication.report_sha256) as "reportSha256",
          btrim(publication.proof_sha256) as "proofSha256"
        from reader_summary_publication_slots slot
        join reader_summary_publications publication
          on publication.id = slot.current_publication_id
        join reader_summary_artifacts artifact
          on artifact.id = publication.reader_summary_artifact_id
        where slot.tenant_id = ${input.tenantId}::uuid
          and slot.workspace_id = ${input.workspaceId}::uuid
          and slot.scope_type = 'workspace'
          and slot.scope_key = 'workspace'
          and slot.cadence = 'daily'
          and slot.period_started_at = ${input.date}::date::timestamp
            at time zone 'UTC'
          and slot.period_ended_at = (${input.date}::date + 1)::timestamp
            at time zone 'UTC'
          and slot.period_timezone = 'UTC'
      `;
      if (rows.length !== 1 || !sourcePublicationMatches(
        rows[0],
        input.sourcePublication,
      )) {
        throw new HistoricalPromotionInputDriftError();
      }
    });
  } catch (error) {
    const reason = error instanceof HistoricalPromotionInputDriftError ||
        (error instanceof Error && /dataset changed/u.test(error.message))
      ? historicalPromotionUnderLockDriftReason
      : historicalPromotionUnderLockUnavailableReason;
    if (input.failureMarkerPath !== undefined) {
      writeFailureMarker(input.failureMarkerPath, reason);
    }
    throw new Error(`Historical promotion ${reason}`);
  }
};

const sourcePublicationMatches = (
  actual: ActivePublicationRow | undefined,
  expected: Readonly<{
    publicationId: string;
    artifactId: string;
    reportSha256: string;
    proofSha256: string;
  }>,
): boolean => actual !== undefined &&
  actual.publicationId === expected.publicationId &&
  actual.artifactId === expected.artifactId &&
  actual.reportSha256 === expected.reportSha256 &&
  actual.proofSha256 === expected.proofSha256;

const writeFailureMarker = (
  path: string,
  reason: HistoricalPromotionUnderLockReason,
): void => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const next = `${path}.next-${process.pid}`;
  writeFileSync(next, `${JSON.stringify({
    schemaVersion: 1,
    format: "reader-summary-promotion-v2-under-lock-failure-v1",
    reason,
  })}\n`, { flag: "wx", mode: 0o600 });
  renameSync(next, path);
};

class HistoricalPromotionInputDriftError extends Error {}
