/** Typed insert-first attempt delegate; hidden global PK conflicts fail closed. */
import type { PrismaIngestionClient } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-ingestion-client';
import type { PrismaScanAttemptRecord } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-ingestion-records';
type Sql=Readonly<{$queryRawUnsafe:<T>(query:string,...values:unknown[])=>Promise<T>;scanAttempt:PrismaIngestionClient['scanAttempt']}>;
type Scope=Readonly<{tenantId:string;workspaceId:string;sourceBindingId:string}>;
const returned=`scan_job_id AS "scanJobId",tenant_id AS "tenantId",workspace_id AS "workspaceId",
 source_binding_id AS "sourceBindingId",attempt_number AS "attemptNumber",status,started_at AS "startedAt",
 finished_at AS "finishedAt",fetched,inserted,skipped_duplicates AS "skippedDuplicates",projected,failure_reason AS "failureReason"`;
function need(ok:unknown,reason:string):asserts ok{if(!ok)throw new Error(reason);}
export function finiteGitHubArchiveAttemptDelegate(sql:Sql,scope:Scope):PrismaIngestionClient['scanAttempt']{
 const created=new Set<string>();
 return {upsert:async args=>{
  const job=args.where.scanJobId,c=args.create;
  need(c.scanJobId===job&&c.tenantId===scope.tenantId&&c.workspaceId===scope.workspaceId
   &&c.sourceBindingId===scope.sourceBindingId,'Archived GitHub attempt scope changed');
  let rows:readonly PrismaScanAttemptRecord[];
  if(!created.has(job)){
   rows=await sql.$queryRawUnsafe<readonly PrismaScanAttemptRecord[]>(`
    INSERT INTO scan_attempts(scan_job_id,tenant_id,workspace_id,source_binding_id,attempt_number,status,
     started_at,finished_at,fetched,inserted,skipped_duplicates,projected,failure_reason,updated_at)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::"ScanAttemptStatus",$7,$8,$9,$10,$11,$12,$13,now()) RETURNING ${returned}`,
    job,c.tenantId,c.workspaceId,c.sourceBindingId,c.attemptNumber,c.status,c.startedAt,c.finishedAt??null,
    c.fetched,c.inserted,c.skippedDuplicates,c.projected,c.failureReason??null);
   need(rows.length===1,'Archived GitHub new attempt insertion uncertain');created.add(job);
  }else{
   const u=args.update;
   rows=await sql.$queryRawUnsafe<readonly PrismaScanAttemptRecord[]>(`
    UPDATE scan_attempts SET attempt_number=$5,status=$6::"ScanAttemptStatus",started_at=$7,finished_at=$8,fetched=$9,
     inserted=$10,skipped_duplicates=$11,projected=$12,failure_reason=$13,updated_at=now()
    WHERE scan_job_id=$1::uuid AND tenant_id=$2::uuid AND workspace_id=$3::uuid
     AND source_binding_id=$4::uuid RETURNING ${returned}`,
    job,scope.tenantId,scope.workspaceId,scope.sourceBindingId,u.attemptNumber,u.status,u.startedAt,u.finishedAt??null,
    u.fetched,u.inserted,u.skippedDuplicates,u.projected,u.failureReason??null);
   need(rows.length===1,'Archived GitHub transaction-owned attempt update uncertain');
  }
  return rows[0]!;
 },findFirst:async args=>{
  need(args.where.tenantId===scope.tenantId&&args.where.workspaceId===scope.workspaceId,'Archived GitHub attempt read scope changed');
  return sql.scanAttempt.findFirst(args);
 }};
}
