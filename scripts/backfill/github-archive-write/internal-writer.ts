/** Internal Archived GitHub finite writer; provenance and native intent admission are separate. */
import { parseGitHubTrendingArchiveMetadata } from '@social-monitor/ingestion/domain/value-objects/github-trending-archive';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat,open,rename,type FileHandle } from 'node:fs/promises';
import { basename,dirname,resolve } from 'node:path';
import { ExecuteScanUseCase } from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case';
import { NoopScanExecutionReporterAdapter } from '@social-monitor/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter';
import { noopSourceItemEnrichment,type SourceFetcherPort,type SourceItemRepositoryPort } from '@social-monitor/ingestion/ports';
import type { RssSep24WriteDependencies } from '../../recover-rss-sep24-verified';
import { writeExclusive } from '../../lib/github-archive-finite-journal';
import type { GitHubArchivePlan,GitHubArchiveCandidate } from '../../plan-github-archive-qualified-partitions';
import { githubArchiveRelationConfigMatches,type GitHubArchiveSourceQuery } from '../../lib/github-archive-finite-role-policy';
type Scope=GitHubArchivePlan['scope']&Readonly<{correlationId:string}>;
export type GitHubArchiveWriteDependencies=Omit<RssSep24WriteDependencies,'verifyCurrentBinding'>&Readonly<{
 verifyCurrentBinding:(scope:Scope,query:GitHubArchiveSourceQuery,config:string)=>Promise<boolean>;
 assertUnreservedJobAndFeeds:(scope:Scope,jobId:string,candidates:readonly GitHubArchiveCandidate[])=>Promise<void>;
}>;
export type GitHubArchiveAtomicDependencies=Readonly<{withAtomicWrites:<T>(scope:Scope,query:GitHubArchiveSourceQuery,config:string,
 work:(writes:GitHubArchiveWriteDependencies)=>Promise<T>)=>Promise<T>}>;
export type GitHubArchiveWriteContext=Readonly<{plan:GitHubArchivePlan;semanticKey:string;expectedPlanSha256:string;
 scope:Scope;journalPath:string;journalDirectory?:FileHandle;dependencies:GitHubArchiveAtomicDependencies}>;
export type GitHubArchiveWriteLifecycle=Readonly<{scanJobId:(key:string)=>string;consumeStartedJournal:(directory:FileHandle,
 filename:string,journal:Readonly<Record<string,unknown>>)=>Promise<void>}>;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function need(value:unknown,reason:string):asserts value{if(!value)throw new Error(reason);}
