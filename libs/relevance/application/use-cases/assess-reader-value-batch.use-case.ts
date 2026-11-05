import type { ReaderValueFailureCode } from '../../domain/reader-value/reader-value-failure';
import { err, ok, type IdGenerator, type Result } from '@social-monitor/shared-kernel';
import type { ReaderValueAssessment, ReaderValueAssessmentStore, ReaderValueScorer, ReaderValueScope, ReaderValueScoringOutcome } from '../contracts/reader-value-assessment-store';

export type AssessReaderValueBatchCommand=ReaderValueScope & {
  readonly modelConfigVersion:string;
  readonly limit:number;
  /** Legacy rollback drains only durable active manifest pins. */
  readonly pinnedOnly:boolean;
};
export type AssessReaderValueBatchResult={
  readonly dispatched:number;
  readonly assessed:number;
  readonly failed:number;
  readonly discarded:number;
  readonly recoveredAcknowledgements:number;
  readonly paused:boolean;
  readonly fatalFailureCode:ReaderValueFailureCode|null;
  readonly retries:number;
  readonly unknownUsage:number;
};
type BatchStore=Pick<ReaderValueAssessmentStore,'claim'|'authorizeDispatch'|'complete'|'findExact'|'recoverExpiredLeases'>;

export class AssessReaderValueBatchUseCase {
  private paused=false;
  private fatalFailureCode:ReaderValueFailureCode|null=null;
  private busy=false;
  constructor(private readonly store:BatchStore,private readonly scorer:ReaderValueScorer,private readonly ids:IdGenerator) {}

  isPaused(): boolean { return this.paused; }
  pauseCode(): ReaderValueFailureCode|null { return this.fatalFailureCode; }

  async execute(command:AssessReaderValueBatchCommand):Promise<Result<AssessReaderValueBatchResult,
    'invalid_batch_limit'|'batch_busy'|'persistence_unavailable'> & {readonly diagnostics?:AssessReaderValueBatchResult}> {
    if (!Number.isInteger(command.limit)||command.limit<1||command.limit>100) return err('invalid_batch_limit');
    if (this.busy) return err('batch_busy');
    const counts={dispatched:0,assessed:0,failed:0,discarded:0,recoveredAcknowledgements:0,retries:0,unknownUsage:0};
    const diagnostics=()=>({...counts,paused:this.paused,fatalFailureCode:this.fatalFailureCode});
    const failed=()=>({...err('persistence_unavailable' as const),diagnostics:diagnostics()});
    if (this.paused) return ok(diagnostics());
    this.busy=true;
    let reservations=0;
    let storageFailed=false;
    const processNext=async () => {
      while (!this.paused&&!storageFailed&&reservations<command.limit) {
        reservations+=1;
        try {
          const claim=await this.store.claim(command,command.modelConfigVersion,this.ids.generate(),command.pinnedOnly);
          if (!claim) return;
          // A concurrent fatal response can arrive while this reservation is in flight.
          if (this.paused||storageFailed) return;
          if (!await this.store.authorizeDispatch(claim, command.pinnedOnly)) { counts.discarded+=1; continue; }
          if (this.paused||storageFailed) return;
          counts.dispatched+=1;
          if (claim.attempts>1) counts.retries+=1;
          const outcome=await this.score(claim);
          if (outcome.ok ? outcome.execution.usageUnknown : outcome.failure.usageUnknown) counts.unknownUsage+=1;
          if (!outcome.ok&&outcome.failure.pauseDispatch) {
            this.paused=true; this.fatalFailureCode ??= outcome.failure.code;
          }
          const saved=await this.saveWithoutRedispatch(claim,outcome);
          if (saved==='discarded') counts.discarded+=1;
          else {
            if (saved==='reread') counts.recoveredAcknowledgements+=1;
            if (outcome.ok) counts.assessed+=1; else counts.failed+=1;
          }
        } catch { storageFailed=true; }
      }
    };
    try {
      await this.store.recoverExpiredLeases(command);
      // Exactly two dispatch slots per singleton worker; HTTP is outside every DB transaction.
      await Promise.all([processNext(),processNext()]);
      return storageFailed ? failed() : ok(diagnostics());
    } catch { return failed(); }
    finally { this.busy=false; }
  }

  private async score(claim:ReaderValueAssessment):Promise<ReaderValueScoringOutcome> {
    try { return await this.scorer.score(claim.input); }
    catch { return {ok:false,failure:{code:'transport',retryable:true,pauseDispatch:false,usageUnknown:true}}; }
  }

  private async saveWithoutRedispatch(claim:ReaderValueAssessment,outcome:ReaderValueScoringOutcome):Promise<'saved'|'reread'|'discarded'> {
    for (let attempt=0;attempt<3;attempt+=1) {
      let acknowledgementUnknown=false;
      try { if (await this.store.complete(claim,outcome)) return 'saved'; }
      catch { acknowledgementUnknown=true; }
      try {
        const row=await this.store.findExact(claim.input,claim.id);
        if (!row) return 'discarded';
        if (row.state==='assessed'||(row.leaseToken===claim.leaseToken&&row.state!=='running')) return 'reread';
        if (row.leaseToken!==claim.leaseToken) return 'discarded';
        if (!acknowledgementUnknown) return 'discarded';
      } catch { /* Bounded storage retry only. Never spend another HTTP call here. */ }
    }
    throw new Error('Assessment persistence acknowledgement unavailable');
  }
}
