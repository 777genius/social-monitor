/** Explicit comments-only native entry; root-owned claim and genuine pinned inputs are mandatory. */
import { lstat, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { runWithTenantDatabaseAccess } from '@social-monitor/platform-persistence';
import { PrismaIngestionWorkerConnection } from '../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection';
import { openRedditArchivePrivateDirectory as directory, readRedditArchivePrivateFile as file } from './import-reddit-archive-missing';
import { finiteRssDatabaseUrl } from './import-rss-sep24-verified';
import { planRedditArchiveComments } from './backfill/reddit-archive-write/comment-plan';
import { executeInternalRedditArchiveCommentWrite } from './backfill/reddit-archive-write/comment-internal-writer';
import { createFiniteRedditArchiveCommentDependencies } from './lib/reddit-archive-comment-dependencies';
import { createRedditArchiveCommentAdmission } from './lib/reddit-archive-comment-admission';
import { archiveNeed as need, redditArchiveHash as hash } from './lib/reddit-archive-finite-policy';
import { writeExclusive } from './lib/github-archive-finite-journal';

const MODE='import-reddit-archive-comments-missing', INPUT='/input-source/2026-10-01';
const JOURNALS='/var/lib/platform/social-monitor/collection/reddit-archive-comments-qualified-journals';
const CLAIM_ROOT='/run/social-monitor', CLAIM_LEAF='reddit-archive-comments-import-claim.json';
export type RedditArchiveCommentsRequest=Readonly<{inputRoot:string;day:string;journalDir:string;semanticKey:string;
 expectedPlanSha256:string;packetSha256:string;correlationId:string;claimSha256:string}>;

export function parseRedditArchiveCommentsArgs(args:readonly string[]):RedditArchiveCommentsRequest {
 need(args.length===9&&args[8]==='--native-write','Comments exact nine arguments with flag last required');
 const [inputRoot,day,journalDir,semanticKey,expectedPlanSha256,packetSha256,correlationId,claimSha256]=args;
 need(inputRoot===INPUT&&day==='2026-10-01'&&journalDir===JOURNALS,'Comments native mounts or parent-day changed');
 need([semanticKey,expectedPlanSha256,packetSha256,claimSha256].every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/u.test(x)),
  'Comments exact digest pins required');
 need(typeof correlationId==='string'&&/^reddit-archive-comments-import-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(correlationId),
  'Comments native correlation required');
 return {inputRoot,day,journalDir,semanticKey:semanticKey!,expectedPlanSha256:expectedPlanSha256!,
  packetSha256:packetSha256!,correlationId,claimSha256:claimSha256!};
}

export function assertRedditArchiveCommentsClaim(raw:Buffer,request:RedditArchiveCommentsRequest):void {
 need(hash(raw)===request.claimSha256,'Comments native claim digest changed');
 const expected={mode:MODE,inputRoot:request.inputRoot,day:request.day,journalDir:request.journalDir,
  semanticKey:request.semanticKey,planSha256:request.expectedPlanSha256,packetSha256:request.packetSha256,correlationId:request.correlationId};
 // Native issuer emits this exact sorted compact encoding; duplicate keys and alternate encodings refuse.
 const canonical=JSON.stringify(Object.fromEntries(Object.entries(expected).sort(([a],[b])=>a.localeCompare(b))))+'\n';
 need(raw.toString('utf8')===canonical,'Comments exact eight-field native claim changed');
}

