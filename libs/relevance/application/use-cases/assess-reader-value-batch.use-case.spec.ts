import { AssessReaderValueBatchUseCase } from './assess-reader-value-batch.use-case';
import { assessmentClaim, scoringSuccess } from './assess-reader-value-batch.spec-support';
import type { ReaderValueScoringOutcome } from '../contracts/reader-value-assessment-store';

function fixture() {
  const claim=assessmentClaim();
  const store={
    claim:jest.fn().mockResolvedValueOnce(claim).mockResolvedValue(null),authorizeDispatch:jest.fn().mockResolvedValue(true),
    complete:jest.fn().mockResolvedValue(true),findExact:jest.fn().mockResolvedValue(claim),recoverExpiredLeases:jest.fn().mockResolvedValue(0),
  };
  const scorer={score:jest.fn().mockResolvedValue(scoringSuccess())};
  const batch=new AssessReaderValueBatchUseCase(store,scorer,{generate:()=> 'lease'});
  const command={tenantId:'tenant',workspaceId:'workspace',modelConfigVersion:'fixture.v1',limit:100,pinnedOnly:false};
  return {claim,store,scorer,batch,command};
}
describe('reader-value batch dispatch',()=>{
  it('rereads a committed success after lost acknowledgement, without new HTTP',async()=>{
    const f=fixture();
    f.store.complete.mockRejectedValueOnce(new Error('lost acknowledgement'));
    f.store.findExact.mockResolvedValue({...f.claim,state:'assessed'});
    expect(await f.batch.execute(f.command)).toMatchObject({ok:true,value:{dispatched:1,assessed:1,recoveredAcknowledgements:1}});
    expect(f.scorer.score).toHaveBeenCalledTimes(1); expect(f.store.complete).toHaveBeenCalledTimes(1);
  });
  it('retries persistence of the same response after a proven uncommitted write',async()=>{
    const f=fixture();
    f.store.complete.mockRejectedValueOnce(new Error('write not committed'));
    expect((await f.batch.execute(f.command)).ok).toBe(true);
    expect(f.scorer.score).toHaveBeenCalledTimes(1); expect(f.store.complete).toHaveBeenCalledTimes(2);
    expect(f.store.complete.mock.calls[0]?.[1]).toBe(f.store.complete.mock.calls[1]?.[1]);
  });
  it('bounds unknown database outcome retries without turning them into more provider dispatches',async()=>{
    const f=fixture(); f.store.complete.mockRejectedValue(new Error('unavailable')); f.store.findExact.mockRejectedValue(new Error('unavailable'));
    expect(await f.batch.execute(f.command)).toMatchObject({ok:false,error:'persistence_unavailable',diagnostics:{dispatched:1,unknownUsage:1}});
    expect(f.scorer.score).toHaveBeenCalledTimes(1); expect(f.store.complete).toHaveBeenCalledTimes(3);
  });
  it.each(['auth_paused','schema_invalid','model_version_changed'] as const)('keeps %s paused until restart',async(code)=>{
    const f=fixture(); f.scorer.score.mockResolvedValue({ok:false,failure:{code,retryable:code==='auth_paused',pauseDispatch:true,usageUnknown:true}});
    expect(await f.batch.execute(f.command)).toMatchObject({ok:true,value:{paused:true,dispatched:1,fatalFailureCode:code,failed:1,unknownUsage:1}});
    expect(await f.batch.execute(f.command)).toMatchObject({ok:true,value:{paused:true,dispatched:0,fatalFailureCode:code}});
    expect(f.scorer.score).toHaveBeenCalledTimes(1);
  });
  it('uses exactly two simultaneous requests and rejects overlapping ticks',async()=>{
    const f=fixture(); let release!: (outcome:ReaderValueScoringOutcome)=>void;
    const pending=new Promise<ReaderValueScoringOutcome>((resolve)=>{release=resolve;});
    f.store.claim.mockReset().mockResolvedValueOnce(assessmentClaim('one')).mockResolvedValueOnce(assessmentClaim('two')).mockResolvedValue(null);
    f.scorer.score.mockReturnValue(pending);
    const running=f.batch.execute(f.command);
    for(let i=0;i<10;i+=1) await Promise.resolve();
    expect(f.scorer.score).toHaveBeenCalledTimes(2);
    expect(await f.batch.execute(f.command)).toEqual({ok:false,error:'batch_busy'});
    release(scoringSuccess()); expect((await running).ok).toBe(true);
  });
  it('never sends a response for a revoked lease and preserves bounded rollback drain',async()=>{
    const f=fixture(); f.store.authorizeDispatch.mockResolvedValue(false);
    await f.batch.execute({...f.command,pinnedOnly:true});
    expect(f.scorer.score).not.toHaveBeenCalled();
    expect(f.store.claim).toHaveBeenCalledWith(expect.anything(),'fixture.v1','lease',true);
  });
  it('discards a late response when another lease owns the row',async()=>{
    const f=fixture(); f.store.complete.mockResolvedValue(false); f.store.findExact.mockResolvedValue({...f.claim,leaseToken:'new-lease'});
    expect(await f.batch.execute(f.command)).toMatchObject({ok:true,value:{discarded:1}});
    expect(f.store.complete).toHaveBeenCalledTimes(1);
  });
});
