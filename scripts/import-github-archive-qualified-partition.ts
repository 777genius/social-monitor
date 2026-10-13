/** Source-only Archived GitHub entrypoint candidate. Production requires a native fixed claim. */
import { constants } from 'node:fs';
import { lstat,open,realpath,type FileHandle } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute,join,resolve } from 'node:path';
import { PrismaIngestionWorkerConnection } from '../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection';
import { runWithTenantDatabaseAccess } from '@social-monitor/platform-persistence';
import { assertTrustedAncestry,finiteRssDatabaseUrl,openFiniteOperatorSqlPool } from './import-rss-sep24-verified';
import { scopedGitHubArchiveRead,verifyScopedGitHubArchiveRelation } from './lib/github-archive-finite-role-policy';
import { createFiniteGitHubArchiveDependencies } from './lib/github-archive-finite-dependencies';
import { planGitHubArchiveQualifiedPartition, type GitHubArchivePlannerInput } from './plan-github-archive-qualified-partitions';
import { executeInternalGitHubArchiveBoundedWrite,type GitHubArchiveWriteLifecycle } from './backfill/github-archive-write/internal-writer';
import { writeExclusive } from './lib/github-archive-finite-journal';
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
function need(ok:unknown,reason:string):asserts ok{if(!ok)throw new Error(reason);}
function absolute(path:string):string{need(isAbsolute(path)&&resolve(path)===path,'Archived GitHub explicit absolute path required');return path;}
async function directory(path:string,uid:number):Promise<FileHandle>{
 await assertTrustedAncestry(path,uid);const before=await lstat(path);
 need(before.isDirectory()&&before.uid===uid&&(before.mode&0o7777)===0o700&&await realpath(path)===path,'Archived GitHub private directory required');
 const handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 const after=await handle.stat();if(before.dev!==after.dev||before.ino!==after.ino){await handle.close();throw new Error('Archived GitHub directory rebound');}
 return handle;
}
async function file(parent:FileHandle,name:string,uid:number,limit:number):Promise<Buffer>{
 need(/^[a-zA-Z0-9._-]+$/u.test(name),'Archived GitHub fixed leaf required');
 const handle=await open('/proc/self/fd/'+parent.fd+'/'+name,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await handle.stat();need(before.isFile()&&before.uid===uid&&before.nlink===1
   &&(before.mode&0o7777)===0o600&&before.size>0&&before.size<=limit,'Archived GitHub private input file required');
  const bytes=await handle.readFile(),after=await handle.stat();
  need(bytes.length===before.size&&before.dev===after.dev&&before.ino===after.ino&&before.size===after.size
   &&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,'Archived GitHub input changed');return bytes;
 }finally{await handle.close();}
}
export type GitHubArchivePartitionRequest=Readonly<{inputRoot:string;day:string;journalDir:string;semanticKey:string;expectedPlanSha256:string;packetSha256:string;correlationId:string}>;
async function selected(request:Pick<GitHubArchivePartitionRequest,'inputRoot'|'day'|'semanticKey'|'packetSha256'>,uid:number){
 need(/^2026-(09|10)-[0-3][0-9]$/u.test(request.day)&&/^[a-f0-9]{64}$/u.test(request.semanticKey)&&/^[a-f0-9]{64}$/u.test(request.packetSha256),'Archived GitHub fixed date/key/packet required');
 const input=await directory(absolute(request.inputRoot),uid);
 try{
  const packet=await file(input,'packet.json',uid,128*1024),bytes=await file(input,'archive.json',uid,1024*1024);
  need(hash(packet)===request.packetSha256,'Archived GitHub native packet pin mismatch');
  const value:unknown=JSON.parse(packet.toString('utf8'));
  need(value!==null&&typeof value==='object'&&!Array.isArray(value),'Archived GitHub packet object required');
  const raw=value as Record<string,unknown>;
  need(Object.keys(raw).sort().join(',')===['archive','bindingConfig','expectedBindingConfigSha256','missingRepositoryNames','scope','sourceQuery'].sort().join(','),'Archived GitHub packet shape mismatch');
  const planned=planGitHubArchiveQualifiedPartition({...raw,bytes,qualifiedSha256:request.packetSha256} as GitHubArchivePlannerInput);
  need(planned.semanticKey===request.semanticKey&&planned.plan.day===request.day,'Archived GitHub recomputed identity/day mismatch');
  return planned;
 }finally{await input.close();}
}
export async function readGitHubArchiveQualifiedPartition(request:Pick<GitHubArchivePartitionRequest,'inputRoot'|'day'|'semanticKey'|'packetSha256'>,uid=0){return selected(request,uid);}
function lifecycle(semanticKey:string,planSha256:string):GitHubArchiveWriteLifecycle{
 return {scanJobId:key=>{
  need(key===semanticKey,'Archived GitHub job key changed');const bytes=createHash('sha256').update('github-archive-qualified:'+key).digest().subarray(0,16);
  bytes[6]=(bytes[6]!&0x0f)|0x40;bytes[8]=(bytes[8]!&0x3f)|0x80;const h=bytes.toString('hex');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
 },consumeStartedJournal:async(parent,name,journal)=>{
  need(name==='github-archive-qualified-'+semanticKey+'.journal.json'&&journal.planSha256===planSha256&&journal.semanticKey===semanticKey,'Archived GitHub started journal identity changed');
  await writeExclusive('/proc/self/fd/'+parent.fd+'/'+name,{...journal,status:'started'});await parent.sync();
 }};
}
export type GitHubArchivePartitionRuntime=Readonly<{openSql:(url:string)=>Pick<ReturnType<typeof openFiniteOperatorSqlPool>,'connect'|'end'>;
 openPrisma:(url:string)=>Promise<PrismaIngestionWorkerConnection>;testOwnerUid?:number}>;
