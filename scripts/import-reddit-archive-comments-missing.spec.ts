import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { parseRedditArchiveCommentsArgs, assertRedditArchiveCommentsClaim, runRedditArchiveCommentsWithRuntime } from './import-reddit-archive-comments-missing';
import { openRedditArchivePrivateDirectory as directory, readRedditArchivePrivateFile as file } from './import-reddit-archive-missing';
import { planRedditArchiveComments } from './backfill/reddit-archive-write/comment-plan';
import { executeInternalRedditArchiveCommentWrite } from './backfill/reddit-archive-write/comment-internal-writer';
import { createFiniteRedditArchiveCommentDependencies } from './lib/reddit-archive-comment-dependencies';
import { writeExclusive } from './lib/github-archive-finite-journal';
import { commentPlan } from './backfill/reddit-archive-write/comment-plan.spec-support';
import type { PrismaIngestionWorkerConnection } from '../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection';

jest.mock('./import-reddit-archive-missing',()=>({openRedditArchivePrivateDirectory:jest.fn(),readRedditArchivePrivateFile:jest.fn()}));
jest.mock('node:fs/promises',()=>({...jest.requireActual('node:fs/promises'),lstat:jest.fn()}));
jest.mock('./backfill/reddit-archive-write/comment-plan',()=>({planRedditArchiveComments:jest.fn()}));
jest.mock('./backfill/reddit-archive-write/comment-internal-writer',()=>({executeInternalRedditArchiveCommentWrite:jest.fn()}));
jest.mock('./lib/reddit-archive-comment-dependencies',()=>({createFiniteRedditArchiveCommentDependencies:jest.fn()}));
jest.mock('./lib/github-archive-finite-journal',()=>({writeExclusive:jest.fn()}));
const hash=(raw:Buffer|string)=>createHash('sha256').update(raw).digest('hex');
const journalDir='/var/lib/platform/social-monitor/collection/reddit-archive-comments-qualified-journals';
const correlation='reddit-archive-comments-import-00000000-0000-4000-8000-000000000001';
function fixture(){
 const packet=Buffer.from('{"synthetic":true}'),plan={...commentPlan(),packetSha256:hash(packet)};
 const claim={mode:'import-reddit-archive-comments-missing',inputRoot:'/input-source/2026-10-01',day:'2026-10-01',
  journalDir,semanticKey:plan.semanticKey,planSha256:plan.planSha256,packetSha256:plan.packetSha256,correlationId:correlation};
 const bytes=Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(claim).sort()))+'\n');
 const args=[claim.inputRoot,claim.day,journalDir,claim.semanticKey,claim.planSha256,claim.packetSha256,correlation,hash(bytes),'--native-write'];
 return {plan,packet,claim,bytes,args,request:parseRedditArchiveCommentsArgs(args)};
}
beforeEach(()=>jest.clearAllMocks());
describe('finite native comments CLI',()=>{
 it('accepts the exact flag-last contract and refuses post/date/path/claim substitutes',()=>{
  const f=fixture();expect(f.request.day).toBe('2026-10-01');assertRedditArchiveCommentsClaim(f.bytes,f.request);
  for(const args of [f.args.slice(1),['--native-write',...f.args.slice(0,8)],
   f.args.map((x,i)=>i===1?'2026-10-02':x),f.args.map((x,i)=>i===0?'/input-source/2026-10-01/../2026-10-01':x),
   f.args.map((x,i)=>i===2?'/tmp/journals':x),f.args.map((x,i)=>i===6?'reddit-archive-import-old':x)]){
   expect(()=>parseRedditArchiveCommentsArgs(args)).toThrow();
  }
  for(const value of [{...f.claim,mode:'import-reddit-archive-missing'},{...f.claim,day:'2026-10-02'},{...f.claim,extra:true}]){
   const raw=Buffer.from(JSON.stringify(value)+'\n');expect(()=>assertRedditArchiveCommentsClaim(raw,{...f.request,claimSha256:hash(raw)})).toThrow();
  }
  const duplicate=Buffer.from(f.bytes.toString().trim().slice(0,-1)+',"day":"2026-10-01"}\n');
  expect(()=>assertRedditArchiveCommentsClaim(duplicate,{...f.request,claimSha256:hash(duplicate)})).toThrow();
  expect(()=>assertRedditArchiveCommentsClaim(f.bytes,{...f.request,claimSha256:'f'.repeat(64)})).toThrow('digest');
 });
 function harness(options:{badClaim?:boolean;badPacket?:boolean;badPlan?:boolean;badNative?:boolean;roleDenied?:boolean;rebound?:boolean;claimAfterStart?:boolean;
  prismaCloseError?:Error;directoryCloseError?:Error}={}){
  const f=fixture(),events:string[]=[],handles:ReturnType<typeof handle>[]=[];
  function handle(){return {fd:17,stat:jest.fn(async()=>({dev:1,ino:2})),sync:jest.fn(async()=>{}),
   close:jest.fn(async()=>{if(options.directoryCloseError)throw options.directoryCloseError;})};}
  jest.mocked(directory).mockImplementation(async()=>{const h=handle();handles.push(h);return h as never;});
  jest.mocked(lstat).mockResolvedValue({dev:1,ino:options.rebound?9:2,isDirectory:()=>true,isSymbolicLink:()=>false} as never);
  jest.mocked(file).mockImplementation(async(_parent,name)=>{
   events.push(name);
   if(name==='reddit-archive-comments-import-claim.json')return options.badClaim
    ||(options.claimAfterStart&&events.filter(x=>x===name).length===4)?Buffer.from('{}'):f.bytes;
   if(name==='packet.json')return options.badPacket?Buffer.from('{}'):f.packet;
   if(name==='archive.json')return Buffer.alloc(4750);
   return Buffer.from(options.badNative?'id=foreign\n':`id=20261016T160000Z-${correlation.slice('reddit-archive-comments-import-'.length)} plan_sha256=${f.plan.planSha256}\n`);
  });
  jest.mocked(planRedditArchiveComments).mockReturnValue(options.badPlan?{...f.plan,planSha256:'f'.repeat(64)}:f.plan);
  const query=jest.fn(async(sql:string)=>sql.includes('WITH stamp')?[{allowed:!options.roleDenied}]:[
   {sourceItemId:'9d1b26ae-ed89-41d5-aaa9-bf786b97c90c',feedItemId:'b179076b-4f9e-45d7-8d57-64346600ca90'}]);
  const close=jest.fn(async()=>{if(options.prismaCloseError)throw options.prismaCloseError;}),
   open=jest.fn(async()=>({close}) as unknown as PrismaIngestionWorkerConnection);
  jest.mocked(createFiniteRedditArchiveCommentDependencies).mockImplementation((_connection,_ids,_clock,admission)=>({
   withAtomicWrites:async(plan)=>{events.push('admission');await admission!({$queryRawUnsafe:query} as never,plan);return undefined as never;}
  }));
  jest.mocked(executeInternalRedditArchiveCommentWrite).mockImplementation(async(input,lifecycle)=>{
   await lifecycle.consumeStartedJournal(input.journalDirectory!,`reddit-archive-comments-qualified-${f.plan.semanticKey}.journal.json`,
    {semanticKey:f.plan.semanticKey,planSha256:f.plan.planSha256});
   await input.dependencies.withAtomicWrites(input.plan,async()=>undefined);
   return {coverage:'PARTIAL_ARCHIVED_OBSERVATIONS',planSha256:f.plan.planSha256,inserted:2,alreadyPresent:0,postWritePresent:2};
  });
  return {...f,events,handles,query,open,close,run:()=>runRedditArchiveCommentsWithRuntime(f.request,'postgresql://synthetic@localhost/test',{openPrisma:open})};
 }
 it('wires concrete admission and an exclusive comments journal with immutable mixed dates, then closes custody',async()=>{
  const h=harness();await expect(h.run()).resolves.toMatchObject({inserted:2,alreadyPresent:0,postWritePresent:2});
  expect(h.plan.originalDays).toEqual(['2026-10-01','2026-10-02']);expect(h.query).toHaveBeenCalledTimes(2);
  expect(writeExclusive).toHaveBeenCalledWith(`/proc/self/fd/17/reddit-archive-comments-qualified-${h.plan.semanticKey}.journal.json`,
   {semanticKey:h.plan.semanticKey,planSha256:h.plan.planSha256,status:'started'});
  expect(h.close).toHaveBeenCalledTimes(1);expect(h.handles.every(x=>x.close.mock.calls.length===1)).toBe(true);
  expect(h.events.filter(x=>x==='reddit-archive-comments-import-claim.json')).toHaveLength(4);
 });
 it.each([{badClaim:true},{badPacket:true},{badPlan:true},{badNative:true},{rebound:true}])(
  'refuses changed custody before opening a database (%j)',async options=>{
   const h=harness(options);await expect(h.run()).rejects.toThrow();expect(h.open).not.toHaveBeenCalled();
   expect(writeExclusive).not.toHaveBeenCalled();expect(h.handles.every(x=>x.close.mock.calls.length===1)).toBe(true);
  });
 it('rechecks claim custody inside admission after the journal is consumed',async()=>{
  const h=harness({claimAfterStart:true});await expect(h.run()).rejects.toThrow('claim digest');
  expect(writeExclusive).toHaveBeenCalledTimes(1);expect(h.query).not.toHaveBeenCalled();expect(h.close).toHaveBeenCalledTimes(1);
 });
 it('does not enter admission or retry when the exclusive journal already exists',async()=>{
  const h=harness();jest.mocked(writeExclusive).mockRejectedValueOnce(new Error('Journal exists'));
  await expect(h.run()).rejects.toThrow('Journal exists');expect(writeExclusive).toHaveBeenCalledTimes(1);
  expect(h.query).not.toHaveBeenCalled();expect(h.close).toHaveBeenCalledTimes(1);
 });
 it('leaves the owned started journal and refuses a concrete authority failure without retry',async()=>{
  const h=harness({roleDenied:true});await expect(h.run()).rejects.toThrow('finite identity');
  expect(writeExclusive).toHaveBeenCalledTimes(1);expect(h.query).toHaveBeenCalledTimes(1);expect(h.open).toHaveBeenCalledTimes(1);
  expect(h.close).toHaveBeenCalledTimes(1);
 });
 it.each([true,false])('attempts Prisma and every handle close, preserving work failure or the first cleanup failure (workFails=%s)',async workFails=>{
  const primary=new Error('Primary CLI work failed'),firstCleanup=new Error('Prisma close failed'),laterCleanup=new Error('Directory close failed');
  const h=harness({prismaCloseError:firstCleanup,directoryCloseError:laterCleanup});
  if(workFails)jest.mocked(executeInternalRedditArchiveCommentWrite).mockRejectedValueOnce(primary);
  await expect(h.run()).rejects.toBe(workFails?primary:firstCleanup);
  expect(h.close).toHaveBeenCalledTimes(1);expect(h.handles).toHaveLength(3);
  expect(h.handles.every(handle=>handle.close.mock.calls.length===1)).toBe(true);
 });
 it('refuses a directory cleanup failure after Prisma closes successfully and still closes every handle',async()=>{
  const cleanup=new Error('Directory close failed'),h=harness({directoryCloseError:cleanup});
  await expect(h.run()).rejects.toBe(cleanup);expect(h.close).toHaveBeenCalledTimes(1);
  expect(h.handles).toHaveLength(3);expect(h.handles.every(handle=>handle.close.mock.calls.length===1)).toBe(true);
 });
});