function validate(r:GitHubArchiveWriteContext):void{
 const p=r.plan,{planSha256,...unsigned}=p;
 need(p.schemaVersion===1&&p.providerKey==='github-trending-page'&&p.coverage==='PARTIAL_ARCHIVED_OBSERVATIONS'
  &&/^[a-f0-9]{64}$/u.test(planSha256)&&planSha256===r.expectedPlanSha256
  &&hash(JSON.stringify(unsigned))===planSha256,'Archived GitHub plan digest mismatch');
 need(githubArchiveRelationConfigMatches(p.bindingConfig,p.sourceQuery)
  &&hash(p.bindingConfig)===p.bindingConfigSha256,'Archived GitHub plan configuration mismatch');
 const ids=p.candidates.map(c=>c.externalId),start=Date.parse(p.day+'T00:00:00.000Z');
 need(Number.isFinite(start)&&p.selectedCount===ids.length&&ids.length>=1&&ids.length<=10
  &&new Set(ids).size===ids.length&&hash(JSON.stringify(p.candidates))===p.itemsSha256,'Archived GitHub candidate count/digest mismatch');
 need(p.candidates.every(c=>c.externalId===c.item.externalId&&parseGitHubTrendingArchiveMetadata(c.item.metadata)!==null
  &&c.item.publishedAt instanceof Date&&Number.isFinite(c.item.publishedAt.getTime())
  &&c.item.publishedAt.getTime()>=start&&c.item.publishedAt.getTime()<start+86_400_000),'Archived GitHub original item identity/date mismatch');
 need(Object.entries(p.scope).every(([key,value])=>r.scope[key as keyof Scope]===value)
  &&/^[a-zA-Z0-9._:-]{1,128}$/u.test(r.scope.correlationId),'Archived GitHub scope mismatch');
 need(hash(JSON.stringify({archive:p.archiveSha256,scope:p.scope,day:p.day,selectedIds:[...ids].sort()}))===r.semanticKey,'Archived GitHub semantic identity mismatch');
}
export async function closeOwnedGitHubArchiveDirectory(directory:Pick<FileHandle,'close'>,owned:boolean,primaryFailed:boolean):Promise<void>{
 if(!owned)return;
 try{await directory.close();}catch(error){if(!primaryFailed)throw error;}
}
export async function executeInternalGitHubArchiveBoundedWrite(input:GitHubArchiveWriteContext,lifecycle:GitHubArchiveWriteLifecycle){
 const r:GitHubArchiveWriteContext={...input,plan:structuredClone(input.plan),scope:{...input.scope}};validate(r);
 const p=r.plan,path=resolve(r.journalPath),filename='github-archive-qualified-'+r.semanticKey+'.journal.json';
 need(basename(path)===filename,'Archived GitHub journal filename mismatch');
 const directory=r.journalDirectory??await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 let failed=false;
 try{
  const before=await directory.stat();
  const location=async()=>{const current=await lstat(dirname(path));need(current.isDirectory()&&current.dev===before.dev&&current.ino===before.ino,'Archived GitHub journal directory moved; preserve UNKNOWN');};
  await location();
  const journal={schemaVersion:1,day:p.day,coverage:p.coverage,providerKey:p.providerKey,semanticKey:r.semanticKey,
   planSha256:p.planSha256,archiveSha256:p.archiveSha256,packetSha256:p.qualifiedSha256,
   bindingConfigSha256:p.bindingConfigSha256,itemsSha256:p.itemsSha256,scope:r.scope,candidateIds:p.candidates.map(c=>c.externalId)};
  await lifecycle.consumeStartedJournal(directory,filename,journal);
  const receipt=await r.dependencies.withAtomicWrites(r.scope,p.sourceQuery,p.bindingConfig,async writes=>{
   need(await writes.verifyCurrentBinding(r.scope,p.sourceQuery,p.bindingConfig),'Archived GitHub scoped binding changed; journal remains started');
   const ids=p.candidates.map(c=>c.externalId);
   // Retained census is not fresh absence. Reject any existing native ID in
   // the same serializable snapshot before the first mutation; never replay it.
   const existing=await writes.findExistingExternalIds(r.scope,ids);
   need(existing.length===0,'Archived GitHub native identity already exists; no source/feed mutation');
   const jobId=lifecycle.scanJobId(r.semanticKey);
   await writes.assertUnreservedJobAndFeeds(r.scope,jobId,p.candidates);
   let fetched=false;
   const fetcher:SourceFetcherPort={fetch:async command=>{
    need(!fetched&&command.scanJobId===jobId&&command.tenantId===r.scope.tenantId
     &&command.workspaceId===r.scope.workspaceId&&command.sourceBindingId===p.scope.sourceBindingId
     &&command.providerKey==='github-trending-page'&&command.sourceQuery.mode===p.sourceQuery.mode
     &&command.sourceQuery.query===p.sourceQuery.query&&command.cursor===undefined,'Archived GitHub verified fetch mismatch');
    fetched=true;return {items:p.candidates.map(c=>c.item),warnings:['PARTIAL_ARCHIVED_OBSERVATIONS']};
   }};
   const sourceItems:SourceItemRepositoryPort={saveBatch:command=>writes.sourceItems.saveBatchInsertOnly(command)};
   const scan=new ExecuteScanUseCase(fetcher,sourceItems,writes.feedProjection,writes.scanAttempts,
    {findBySourceBinding:async()=>null,save:async()=>{throw new Error('Archived GitHub retained import cannot save cursor');}},
    new NoopScanExecutionReporterAdapter(),{enqueueRetry:async()=>{throw new Error('Archived GitHub retained import cannot retry');},deadLetter:async()=>undefined},
    writes.scanLeases,writes.ids,writes.clock,undefined,noopSourceItemEnrichment);
   const result=await scan.execute({...r.scope,scanJobId:jobId,providerKey:'github-trending-page',sourceQuery:p.sourceQuery,
    causationId:p.planSha256,attemptNumber:1,retryBudget:0});
   need(fetched&&result.ok&&result.value.fetched===ids.length&&result.value.inserted===ids.length
    &&result.value.projected===ids.length,'Archived GitHub import outcome uncertain; journal remains started');
   const after=await writes.findExistingExternalIds(r.scope,ids);
   need(after.length===ids.length&&new Set(after).size===after.length&&after.every(id=>ids.includes(id)),'Archived GitHub post-write count mismatch; journal remains started');
   return {coverage:p.coverage,planSha256:p.planSha256,inserted:ids.length,alreadyPresent:0,postWritePresent:after.length};
  });
  await location();const anchored='/proc/self/fd/'+directory.fd+'/'+filename;
  const temporary=anchored+'.'+p.planSha256+'.complete.tmp';
  await writeExclusive(temporary,{...journal,status:'complete',...receipt});await directory.sync();await location();
  await rename(temporary,anchored);await directory.sync();await location();return receipt;
 }catch(error){failed=true;throw error;}
 finally{await closeOwnedGitHubArchiveDirectory(directory,r.journalDirectory===undefined,failed);}
}
