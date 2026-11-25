import type { ReaderValueExistingAssessment } from '../../application/contracts/reader-value-existing-assessment';
import { assessmentFromRecord, type AssessmentRecord } from './assessment-record';
import { assessmentTransaction, liveAssessmentScope, type AssessmentSqlClient } from './assessment-sql';

export class PrismaReaderValueExistingAssessment implements ReaderValueExistingAssessment {
  constructor(private readonly client: AssessmentSqlClient) {}

  find(input: Parameters<ReaderValueExistingAssessment['find']>[0]) {
    return assessmentTransaction(this.client, input, async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ row: AssessmentRecord }[]>(`SELECT row_to_json(a) AS row
        FROM reader_value_assessments a
        WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid
          AND a.interest_id=$3::uuid AND a.source_item_id=$4::uuid
          AND a.source_snapshot_sha256=$5 AND a.input_sha256=$6
          AND a.rubric_sha256=$7 AND a.model_config_version=$8
          AND a.interest_sha256=$9 AND a.source_revision_key=$10
          AND a.input_builder_version=$11 AND a.rubric_version=$12
          AND a.request_sha256=$13 AND a.expires_at>clock_timestamp()
          AND ${liveAssessmentScope}`, input.tenantId, input.workspaceId,
      input.interestId, input.sourceItemId, input.sourceSnapshotSha256,
      input.inputSha256, input.rubricSha256, input.modelConfigVersion,
      input.interestSha256, input.sourceRevisionKey, input.inputBuilderVersion,
      input.rubricVersion, input.requestSha256);
      if (rows.length > 1) throw new Error('Exact Jev assessment identity is ambiguous');
      return rows[0] === undefined ? null : assessmentFromRecord(rows[0].row);
    });
  }
}
