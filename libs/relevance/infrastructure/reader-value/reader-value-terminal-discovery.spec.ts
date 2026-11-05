import { SourceContentSafetyPolicy } from '../../domain/source-content-safety';
import { ConservativeReaderValueInputBuilder } from './reader-value-input-builder';
import { fixtureSource } from './reader-value-input-builder.spec-support';
import { OpenRouterReaderValueScorer } from './openrouter-reader-value-scorer';
import { DiscoverReaderValueBatchUseCase } from '../../application/use-cases/discover-reader-value-batch.use-case';
import { AssessReaderValueBatchUseCase } from '../../application/use-cases/assess-reader-value-batch.use-case';
import { RunReaderValueTickUseCase } from '../../application/use-cases/run-reader-value-tick.use-case';
import { assessmentClaim, scoringSuccess } from '../../application/use-cases/assess-reader-value-batch.spec-support';
import type { ReaderValueAssessment, ReaderValueAssessmentStore } from '../../application/contracts/reader-value-assessment-store';
import type { ReaderValueInventoryItem } from '../../application/contracts/reader-value-inventory';

const clock = { now: () => new Date('2026-09-20T00:00:00Z') };
const builder = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy());
const prepare = (patch: Partial<typeof fixtureSource> = {}) => {
  const result = builder.prepare({...fixtureSource,...patch},'revision');
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe('durable terminal reader-value discovery contract', () => {
  it.each(['', 'я'.repeat(30_000)])('isolates invalid interest without retaining oversized text', (interest) => {
    const input = prepare({interest});
    expect(input.terminalFailure).toBe('configuration_invalid');
    expect(input.snapshot.interest).toBe('');
    expect(input.snapshot.sentTitleLength).toBe(0);
    expect(input.snapshot.sentBodyLength).toBe(0);
    expect(Buffer.byteLength(input.requestBody)).toBeLessThan(1000);
    expect(input.interestSha256).not.toBe(prepare({interest:interest+'x'}).interestSha256);
    expect(input.inputSha256).not.toBe(prepare({interest:interest+'x'}).inputSha256);
    expect(prepare({interest})).toEqual(input);
  });

  it('binds empty diagnostics to exact source, interest, rubric and model identities', () => {
    const input = prepare({title:'',body:''});
    expect(input.terminalFailure).toBe('empty_input');
    expect(input.snapshot.safety).toBe('blocked');
    expect(input.sourceSnapshotSha256).not.toBe(prepare({title:' ',body:''}).sourceSnapshotSha256);
    expect(input.inputSha256).not.toBe(prepare({title:'',body:'',interest:'Changed'}).inputSha256);
    expect(input.rubricSha256).toHaveLength(64);
    expect(prepare({title:'',body:''})).toEqual(input);
    expect(prepare({title:'',body:'Now useful'}).terminalFailure).toBeUndefined();
  });

  it('never dispatches a diagnostic envelope even if passed directly to the HTTP adapter', async () => {
    const transport = jest.fn();
    const scorer = new OpenRouterReaderValueScorer('fixture-only',clock,transport);
    for (const input of [prepare({interest:''}),prepare({title:'',body:''})]) {
      expect(await scorer.score(input)).toMatchObject({ok:false,failure:{code:input.terminalFailure,
        retryable:false,pauseDispatch:false,usageUnknown:false}});
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('advances invalid/empty rows and processes healthy discovery plus queued work on the same tick and after restart', async () => {
    const rows: ReaderValueInventoryItem[] = [
      {interest:'я'.repeat(30_000)},
      {title:'',body:''},
      {},
    ].map((patch,index) => ({cursor:{publishedAt:'2026-09-10T00:00:00Z',feedItemId:String(index)},
      sourceBindingId:`binding-${index}`,observedAt:'2026-09-10T00:00:01.000000Z',
      sourceUpdatedAt:'2026-09-10T00:00:00.000000Z',
      source:{...fixtureSource,...patch},sourceRevisionKey:'revision',metadata:{kind:'rss_item'}}));
    const saved = new Map<string,ReaderValueAssessment>();
    const store: ReaderValueAssessmentStore = {
      ensure:async (id,input) => {
        const key = JSON.stringify([input.interestId,input.sourceItemId,input.sourceSnapshotSha256,input.inputSha256]);
        if (!saved.has(key)) saved.set(key,{...assessmentClaim(id),input,attempts:0,leaseToken:null,
          state:input.terminalFailure ? 'permanent_failed' : 'pending',errorCode:input.terminalFailure ?? null});
        return saved.get(key)!;
      },
      claim:async (_scope,_config,leaseToken) => {
        for (const [key,row] of saved) if (row.state === 'pending') {
          const claim = {...row,state:'running' as const,attempts:1,leaseToken}; saved.set(key,claim); return claim;
        }
        return null;
      },
      authorizeDispatch:async () => true,
      complete:async (claim) => {
        for (const [key,row] of saved) if (row.id === claim.id) saved.set(key,{...row,state:'assessed'});
        return true;
      },
      recoverExpiredLeases:async () => 0, backlogAgeMs:async () => 0,
      findExact:async (_scope,id) => [...saved.values()].find((row) => row.id === id) ?? null,
      read:async () => [], pin:async () => false,
      cleanup:async () => ({deleted:0,deferredActiveJob:0,deferredHold:0,deferredUnknownPolicy:0}),
    };
    let ordinal=0;
    const ids = {generate:() => String(++ordinal)};
    await store.ensure(ids.generate(),prepare({body:'queued'}));
    const score = jest.fn(async () => scoringSuccess());
    const restart = () => new RunReaderValueTickUseCase(new DiscoverReaderValueBatchUseCase({page:async (_scope,_from,cursor,limit) =>
      rows.slice(cursor ? Number(cursor.feedItemId)+1 : 0,(cursor ? Number(cursor.feedItemId)+1 : 0)+limit)},builder,store,ids,clock),
    new AssessReaderValueBatchUseCase(store,{score},ids),{next:async (cursor) => cursor ? null : fixtureSource},
    {discoveryScopes:[fixtureSource],backfillFrom:'2026-09-01T00:00:00Z',modelConfigVersion:prepare().modelConfigVersion,pinnedOnly:false},store);
    const runner = restart();
    expect(await runner.execute()).toMatchObject({health:'ok',discovered:3,invalidInput:1,emptyInput:1,dispatched:2,assessed:2});
    for (const tick of [runner,runner,restart()]) {
      expect(await tick.execute()).toMatchObject({health:'ok',discovered:3,invalidInput:1,emptyInput:1,dispatched:0});
    }
    expect(saved.size).toBe(4);
    expect(score).toHaveBeenCalledTimes(2);
    for (const row of saved.values()) if (row.input.terminalFailure) {
      expect(row.state).toBe('permanent_failed'); expect(row.attempts).toBe(0);
    }
  });
});
