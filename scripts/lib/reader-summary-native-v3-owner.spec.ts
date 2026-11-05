import { ExecuteReaderSummaryJobUseCase } from '@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case';
import { readerSummaryPromotionControl, NOOP_READER_SUMMARY_PROMOTION_METRICS } from '@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control';
import { FixedClock, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ReaderSummaryJob, resolveReaderSummaryPeriod } from '@social-monitor/summary/domain';
import { InMemoryReaderSummaryJobRepository } from '@social-monitor/summary/adapters/persistence/in-memory-reader-summary-job.repository';
import { RequestReaderSummaryUseCase } from '@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case';
import { executeNativeReaderSummary, nativeV3Owner } from './reader-summary-native-v3-owner';

const at = new Date('2026-10-15T08:15:00.000Z');
const tenant = tenantId('TEST-tenant'); const workspace = workspaceId('TEST-workspace');
const owner = () => nativeV3Owner({ argv: ['--native-jev-v3'], legacyKey: 'durable-reader-summary-daily:'+'a'.repeat(64),
  tenantId: tenant, workspaceId: workspace, cutoff: at, now: at, specialMode: false,
  budget: String(7_000_000) })!;
const job = () => ReaderSummaryJob.request({ id: 'TEST-job', tenantId: tenant, workspaceId: workspace,
  scope: { type: 'workspace' }, period: resolveReaderSummaryPeriod({ cadence: 'daily', now: at }),
  requestedAt: at, idempotencyKey: owner().idempotencyKey, selectionStrategy: 'jev_primary_v3',
  preparationCutoffAt: owner().cutoffAt, preparationDeadlineAt: owner().preparationDeadlineAt });
const command = { tenantId: tenant, workspaceId: workspace, readerSummaryJobId: 'TEST-job' };

