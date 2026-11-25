import { createRedditArchiveCommentAdmission } from './reddit-archive-comment-admission';
import { commentPlan } from '../backfill/reddit-archive-write/comment-plan.spec-support';

function admissionHarness(options:{allowed?:unknown;roles?:number;parents?:number;parentId?:string;claimError?:boolean}={}){
 const events:string[]=[],plan=commentPlan();
 const verify=jest.fn(async()=>{events.push('claim');if(options.claimError)throw new Error('Claim changed');});
 const query=jest.fn(async(sql:string,...args:unknown[])=>{
  events.push('query');
  if(sql.includes('WITH stamp')){
   expect(args).toEqual([plan.scope.tenantId,plan.scope.workspaceId]);
   return Array.from({length:options.roles??1},()=>({allowed:options.allowed??true}));
  }
  expect(args).toEqual([plan.scope.tenantId,plan.scope.workspaceId,plan.scope.sourceBindingId,plan.scope.interestId]);
  return Array.from({length:options.parents??1},()=>({sourceItemId:options.parentId??'9d1b26ae-ed89-41d5-aaa9-bf786b97c90c',
   feedItemId:'b179076b-4f9e-45d7-8d57-64346600ca90'}));
 });
 const transaction={$queryRawUnsafe:query} as unknown as Parameters<ReturnType<typeof createRedditArchiveCommentAdmission>>[0];
 return {plan,verify,query,events,run:(candidate=plan)=>createRedditArchiveCommentAdmission(plan,verify)(transaction,candidate)};
}
describe('concrete comments admission',()=>{
 it('rechecks native custody before querying the existing transaction and requires the exact retained parent',async()=>{
  const h=admissionHarness();await expect(h.run()).resolves.toBeUndefined();
  expect(h.events).toEqual(['claim','query','query']);expect(h.verify).toHaveBeenCalledTimes(1);
 });
 it.each([{allowed:false},{allowed:'true'},{roles:0},{roles:2},{parents:0},{parents:2},{parentId:'foreign'}])(
  'refuses missing/ambiguous authority or changed parent (%j)',async options=>{
   await expect(admissionHarness(options).run()).rejects.toThrow();
  });
 it('does not query a database when native custody or the admitted plan changes',async()=>{
  const h=admissionHarness({claimError:true});await expect(h.run()).rejects.toThrow('Claim changed');expect(h.query).not.toHaveBeenCalled();
  const next=admissionHarness();await expect(next.run({...next.plan,originalDays:['2026-10-01','2026-10-01']})).rejects.toThrow('plan changed');
  expect(next.verify).not.toHaveBeenCalled();expect(next.query).not.toHaveBeenCalled();
 });
 it('propagates SQL failure without retry or a replacement session',async()=>{
  const h=admissionHarness();h.query.mockRejectedValueOnce(new Error('Catalog unavailable'));
  await expect(h.run()).rejects.toThrow('Catalog unavailable');expect(h.query).toHaveBeenCalledTimes(1);
 });
});
