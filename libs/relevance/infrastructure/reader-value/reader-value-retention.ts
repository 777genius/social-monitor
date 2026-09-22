import type { ReaderValueCleanupPolicy, ReaderValueCleanupResult, ReaderValueRead, ReaderValueReference, ReaderValueScope } from '../../application/contracts/reader-value-assessment-store';
import { assessmentFromRecord, type AssessmentRecord } from './assessment-record';
import { activeAssessmentPin, liveAssessmentScope, type AssessmentSqlTransaction } from './assessment-sql';

export async function readReaderValueAssessments(tx: AssessmentSqlTransaction, scope: ReaderValueScope,
  interestId: string, references: readonly ReaderValueReference[]): Promise<readonly ReaderValueRead[]> {
  if (references.length > 100) throw new Error('Assessment batch read limit is 100');
  if (references.length === 0) return [];
  const rows = await tx.$queryRawUnsafe<{ row: AssessmentRecord; feed_id: string }[]>(`
    SELECT row_to_json(a) AS row,f.id::text AS feed_id FROM reader_value_assessments a
    JOIN jsonb_to_recordset($4::jsonb) AS r("assessmentId" uuid,"feedItemId" uuid)
      ON a.id=r."assessmentId"
    JOIN feed_items f ON f.id=r."feedItemId" AND f.tenant_id=a.tenant_id AND f.workspace_id=a.workspace_id
      AND f.interest_id=a.interest_id AND f.source_item_id=a.source_item_id AND f.status='VISIBLE'
    JOIN source_items referenced_source ON referenced_source.id=f.source_item_id
      AND referenced_source.tenant_id=f.tenant_id AND referenced_source.workspace_id=f.workspace_id
      AND referenced_source.provider_key=f.provider_key
    JOIN source_bindings referenced_binding ON referenced_binding.id=f.source_binding_id
      AND referenced_binding.tenant_id=f.tenant_id AND referenced_binding.workspace_id=f.workspace_id
      AND referenced_binding.interest_id=f.interest_id
      AND referenced_binding.status='ENABLED' AND referenced_binding.deleted_at IS NULL
    JOIN source_catalog_entries referenced_catalog ON referenced_catalog.id=referenced_binding.source_catalog_entry_id
      AND referenced_catalog.provider_key=f.provider_key
    WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid AND a.interest_id=$3::uuid
      AND (a.expires_at>clock_timestamp() OR ${activeAssessmentPin}) AND ${liveAssessmentScope}
    ORDER BY a.id FOR SHARE OF a`,scope.tenantId,scope.workspaceId,interestId,JSON.stringify(references));
  return references.map((ref): ReaderValueRead => {
    const row = rows.find((entry) => entry.row.id === ref.assessmentId && entry.feed_id === ref.feedItemId)?.row;
    if (!row) return { status: 'unavailable', assessmentId: ref.assessmentId };
    if (row.source_snapshot_sha256 !== ref.sourceSnapshotSha256 || row.input_sha256 !== ref.inputSha256) {
      return { status: 'stale', assessmentId: ref.assessmentId };
    }
    return { status: 'available', assessment: assessmentFromRecord(row) };
  });
}