describe('Native V3 ownership', () => {
  it('preserves original cutoff microseconds without substituting request time', () => {
    const cutoff='2026-10-15T08:15:00.123456Z';
    const value=nativeV3Owner({argv:['--native-jev-v3'],legacyKey:'durable-reader-summary-daily:'+'a'.repeat(64),
      tenantId:tenant,workspaceId:workspace,cutoff:new Date(cutoff),exactCutoffAt:cutoff,
      now:new Date('2026-10-15T08:15:01Z'),specialMode:false,budget:String(7_000_000)});
    expect(value?.cutoffAt).toBe(cutoff);
  });

  it('default execution refuses native work before preflight or model access', async () => {
    const jobs=new InMemoryReaderSummaryJobRepository();await jobs.save(job());
    const forbidden=<T>():T=>new Proxy({}, {get(){throw new Error('Unexpected dependency access');}}) as T;
    const execute=new ExecuteReaderSummaryJobUseCase(jobs,forbidden(),forbidden(),forbidden(),forbidden(),forbidden(),
      {generate:()=> 'TEST-unused'},new FixedClock(at),readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS));
    expect(await execute.execute(command)).toMatchObject({ok:false,error:{code:'operation.conflict'}});
  });
  it('retains seeded source cutoff and deadline against preflight substitution', () => {
    const params={strategy:'jev_primary_v3' as const,config:{schemaVersion:'reader_summary_preparation_config.v2' as const,interests:[]},
      cutoffAt:owner().cutoffAt,deadlineAt:owner().preparationDeadlineAt,nextCheckAt:at};
    expect(job().freezePreparation(params).toSnapshot().preparationCutoffAt).toBe(owner().cutoffAt);
    expect(()=>job().freezePreparation({...params,cutoffAt:'2026-10-15T08:14:59.000000Z'})).toThrow('immutable');
    expect(()=>job().freezePreparation({...params,deadlineAt:'2026-10-15T08:29:59.000000Z'})).toThrow('immutable');
    expect(ReaderSummaryJob.rehydrate({...job().toSnapshot(),selectionStrategy:'legacy_v2',idempotencyKey:'durable-reader-summary-daily:'+'a'.repeat(64)}).toSnapshot().selectionStrategy).toBe('legacy_v2');
  });

  it('validates finite owner shape and leaves legacy opt-out unchanged', () => {
    const params = { argv:['--native-jev-v3'], legacyKey:'durable-reader-summary-daily:'+'a'.repeat(64), tenantId:tenant,
      workspaceId:workspace, now:at, cutoff:at, specialMode:false, budget:'420000' };
    // Shape validation is separate from the configured task-graph subtotal gate.
    expect(nativeV3Owner(params)).toBeDefined();
    expect(nativeV3Owner({ ...params, argv:[] })).toBeUndefined();
  });
  it('does not enqueue native V3, preserves UUID and excludes both ordinary pollers', async () => {
    const jobs = new InMemoryReaderSummaryJobRepository();
    const queue = { canAccept: jest.fn(async()=>true), enqueue:jest.fn(async()=>undefined) };
    const request = new RequestReaderSummaryUseCase(jobs,queue,{reserveSummaryJob:async()=>ok({remaining:100,resetAt:at.toISOString()})},
      {generate:()=> 'TEST-job'},new FixedClock(at),undefined,owner());
    const input = {tenantId:tenant,workspaceId:workspace,scope:{type:'workspace' as const},cadence:'daily' as const,
      idempotencyKey:owner().idempotencyKey,correlationId:'TEST-correlation'};
    expect((await request.execute(input)).ok).toBe(true);
    expect(await request.execute(input)).toMatchObject({ok:true,value:{readerSummaryJobId:'TEST-job',created:false}});
    expect(queue.canAccept).not.toHaveBeenCalled();expect(queue.enqueue).not.toHaveBeenCalled();
    expect(await jobs.findRequested({limit:10})).toEqual([]);
    expect(await jobs.findDueForPolling({now:at,staleRunningStartedBefore:at,limit:10})).toEqual([]);
    const publicRequest = new RequestReaderSummaryUseCase(jobs,queue,{reserveSummaryJob:async()=>ok({remaining:100,resetAt:at.toISOString()})},
      {generate:()=> 'other'},new FixedClock(at));
    expect(await publicRequest.execute(input)).toMatchObject({ok:false,error:{code:'operation.conflict'}});
  });
  it('advances same UUID only after persisted requested next-check and requires artifact', async () => {
    const jobs=new InMemoryReaderSummaryJobRepository();await jobs.save(job());
    let elapsed=0;const clock={now:()=>new Date(at.getTime()+elapsed)};let calls=0;
    const execute=jest.fn(async()=> {
      calls++;
      if(calls===1){await jobs.save(ReaderSummaryJob.rehydrate({...job().toSnapshot(),preparationNextCheckAt:new Date(at.getTime()+1000)}));return ok({readerSummaryJobId:'TEST-job',status:'requested' as const});}
      return ok({readerSummaryJobId:'TEST-job',status:'completed' as const,readerSummaryId:'TEST-artifact'});
    });
    const result=await executeNativeReaderSummary({owner:owner(),jobs,command,clock,execute:{execute},sleep:async()=>{elapsed+=1000;}});
    expect(result).toMatchObject({ok:true,value:{readerSummaryId:'TEST-artifact'}});
    expect(execute.mock.calls).toHaveLength(2);
  });
  it('does not advance before a persisted next-check beyond one polling interval', async () => {
    const jobs=new InMemoryReaderSummaryJobRepository();
    await jobs.save(ReaderSummaryJob.rehydrate({...job().toSnapshot(),preparationNextCheckAt:new Date(at.getTime()+25_000)}));
    let elapsed=0;const waits:number[]=[];
    const execute=jest.fn(async()=>{expect(elapsed).toBe(25_000);return ok({readerSummaryJobId:'TEST-job',status:'completed' as const,readerSummaryId:'TEST-artifact'});});
    await executeNativeReaderSummary({owner:owner(),jobs,command,clock:{now:()=>new Date(at.getTime()+elapsed)},
      execute:{execute},sleep:async ms=>{waits.push(ms);elapsed+=ms;}});
    expect(waits).toEqual([10_000,10_000,5_000]);expect(execute).toHaveBeenCalledTimes(1);
  });
  it('never executes requested work at the preparation deadline with due or missing next-check', async () => {
    for(const next of [undefined,at]) {
      const jobs=new InMemoryReaderSummaryJobRepository();
      await jobs.save(ReaderSummaryJob.rehydrate({...job().toSnapshot(),preparationNextCheckAt:next}));
      const execute=jest.fn();
      await expect(executeNativeReaderSummary({owner:owner(),jobs,command,clock:{now:()=>new Date(owner().preparationDeadlineAt)},execute:{execute}})).rejects.toThrow('deadline');
      expect(execute).not.toHaveBeenCalled();
    }
  });
  it('rejects silent missing-artifact, terminal and unpersisted defer without retry', async () => {
    for(const status of ['completed','failed','running','requested'] as const){
      const jobs=new InMemoryReaderSummaryJobRepository();await jobs.save(job());
      const execute=jest.fn(async()=>ok({readerSummaryJobId:'TEST-job',status}));
      await expect(executeNativeReaderSummary({owner:owner(),jobs,command,clock:new FixedClock(at),execute:{execute}})).rejects.toThrow();
      expect(execute).toHaveBeenCalledTimes(1);
    }
  });
});
