import { validateReaderValueAnswers } from '../../domain/reader-value/reader-value-assessment';
import type { ReaderValueAssessment, ReaderValueAssessmentState, ReaderValuePreparedInput } from '../../application/contracts/reader-value-assessment-store';
import type { ReaderValueSourceSnapshot } from '../../domain/reader-value/reader-value-source';
import { canonicalPostgresTimestamp } from './canonical-postgres-timestamp';

export type AssessmentRecord = {
  readonly id: string; readonly tenant_id: string; readonly workspace_id: string;
  readonly interest_id: string; readonly source_item_id: string; readonly source_revision_key: string;
  readonly source_snapshot_sha256: string; readonly interest_sha256: string;
  readonly rubric_version: string; readonly rubric_sha256: string; readonly input_builder_version: string;
  readonly model_config_version: string; readonly input_sha256: string; readonly request_sha256: string;
  readonly requested_model: string; readonly request_body: string; readonly input_snapshot: ReaderValueSourceSnapshot;
  readonly state: ReaderValueAssessmentState; readonly attempts: number;
  readonly lease_token: string | null; readonly lease_until: string | null; readonly assessed_at: string | null;
  readonly result: unknown; readonly error_code: string | null; readonly usage_unknown: boolean; readonly cost_usd: number | null;
};

export function assessmentFromRecord(row: AssessmentRecord): ReaderValueAssessment {
  const input: ReaderValuePreparedInput = {
    tenantId: row.tenant_id, workspaceId: row.workspace_id, interestId: row.interest_id,
    sourceItemId: row.source_item_id, sourceRevisionKey: row.source_revision_key,
    sourceSnapshotSha256: row.source_snapshot_sha256, interestSha256: row.interest_sha256,
    rubricVersion: row.rubric_version, rubricSha256: row.rubric_sha256,
    inputBuilderVersion: row.input_builder_version, modelConfigVersion: row.model_config_version,
    inputSha256: row.input_sha256, requestSha256: row.request_sha256, requestedModel: row.requested_model,
    requestBody: row.request_body, snapshot: row.input_snapshot,
    ...(row.state === 'permanent_failed' && row.attempts === 0
      && (row.error_code === 'empty_input' || row.error_code === 'configuration_invalid')
      ? { terminalFailure: row.error_code } : {}),
  };
  const answers = row.state === 'assessed' ? validateReaderValueAnswers(row.result) : null;
  if (answers !== null && !answers.ok) throw new Error('Invalid persisted reader value assessment');
  return {
    id: row.id, input, state: row.state, attempts: row.attempts, leaseToken: row.lease_token,
    leaseUntil: row.lease_until === null ? null : canonicalPostgresTimestamp(row.lease_until),
    assessedAt: row.assessed_at === null ? null : canonicalPostgresTimestamp(row.assessed_at),
    answers: answers?.ok ? answers.value : null,
    usageUnknown: row.usage_unknown, costUsd: row.cost_usd, errorCode: row.error_code,
  };
}
