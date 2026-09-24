import { validateReaderValueAnswers } from '../../domain/reader-value/reader-value-assessment';
import { readerValueRetryDecision } from '../../domain/reader-value/reader-value-failure';
import type { ReaderValueAssessment, ReaderValueAssessmentStore, ReaderValueCleanupPolicy, ReaderValuePreparedInput,
  ReaderValueReference, ReaderValueScope, ReaderValueScoringOutcome } from '../../application/contracts/reader-value-assessment-store';
import { normalizeReaderValuePersistedCostUsd } from
  '../../application/contracts/reader-value-persisted-cost';
import { assessmentFromRecord, type AssessmentRecord } from './assessment-record';
import { activeAssessmentPin, assessmentTransaction, liveAssessmentScope, type AssessmentSqlClient, type AssessmentSqlTransaction } from './assessment-sql';
import { cleanupReaderValueAssessments, pinReaderValueAssessments, readReaderValueAssessments, type AssessmentCleanupCursor } from './reader-value-retention';
import { sha256 } from './reader-value-source-snapshot';

type Rows = { row: AssessmentRecord }[];
export class PrismaReaderValueAssessmentStore implements ReaderValueAssessmentStore {
  private readonly cleanupCursors=new Map<string,AssessmentCleanupCursor>();
  constructor(private readonly client: AssessmentSqlClient) {}