export async function runGitHubArchiveQualifiedPartitionWithRuntime(request:GitHubArchivePartitionRequest,databaseUrl:string,runtime:GitHubArchivePartitionRuntime){
 need(/^[a-f0-9]{64}$/u.test(request.expectedPlanSha256)&&/^[a-zA-Z0-9._:-]{1,128}$/u.test(request.correlationId),'Archived GitHub exact plan/correlation required');
 const uid=runtime.testOwnerUid??0,partition=await selected(request,uid);
 need(partition.plan.planSha256===request.expectedPlanSha256,'Archived GitHub recomputed plan mismatch');
 const journalDirectory=await directory(absolute(request.journalDir),uid),scope={...partition.plan.scope,correlationId:request.correlationId};
 let sql:Pick<ReturnType<typeof openFiniteOperatorSqlPool>,'connect'|'end'>|undefined,prisma:PrismaIngestionWorkerConnection|undefined;
 try{
  const url=finiteRssDatabaseUrl(databaseUrl);sql=runtime.openSql(url);await scopedGitHubArchiveRead(sql,scope,async()=>undefined);
  need(await verifyScopedGitHubArchiveRelation(sql,scope,partition.plan.sourceQuery,partition.plan.bindingConfig),'Archived GitHub current scoped relation differs');
  prisma=await runtime.openPrisma(url);
  return await runWithTenantDatabaseAccess(scope,()=>executeInternalGitHubArchiveBoundedWrite({plan:partition.plan,
   semanticKey:request.semanticKey,expectedPlanSha256:request.expectedPlanSha256,scope,
   journalPath:join(request.journalDir,partition.journalFilename),journalDirectory,dependencies:createFiniteGitHubArchiveDependencies(prisma!)},
   lifecycle(request.semanticKey,request.expectedPlanSha256)));
 }finally{try{await prisma?.close();}finally{try{await sql?.end();}finally{await journalDirectory.close();}}}
}
async function main(){
 const args=process.argv.slice(2);need(args.length===9&&args[0]==='--native-write'&&process.getuid?.()===0,'Archived GitHub native root invocation required');
 const [,inputRoot,day,journalDir,semanticKey,expectedPlanSha256,packetSha256,correlationId,claimSha256]=args;
 need(/^[a-f0-9]{64}$/u.test(claimSha256!),'Archived GitHub exact native claim digest required');
 const parent=await directory('/run/social-monitor',0);let raw:Buffer;
 try{raw=await file(parent,'github-archive-import-claim.json',0,8192);}finally{await parent.close();}
 need(hash(raw)===claimSha256,'Archived GitHub native claim changed');const claim:unknown=JSON.parse(raw.toString('utf8'));
 need(claim!==null&&typeof claim==='object'&&!Array.isArray(claim),'Archived GitHub native claim object required');const c=claim as Record<string,unknown>;
 need(c.mode==='import-github-archive-missing'&&c.inputRoot===inputRoot&&c.day===day&&c.journalDir===journalDir
  &&c.semanticKey===semanticKey&&c.planSha256===expectedPlanSha256&&c.packetSha256===packetSha256&&c.correlationId===correlationId,'Archived GitHub native claim identity changed');
 const receipt=await runGitHubArchiveQualifiedPartitionWithRuntime({inputRoot:inputRoot!,day:day!,journalDir:journalDir!,
  semanticKey:semanticKey!,expectedPlanSha256:expectedPlanSha256!,packetSha256:packetSha256!,correlationId:correlationId!},process.env.DATABASE_URL??'',{
   openSql:openFiniteOperatorSqlPool,
   openPrisma:url=>PrismaIngestionWorkerConnection.createForProcess(url,'daily-runner')});
 console.log(JSON.stringify(receipt));
}
if(require.main===module)void main().catch(()=>{console.error('Archived GitHub finite import refused; preserve native journal and UNKNOWN; no retry');process.exitCode=1;});