async function anchored(path:string,handle:FileHandle):Promise<void> {
 const [named,held]=await Promise.all([lstat(path),handle.stat()]);
 need(named.isDirectory()&&!named.isSymbolicLink()&&named.dev===held.dev&&named.ino===held.ino,'Comments directory rebound');
}
export type RedditArchiveCommentsRuntime=Readonly<{openPrisma:(url:string)=>Promise<PrismaIngestionWorkerConnection>;testOwnerUid?:number}>;
export async function runRedditArchiveCommentsWithRuntime(request:RedditArchiveCommentsRequest,databaseUrl:string,runtime:RedditArchiveCommentsRuntime){
 // Revalidate exported runtime entry too; direct callers cannot substitute old modes/paths.
 parseRedditArchiveCommentsArgs([request.inputRoot,request.day,request.journalDir,request.semanticKey,request.expectedPlanSha256,
  request.packetSha256,request.correlationId,request.claimSha256,'--native-write']);
 const uid=runtime.testOwnerUid??0,handles:FileHandle[]=[];
 let prisma:PrismaIngestionWorkerConnection|undefined;
 try {
  const claim=await directory(CLAIM_ROOT,uid);handles.push(claim);
  const verifyClaim=async()=>{await anchored(CLAIM_ROOT,claim);assertRedditArchiveCommentsClaim(await file(claim,CLAIM_LEAF,uid,8192),request);};
  await verifyClaim();
  const input=await directory(request.inputRoot,uid);handles.push(input);
  const packet=await file(input,'packet.json',uid,65536),raw=await file(input,'archive.json',uid,4750);
  await anchored(request.inputRoot,input);
  need(hash(packet)===request.packetSha256,'Comments packet pin changed');
  const plan=planRedditArchiveComments(raw,packet);
  need(plan.semanticKey===request.semanticKey&&plan.planSha256===request.expectedPlanSha256
   &&isDeepStrictEqual(plan.originalDays,['2026-10-01','2026-10-02']),'Comments recomputed plan or original dates changed');
  const journal=await directory(request.journalDir,uid);handles.push(journal);
  const journalFilename='reddit-archive-comments-qualified-'+plan.semanticKey+'.journal.json';
  const verifyNativeIntent=async()=>{
   await verifyClaim();await anchored(request.journalDir,journal);
   const native=await file(journal,plan.semanticKey+'.native-claim',uid,256);
   const physical=request.correlationId.slice('reddit-archive-comments-import-'.length);
   need(new RegExp('^id=[0-9]{8}T[0-9]{6}Z-'+physical+' plan_sha256='+plan.planSha256+'\\n$','u').test(native.toString('ascii')),
    'Comments owned native journal claim changed');
  };
  await verifyNativeIntent();
  prisma=await runtime.openPrisma(finiteRssDatabaseUrl(databaseUrl));
  const dependencies=createFiniteRedditArchiveCommentDependencies(prisma,new CryptoIdGenerator(),new SystemClock(),
   createRedditArchiveCommentAdmission(plan,verifyNativeIntent));
  return await runWithTenantDatabaseAccess(plan.scope,()=>executeInternalRedditArchiveCommentWrite({
   plan,semanticKey:request.semanticKey,expectedPlanSha256:request.expectedPlanSha256,correlationId:request.correlationId,
   journalPath:join(request.journalDir,journalFilename),journalDirectory:journal,dependencies}, {
    consumeStartedJournal:async(parent,name,value)=>{await verifyNativeIntent();
     need(parent===journal&&name===journalFilename&&value.semanticKey===plan.semanticKey&&value.planSha256===plan.planSha256,
      'Comments journal identity changed');
     await writeExclusive('/proc/self/fd/'+journal.fd+'/'+name,{...value,status:'started'});await journal.sync();
    }
   }));
 } finally {try{await prisma?.close();}finally{const closed=await Promise.allSettled(handles.reverse().map(handle=>handle.close()));
  const failed=closed.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;}}
}
async function main(){
 need(process.getuid?.()===0,'Comments native root invocation required');
 const receipt=await runRedditArchiveCommentsWithRuntime(parseRedditArchiveCommentsArgs(process.argv.slice(2)),process.env.DATABASE_URL??'',{
  openPrisma:url=>PrismaIngestionWorkerConnection.createForProcess(url,'daily-runner')});
 console.log(JSON.stringify(receipt));
}
if(require.main===module)void main().catch(()=>{console.error('Archived Reddit comments refused; preserve owned journal and UNKNOWN; no retry');process.exitCode=1;});
