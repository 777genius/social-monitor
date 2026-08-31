import type { PrismaSummaryClient } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import { runWithTenantDatabaseAccess } from
  "@social-monitor/platform-persistence";

import { captureReaderSummaryDayDatasetManifest } from
  "./reader-summary-day-dataset-manifest";
import type {
  HistoricalPromotionActiveSourcePublication,
  HistoricalPromotionPreparationReader,
} from "./reader-summary-promotion-v2-historical-preparation";

type ActiveSourceRow = Readonly<{
  publicationId: string;
  artifactId: string;
  reportSha256: string;
  proofSha256: string;
}>;

export class PostgresHistoricalPromotionPreparationReader
  implements HistoricalPromotionPreparationReader {
  constructor(
    private readonly client: Pick<PrismaSummaryClient, "$queryRaw">,
    private readonly scope: {
      readonly tenantId: string;
      readonly workspaceId: string;
    },
  ) {}

  async readActiveSource(
    date: string,
  ): Promise<HistoricalPromotionActiveSourcePublication | null> {
    const rows = await runWithTenantDatabaseAccess(this.scope, () =>
      this.client.$queryRaw<readonly ActiveSourceRow[]>`
        select publication.id::text as "publicationId",
          publication.reader_summary_artifact_id::text as "artifactId",
          btrim(publication.report_sha256) as "reportSha256",
          btrim(publication.proof_sha256) as "proofSha256"
        from reader_summary_publication_slots slot
        join reader_summary_publications publication
          on publication.id = slot.current_publication_id
        join reader_summary_artifacts artifact
          on artifact.id = publication.reader_summary_artifact_id
        where slot.tenant_id = ${this.scope.tenantId}::uuid
          and slot.workspace_id = ${this.scope.workspaceId}::uuid
          and slot.scope_type = 'workspace'
          and slot.scope_key = 'workspace'
          and slot.cadence = 'daily'
          and slot.period_started_at = ${date}::date::timestamp at time zone 'UTC'
          and slot.period_ended_at = (${date}::date + 1)::timestamp at time zone 'UTC'
          and slot.period_timezone = 'UTC'
      `);
    if (rows.length > 1) {
      throw new Error("Historical preparation found multiple active publications");
    }
    const row = rows[0];
    if (row === undefined) return null;
    return {
      publicationId: requiredUuid(row.publicationId),
      artifactId: requiredUuid(row.artifactId),
      reportSha256: requiredSha256(row.reportSha256),
      proofSha256: requiredSha256(row.proofSha256),
    };
  }

  captureDataset(input: {
    date: string;
    generatedAt: Date;
    timestampPolicy: "published_at" | "observed_at";
  }) {
    const startedAt = new Date(`${input.date}T00:00:00.000Z`);
    const endedAt = new Date(startedAt);
    endedAt.setUTCDate(endedAt.getUTCDate() + 1);
    return captureReaderSummaryDayDatasetManifest({
      client: this.client,
      tenantId: this.scope.tenantId,
      workspaceId: this.scope.workspaceId,
      startedAt,
      endedAt,
      generatedAt: input.generatedAt,
      timestampPolicy: input.timestampPolicy,
    });
  }
}

const requiredUuid = (value: string): string => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(value)) {
    throw new Error("Historical preparation publication UUID is invalid");
  }
  return value.toLocaleLowerCase("en-US");
};

const requiredSha256 = (value: string): string => {
  const normalized = value.trim();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error("Historical preparation publication proof is invalid");
  }
  return normalized;
};