export async function pinReaderValueAssessments(tx: AssessmentSqlTransaction, scope: ReaderValueScope,
  interestId: string, jobId: string, references: readonly ReaderValueReference[]): Promise<boolean> {
  if (references.length > 1000) throw new Error('Assessment preparation limit is 1000');
  const jobs = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM reader_summary_jobs
    WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND id=$3::uuid AND (interest_id=$4::uuid OR interest_id IS NULL)
      AND status IN ('REQUESTED','RUNNING') FOR SHARE`,scope.tenantId,scope.workspaceId,jobId,interestId);
  if (jobs.length !== 1) return false;
  const ids = [...new Set(references.map((ref) => ref.assessmentId))].sort();
  // The same row locks as cleanup. Pins are durable before a caller can freeze a manifest.
  const locked = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT a.id FROM reader_value_assessments a
    WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid AND a.interest_id=$3::uuid AND a.id=ANY($4::uuid[])
    ORDER BY a.id FOR UPDATE OF a`,scope.tenantId,scope.workspaceId,interestId,ids);
  if (locked.length !== ids.length) return false;
  // Only durable terminal outcomes release a pin; deadlines and execution leases do not.
  await tx.$executeRawUnsafe(`UPDATE reader_value_assessments a SET pinned_job_ids=ARRAY(
    SELECT j.id FROM reader_summary_jobs j WHERE j.tenant_id=a.tenant_id AND j.workspace_id=a.workspace_id
      AND j.id=ANY(a.pinned_job_ids) AND j.status IN ('REQUESTED','RUNNING') ORDER BY j.id)
    WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid AND a.id=ANY($3::uuid[])`,scope.tenantId,scope.workspaceId,ids);
  const full=await tx.$queryRawUnsafe<{id:string}[]>(`SELECT a.id FROM reader_value_assessments a
    WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid AND a.id=ANY($3::uuid[])
      AND cardinality(a.pinned_job_ids)>=256 AND NOT $4::uuid=ANY(a.pinned_job_ids)`,scope.tenantId,scope.workspaceId,ids,jobId);
  if (full.length>0) return false;
  for (let offset=0;offset<references.length;offset+=100) {
    const reads = await readReaderValueAssessments(tx,scope,interestId,references.slice(offset,offset+100));
    if (reads.some((read) => read.status !== 'available')) return false;
  }
  await tx.$executeRawUnsafe(`UPDATE reader_value_assessments a SET pinned_job_ids=array_append(a.pinned_job_ids,$5::uuid)
    WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid AND a.interest_id=$3::uuid
      AND a.id=ANY($4::uuid[]) AND NOT $5::uuid=ANY(a.pinned_job_ids)`,scope.tenantId,scope.workspaceId,interestId,ids,jobId);
  return true;
}

export type AssessmentCleanupCursor={readonly expiresAt:string;readonly id:string};
export async function cleanupReaderValueAssessments(tx: AssessmentSqlTransaction, scope: ReaderValueScope,
  policy: ReaderValueCleanupPolicy, cursor?: AssessmentCleanupCursor): Promise<{
    readonly outcome:ReaderValueCleanupResult;readonly cursor:AssessmentCleanupCursor|undefined;
  }> {
  const result = { deleted: 0, deferredActiveJob: 0, deferredHold: 0, deferredUnknownPolicy: 0 };
  if (policy.version!=='reader-value-retention.v1' || policy.retentionHoldWorkspaceIds === null
    || policy.retentionHoldWorkspaceIds.some((id)=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id))) {
    return {outcome:{ ...result, deferredUnknownPolicy: 1 },cursor};
  }
  if (policy.retentionHoldWorkspaceIds.some((id)=>id.toLowerCase()===scope.workspaceId.toLowerCase())) {
    return {outcome:{ ...result, deferredHold: 1 },cursor};
  }
  const rows = await tx.$queryRawUnsafe<{ id: string; expires_at:string; live: boolean; pinned: boolean; leased: boolean }[]>(`
    SELECT a.id,a.expires_at::text,${liveAssessmentScope} AS live,${activeAssessmentPin} AS pinned,
      (a.state='running' AND a.lease_until>clock_timestamp()) AS leased
    FROM reader_value_assessments a WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid
      AND ($6::uuid IS NULL OR a.interest_id=$6::uuid)
      AND (a.expires_at<=clock_timestamp() OR ($3::boolean AND NOT ${liveAssessmentScope}))
      AND ($4::timestamptz IS NULL OR (a.expires_at,a.id)>($4::timestamptz,$5::uuid))
    ORDER BY a.expires_at,a.id FOR UPDATE OF a SKIP LOCKED LIMIT 100`,scope.tenantId,scope.workspaceId,policy.eraseRevokedScopes,
    cursor?.expiresAt??null,cursor?.id??null,scope.interestId??null);
  for (const row of rows) {
    if (!row.live && policy.eraseRevokedScopes) {
      // The database DELETE guard terminates active pins atomically for this
      // erasure and for physical source/interest FK cascades alike.
      result.deleted += await erase(tx,scope,row.id);
    } else if (row.pinned || row.leased) {
      result.deferredActiveJob += 1;
    } else {
      result.deleted += await erase(tx,scope,row.id);
    }
  }
  const last=rows.at(-1);
  return {outcome:result,cursor:rows.length===100&&last ? {expiresAt:last.expires_at,id:last.id} : undefined};
}

function erase(tx: AssessmentSqlTransaction, scope: ReaderValueScope, id: string): Promise<number> {
  return tx.$executeRawUnsafe(`DELETE FROM reader_value_assessments WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND id=$3::uuid`,
    scope.tenantId,scope.workspaceId,id);
}
