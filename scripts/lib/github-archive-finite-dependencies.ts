/** Archived GitHub finite transaction; inserts cannot mutate retained attempt/feed identities. */
import type { PrismaIngestionWorkerConnection } from '../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection';
import { PrismaSourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository';
import { PrismaScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository';
import { PrismaScanLeaseAdapter } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter';
import { PrismaFeedProjectionAdapter } from '@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter';
import { feedDedupeKeyForItem } from '@social-monitor/feed/adapters/persistence/feed-dedupe-key';
import { CryptoIdGenerator,SystemClock } from '@social-monitor/shared-kernel';
import { insertOnlyFeedTransaction } from '../import-rss-sep24-verified';
import { noRetryGitHubArchiveTransaction } from './github-archive-finite-journal';
import { assertFiniteGitHubArchiveRole,githubArchiveRelationConfigMatches,scopedGitHubArchiveRelationSql } from './github-archive-finite-role-policy';
import { finiteGitHubArchiveAttemptDelegate } from './github-archive-finite-attempt-delegate';
import type { GitHubArchiveAtomicDependencies,GitHubArchiveWriteDependencies } from '../backfill/github-archive-write/internal-writer';
type Transaction=PrismaIngestionWorkerConnection&{$queryRawUnsafe:<T>(sql:string,...values:unknown[])=>Promise<T>};
function need(ok:unknown,reason:string):asserts ok{if(!ok)throw new Error(reason);}
export function createFiniteGitHubArchiveDependencies(connection:PrismaIngestionWorkerConnection):GitHubArchiveAtomicDependencies{
 const ids=new CryptoIdGenerator();
 return {withAtomicWrites:(scope,query,config,work)=>{
  need(githubArchiveRelationConfigMatches(config,query),'Archived GitHub relation config mismatch');
  return connection.$transaction(async transaction=>{
   const raw=transaction as unknown as Transaction;
   await assertFiniteGitHubArchiveRole((sql,values)=>raw.$queryRawUnsafe(sql,...values),scope,'write');
   const relation=await raw.$queryRawUnsafe<readonly unknown[]>(scopedGitHubArchiveRelationSql,
    scope.tenantId,scope.workspaceId,scope.interestId,scope.sourceBindingId,scope.scanPolicyId,config);
   need(relation.length===1,'Archived GitHub relation differs in Serializable admission snapshot');
   // Binding freshness is explicitly the Serializable decision snapshot, not
   // a physical through-commit lock. Metadata remains SELECT-only. Native
   // admission/finite expiry/owner serialization remain separately mandatory.
   const noRetry=noRetryGitHubArchiveTransaction(raw),attempt=finiteGitHubArchiveAttemptDelegate(noRetry,scope);
   const insertOnly=insertOnlyFeedTransaction(noRetry);
   const feed=new Proxy(insertOnly.feedItem,{get(target,property){
    if(['updateMany','delete','deleteMany'].includes(String(property)))return ()=>{throw new Error('Archived GitHub retained feed mutation refused');};
    return Reflect.get(target,property);
   }});
   const guarded=new Proxy(insertOnly,{get(target,property){
    if(property==='scanAttempt')return attempt;if(property==='feedItem')return feed;return Reflect.get(target,property);
   }});
   const finite=new Proxy(guarded,{get(target,property){
    if(property==='$transaction')return <T>(operation:(client:Transaction)=>Promise<T>)=>operation(finite);
    return Reflect.get(target,property);
   }}) as Transaction;
   const items=new PrismaSourceItemRepository(finite);
   const writes:GitHubArchiveWriteDependencies={verifyCurrentBinding:async(s,q,c)=>Object.entries(scope).every(([k,v])=>s[k as keyof typeof s]===v)
     &&q.mode===query.mode&&q.query===query.query&&c===config,
    findExistingExternalIds:async(s,values)=>{
     need(s.tenantId===scope.tenantId&&s.workspaceId===scope.workspaceId,'Archived GitHub source read scope changed');
     const rows=await finite.$queryRawUnsafe<readonly {providerItemId:string}[]>(`
      SELECT provider_item_id AS "providerItemId" FROM source_items
      WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND provider_key='github-trending-page'
       AND provider_item_id=ANY($3::text[])`,scope.tenantId,scope.workspaceId,values);
     return rows.map(row=>row.providerItemId);
    },
    assertUnreservedJobAndFeeds:async(s,job,candidates)=>{
     need(Object.entries(scope).every(([k,v])=>s[k as keyof typeof s]===v),'Archived GitHub reservation scope changed');
     // RLS hides foreign rows: absence here is only scoped. The insert-only
     // attempt delegate rejects a hidden global-PK conflict without an upsert.
     const jobs=await finite.$queryRawUnsafe<readonly {reserved:boolean}[]>(`
      SELECT EXISTS(SELECT 1 FROM scan_jobs WHERE id=$1::uuid
       UNION ALL SELECT 1 FROM scan_attempts WHERE scan_job_id=$1::uuid
       UNION ALL SELECT 1 FROM scan_leases WHERE scan_job_id=$1::uuid) AS reserved`,job);
     need(jobs.length===1&&jobs[0]!.reserved===false,'Archived GitHub job or lease identity already reserved');
     const pairs=candidates.map(candidate=>({url:candidate.item.canonicalUrl.toLowerCase().replace(/\/$/u,''),day:candidate.item.publishedAt.toISOString().slice(0,10)}));
     const represented=await finite.$queryRawUnsafe<readonly {reserved:boolean}[]>(`
      SELECT EXISTS(SELECT 1 FROM source_items source
        JOIN jsonb_to_recordset($3::jsonb) AS wanted(url text,day text)
        ON lower(regexp_replace(source.canonical_url,'/+$',''))=wanted.url
        AND source.published_at>=(wanted.day::date::timestamp AT TIME ZONE 'UTC')
        AND source.published_at<((wanted.day::date+1)::timestamp AT TIME ZONE 'UTC')
        WHERE source.tenant_id=$1::uuid AND source.workspace_id=$2::uuid
        AND source.provider_key='github-trending-page'
        UNION ALL SELECT 1 FROM feed_items feed
        JOIN jsonb_to_recordset($3::jsonb) AS wanted(url text,day text)
        ON lower(regexp_replace(feed.canonical_url,'/+$',''))=wanted.url
        AND feed.published_at>=(wanted.day::date::timestamp AT TIME ZONE 'UTC')
        AND feed.published_at<((wanted.day::date+1)::timestamp AT TIME ZONE 'UTC')
        WHERE feed.tenant_id=$1::uuid AND feed.workspace_id=$2::uuid
        AND feed.interest_id=$4::uuid AND feed.provider_key='github-trending-page') AS reserved`,scope.tenantId,scope.workspaceId,JSON.stringify(pairs),scope.interestId);
     need(represented.length===1&&represented[0]!.reserved===false,'Archived GitHub repository/day already represented');
     const keys=candidates.map(c=>feedDedupeKeyForItem({canonicalUrl:c.item.canonicalUrl,
      sourceBindingId:scope.sourceBindingId,providerMetadata:c.item.metadata}));
     need(new Set(keys).size===keys.length,'Archived GitHub duplicate projection identities');
     const feeds=await finite.$queryRawUnsafe<readonly {reserved:boolean}[]>(`
      SELECT EXISTS(SELECT 1 FROM feed_items WHERE tenant_id=$1::uuid
       AND interest_id=$2::uuid AND dedupe_key=ANY($3::text[])) AS reserved`,scope.tenantId,scope.interestId,keys);
     need(feeds.length===1&&feeds[0]!.reserved===false,'Archived GitHub feed identity already reserved');
    },
    sourceItems:{saveBatchInsertOnly:command=>items.saveBatchInsertOnly(command)},
    feedProjection:new PrismaFeedProjectionAdapter(finite,ids),scanAttempts:new PrismaScanAttemptRepository(finite),
    scanLeases:new PrismaScanLeaseAdapter(finite,ids),ids,clock:new SystemClock()};
   return work(writes);
  },{isolationLevel:'Serializable',maxWait:5000,timeout:120000});
 }};
}