  backlogAgeMs(scope: ReaderValueScope, configVersion: string, pinnedOnly: boolean): Promise<number> {
    return assessmentTransaction(this.client, scope, async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ age: number }[]>(`SELECT COALESCE(GREATEST(0,
        EXTRACT(EPOCH FROM (clock_timestamp()-MIN(a.created_at)))*1000),0)::double precision AS age
        FROM reader_value_assessments a WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid
          AND a.model_config_version=$3 AND ($5::uuid IS NULL OR a.interest_id=$5::uuid)
          AND a.state IN ('pending','running','retryable_failed')
          AND (a.expires_at>clock_timestamp() OR ${activeAssessmentPin})
          AND (NOT $4::boolean OR ${activeAssessmentPin}) AND ${liveAssessmentScope}`,
      scope.tenantId,scope.workspaceId,configVersion,pinnedOnly,scope.interestId ?? null);
      return rows[0]?.age ?? 0;
    });
  }

  ensure(id: string, input: ReaderValuePreparedInput): Promise<ReaderValueAssessment | null> {
    if (sha256(input.requestBody) !== input.requestSha256 || input.sourceSnapshotSha256 !== input.snapshot.sourceSnapshotSha256
      || input.interestSha256 !== input.snapshot.interestSha256 || Buffer.byteLength(input.requestBody) > 56_000) {
      throw new Error('Invalid reader value prepared input binding');
    }
    return assessmentTransaction(this.client, input, async (tx) => {
      await tx.$executeRawUnsafe(`WITH creation AS MATERIALIZED (SELECT clock_timestamp() AS at)
        INSERT INTO reader_value_assessments (
        id,tenant_id,workspace_id,interest_id,source_item_id,source_revision_key,source_snapshot_sha256,
        interest_sha256,rubric_version,rubric_sha256,input_builder_version,model_config_version,input_sha256,
        request_sha256,input_snapshot,request_body,requested_model,expires_at,created_at,state,error_code)
        SELECT $1::uuid,a.tenant_id,a.workspace_id,a.interest_id,a.source_item_id,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,
          LEAST(creation.at+interval '180 days',s.created_at+interval '180 days'),creation.at,
          CASE WHEN $18::text IS NULL THEN 'pending' ELSE 'permanent_failed' END,$18::text
        FROM (SELECT $2::uuid tenant_id,$3::uuid workspace_id,$4::uuid interest_id,$5::uuid source_item_id) a
        JOIN source_items s ON s.tenant_id=a.tenant_id AND s.workspace_id=a.workspace_id AND s.id=a.source_item_id
        CROSS JOIN creation
        WHERE s.created_at+interval '180 days'>clock_timestamp() AND ${liveAssessmentScope}
        ON CONFLICT (tenant_id,workspace_id,interest_id,source_item_id,source_snapshot_sha256,interest_sha256,input_sha256,rubric_sha256,model_config_version)
        DO NOTHING`, id,input.tenantId,input.workspaceId,input.interestId,input.sourceItemId,input.sourceRevisionKey,
      input.sourceSnapshotSha256,input.interestSha256,input.rubricVersion,input.rubricSha256,input.inputBuilderVersion,
      input.modelConfigVersion,input.inputSha256,input.requestSha256,JSON.stringify(input.snapshot),input.requestBody,input.requestedModel,input.terminalFailure ?? null);
      const rows = await tx.$queryRawUnsafe<Rows>(`SELECT row_to_json(a) AS row FROM reader_value_assessments a
        WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid AND a.interest_id=$3::uuid AND a.source_item_id=$4::uuid
        AND a.source_snapshot_sha256=$5 AND a.input_sha256=$6 AND a.rubric_sha256=$7 AND a.model_config_version=$8 AND a.interest_sha256=$9
        AND (a.expires_at>clock_timestamp() OR ${activeAssessmentPin}) AND ${liveAssessmentScope}`,
      input.tenantId,input.workspaceId,input.interestId,input.sourceItemId,input.sourceSnapshotSha256,input.inputSha256,
      input.rubricSha256,input.modelConfigVersion,input.interestSha256);
      return mapFirst(rows);
    });
  }

  claim(scope: ReaderValueScope, configVersion: string, leaseToken: string, pinnedOnly: boolean): Promise<ReaderValueAssessment | null> {
    return assessmentTransaction(this.client, scope, async (tx) => {
      const rows = await tx.$queryRawUnsafe<Rows>(`WITH candidate AS (
        SELECT a.id FROM reader_value_assessments a WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid
          AND a.model_config_version=$3 AND ($6::uuid IS NULL OR a.interest_id=$6::uuid)
          AND a.state IN ('pending','retryable_failed') AND a.attempts<3
          AND a.next_attempt_at<=clock_timestamp() AND (a.expires_at>clock_timestamp() OR ${activeAssessmentPin})
          AND (NOT $5::boolean OR ${activeAssessmentPin}) AND ${liveAssessmentScope}
        ORDER BY a.next_attempt_at,a.created_at,a.id FOR UPDATE OF a SKIP LOCKED LIMIT 1
      ) UPDATE reader_value_assessments a SET state='running',attempts=a.attempts+1,lease_token=$4::uuid,
        lease_until=clock_timestamp()+interval '90 seconds',error_code=NULL,
        attempt_history=a.attempt_history || jsonb_build_array(jsonb_build_object('ordinal',a.attempts+1,
          'reservedAt',clock_timestamp(),'sentAt',NULL,'finishedAt',NULL,'requestId',NULL,'costUsd',NULL,'usageUnknown',true))
      FROM candidate WHERE a.id=candidate.id RETURNING row_to_json(a) AS row`,
      scope.tenantId,scope.workspaceId,configVersion,leaseToken,pinnedOnly,
      scope.interestId ?? null);
      return mapFirst(rows);
    });
  }

  authorizeDispatch(claim: ReaderValueAssessment, pinnedOnly: boolean): Promise<boolean> {
    const pinnedAuthorization = pinnedOnly ? `
      WITH active_pin AS MATERIALIZED (
        SELECT j.id FROM reader_value_assessments pinned
        JOIN reader_summary_jobs j ON j.tenant_id=pinned.tenant_id AND j.workspace_id=pinned.workspace_id
          AND j.id=ANY(pinned.pinned_job_ids)
        WHERE j.tenant_id=$1::uuid AND j.workspace_id=$2::uuid
          AND pinned.id=$3::uuid AND j.status IN ('REQUESTED','RUNNING')
        FOR KEY SHARE OF j
      )` : '';
    const requiresPinnedAuthorization = pinnedOnly ? 'AND EXISTS (SELECT 1 FROM active_pin)' : '';
    return assessmentTransaction(this.client, claim.input, async (tx) => (await tx.$executeRawUnsafe(`
      ${pinnedAuthorization}
      UPDATE reader_value_assessments a SET attempt_history=jsonb_set(a.attempt_history,ARRAY[(a.attempts-1)::text],
        a.attempt_history->(a.attempts-1) || jsonb_build_object('sentAt',clock_timestamp()))
      WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid AND a.id=$3::uuid AND a.lease_token=$4::uuid
        AND a.state='running' AND a.lease_until>clock_timestamp()
        AND a.attempt_history->(a.attempts-1)->>'sentAt' IS NULL ${requiresPinnedAuthorization}
        AND ${liveAssessmentScope}`,
    claim.input.tenantId,claim.input.workspaceId,claim.id,claim.leaseToken)) === 1);
  }

  complete(claim: ReaderValueAssessment, outcome: ReaderValueScoringOutcome): Promise<boolean> {
    if (outcome.ok && !validateReaderValueAnswers(outcome.answers).ok) throw new Error('Invalid reader value result');
    return assessmentTransaction(this.client, claim.input, async (tx) => {
      const locks = await tx.$queryRawUnsafe<{ now: string }[]>(`SELECT clock_timestamp()::text AS now
        FROM reader_value_assessments a WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid
        AND a.id=$3::uuid AND a.lease_token=$4::uuid AND a.state='running' AND a.lease_until>clock_timestamp()
        AND a.attempt_history->(a.attempts-1)->>'sentAt' IS NOT NULL
        AND ${liveAssessmentScope} FOR UPDATE OF a`, claim.input.tenantId,claim.input.workspaceId,claim.id,claim.leaseToken);
      if (locks.length === 0) return false;
      const decision = outcome.ok ? null : readerValueRetryDecision(claim.attempts,outcome.failure,new Date(locks[0]!.now));
      const execution = outcome.execution;
      const costUsd = normalizeReaderValuePersistedCostUsd(execution?.costUsd ?? null);
      const usageUnknown = (outcome.ok ? outcome.execution.usageUnknown : outcome.failure.usageUnknown) ||
        (execution?.costUsd !== null && execution?.costUsd !== undefined && costUsd === null);
      const changed = await tx.$executeRawUnsafe(`UPDATE reader_value_assessments a SET state=$5,
        error_code=$6,next_attempt_at=COALESCE($7::timestamptz,a.next_attempt_at),
        usefulness=$8,relevance=$9,context_sufficiency=$10,evidence_basis=$11,result=$12::jsonb,
        resolved_model=$13,provider=$14,request_id=$15,latency_ms=$16,input_tokens=$17,output_tokens=$18,
        cost_usd=CASE WHEN $19::numeric IS NULL THEN a.cost_usd ELSE COALESCE(a.cost_usd,0)+$19::numeric END,
        usage_unknown=a.usage_unknown OR $20::boolean,
        attempt_history=jsonb_set(a.attempt_history,ARRAY[(a.attempts-1)::text],
          a.attempt_history->(a.attempts-1) || jsonb_build_object('finishedAt',clock_timestamp(),
          'requestId',$15::text,'inputTokens',$17::integer,'outputTokens',$18::integer,'costUsd',$19::numeric,'usageUnknown',$20::boolean,'errorCode',$6::text))
        WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid AND a.id=$3::uuid AND a.lease_token=$4::uuid
          AND a.state='running' AND a.lease_until>clock_timestamp() AND ${liveAssessmentScope}`,
      claim.input.tenantId,claim.input.workspaceId,claim.id,claim.leaseToken,
      outcome.ok ? 'assessed' : decision!.state,
      outcome.ok ? null : decision!.state === 'permanent_failed' ? decision!.code : outcome.failure.code,
      decision?.state === 'retryable_failed' ? decision.nextAttemptAt : null,
      outcome.ok ? outcome.answers.usefulness.choice : null,outcome.ok ? outcome.answers.relevance.choice : null,
      outcome.ok ? outcome.answers.context_sufficiency.choice : null,outcome.ok ? outcome.answers.evidence_basis.choice : null,
      outcome.ok ? JSON.stringify(outcome.answers) : null,outcome.ok ? outcome.execution.resolvedModel : null,outcome.ok ? outcome.execution.provider : null,
      execution?.requestId ?? null,execution?.latencyMs ?? null,execution?.inputTokens ?? null,execution?.outputTokens ?? null,
      costUsd,usageUnknown);
      return changed === 1;
    });
  }

  findExact(scope: ReaderValueScope, id: string): Promise<ReaderValueAssessment | null> {
    return assessmentTransaction(this.client, scope, (tx) => findAssessment(tx,scope,id));
  }
  read(scope: ReaderValueScope, interestId: string, references: readonly ReaderValueReference[]) {
    return assessmentTransaction(this.client, scope, (tx) => readReaderValueAssessments(tx,scope,interestId,references));
  }
  pin(scope: ReaderValueScope, interestId: string, jobId: string, references: readonly ReaderValueReference[]) {
    return assessmentTransaction(this.client, scope, (tx) => pinReaderValueAssessments(tx,scope,interestId,jobId,references));
  }
  async cleanup(scope: ReaderValueScope, policy: ReaderValueCleanupPolicy) {
    const key=`${scope.tenantId}/${scope.workspaceId}/${scope.interestId ?? "*"}`;
    const result=await assessmentTransaction(this.client, scope, (tx) => cleanupReaderValueAssessments(tx,scope,policy,this.cleanupCursors.get(key)));
    if (result.cursor) this.cleanupCursors.set(key,result.cursor);
    else this.cleanupCursors.delete(key);
    return result.outcome;
  }
  recoverExpiredLeases(scope: ReaderValueScope): Promise<number> {
    return assessmentTransaction(this.client, scope, (tx) => tx.$executeRawUnsafe(`WITH expired AS (
      SELECT a.id FROM reader_value_assessments a WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid
        AND a.state='running' AND a.lease_until<=clock_timestamp()
        AND ($3::uuid IS NULL OR a.interest_id=$3::uuid)
      ORDER BY a.lease_until,a.id FOR UPDATE OF a SKIP LOCKED LIMIT 100
    ) UPDATE reader_value_assessments a SET state=CASE WHEN a.attempts>=3 THEN 'permanent_failed' ELSE 'retryable_failed' END,
      error_code=CASE WHEN a.attempts>=3 THEN 'retry_exhausted' ELSE 'lease_expired' END,
      request_id=NULL,latency_ms=NULL,input_tokens=NULL,output_tokens=NULL,
      usage_unknown=true,next_attempt_at=clock_timestamp()+CASE WHEN a.attempts=1 THEN interval '10 seconds' ELSE interval '60 seconds' END,
      attempt_history=jsonb_set(a.attempt_history,ARRAY[(a.attempts-1)::text],a.attempt_history->(a.attempts-1)
        || jsonb_build_object('finishedAt',clock_timestamp(),'requestId',NULL,'inputTokens',NULL,'outputTokens',NULL,
          'costUsd',NULL,'errorCode','lease_expired','usageUnknown',true))
    FROM expired WHERE a.id=expired.id`,scope.tenantId,scope.workspaceId,
    scope.interestId ?? null));
  }
}

async function findAssessment(tx: AssessmentSqlTransaction, scope: ReaderValueScope, id: string) {
  return mapFirst(await tx.$queryRawUnsafe<Rows>(`SELECT row_to_json(a) AS row FROM reader_value_assessments a
    WHERE a.tenant_id=$1::uuid AND a.workspace_id=$2::uuid AND a.id=$3::uuid
      AND (a.expires_at>clock_timestamp() OR ${activeAssessmentPin}) AND ${liveAssessmentScope}`,
  scope.tenantId,scope.workspaceId,id));
}
function mapFirst(rows: Rows): ReaderValueAssessment | null { return rows[0] ? assessmentFromRecord(rows[0].row) : null; }
