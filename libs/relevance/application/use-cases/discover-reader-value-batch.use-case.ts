import { err, ok, type IdGenerator, type Clock, type Result } from '@social-monitor/shared-kernel';
import { classifyReaderValueSourceKind } from '../../domain/reader-value/reader-value-source-kind';
import type { ReaderValueAssessmentStore, ReaderValueDiscoveryScope } from '../contracts/reader-value-assessment-store';
import type { ReaderValueInputBuilder, ReaderValueInventory, ReaderValueInventoryCursor } from '../contracts/reader-value-inventory';

export type DiscoverReaderValueResult = {
  readonly discovered: number;
  readonly retained: number;
  readonly assessedCacheHits: number;
  readonly unsupportedKind: number;
  readonly emptyInput: number;
  readonly invalidInput: number;
  readonly unsafeSource: number;
  readonly unavailable: number;
  readonly completedSweeps: number;
  readonly sweepDurationMs: number;
};

/** Cursors are disposable: restarting rescans; durable exact keys prevent another paid call. */
export class DiscoverReaderValueBatchUseCase {
  private readonly cursors = new Map<string, ReaderValueInventoryCursor>();
  private readonly sweepStarted = new Map<string, number>();
  private scopePosition = 0;
  private busy = false;

  constructor(private readonly inventory: ReaderValueInventory, private readonly builder: ReaderValueInputBuilder,
    private readonly store: Pick<ReaderValueAssessmentStore, 'ensure'>, private readonly ids: IdGenerator, private readonly clock: Clock) {}

  async execute(command: { readonly scopes: readonly ReaderValueDiscoveryScope[]; readonly backfillFrom: string }): Promise<
    Result<DiscoverReaderValueResult, 'discovery_busy' | 'configuration_invalid' | 'persistence_unavailable'> &
    { readonly diagnostics?: DiscoverReaderValueResult }> {
    if (this.busy) return err('discovery_busy');
    if (!Number.isFinite(Date.parse(command.backfillFrom))) return err('configuration_invalid');
    const counts: DiscoverReaderValueResult = { discovered: 0, retained: 0, assessedCacheHits: 0,
      unsupportedKind: 0, emptyInput: 0, invalidInput: 0, unsafeSource: 0, unavailable: 0, completedSweeps: 0, sweepDurationMs: 0 };
    const result = { ...counts };
    const failed = (code: 'configuration_invalid' | 'persistence_unavailable') => ({ ...err(code), diagnostics: result });
    const scopes = command.scopes.filter((scope, index, all) => all.findIndex((other) =>
      other.tenantId === scope.tenantId && other.workspaceId === scope.workspaceId &&
      other.interestId === scope.interestId) === index);
    if (scopes.length === 0) return ok(result);
    const finished = new Set<string>();
    this.busy = true;
    try {
      while (result.discovered < 100 && finished.size < scopes.length) {
        const scope = scopes[this.scopePosition % scopes.length]!;
        this.scopePosition = (this.scopePosition + 1) % scopes.length;
        const key = `${scope.tenantId}/${scope.workspaceId}/${scope.interestId}/${command.backfillFrom}`;
        if (finished.has(key)) continue;
        if (!this.sweepStarted.has(key)) this.sweepStarted.set(key, this.clock.now().getTime());
        const limit = Math.min(25, 100 - result.discovered);
        const rows = await this.inventory.page(scope, command.backfillFrom, this.cursors.get(key), limit);
        if (rows.length > limit) return failed('persistence_unavailable');
        for (const row of rows) {
          if (row.source.tenantId !== scope.tenantId || row.source.workspaceId !== scope.workspaceId ||
              row.source.interestId !== scope.interestId) {
            return failed('persistence_unavailable');
          }
          // Advance only after each deterministic exclusion or durable insert succeeds.
          // A storage failure retries this exact row on the next tick.
          if (!classifyReaderValueSourceKind(row.source.providerKey, row.metadata).supported) result.unsupportedKind += 1;
          else {
            const prepared = this.builder.prepare(row.source, row.sourceRevisionKey);
            if (!prepared.ok) {
              result.unsafeSource += 1;
            } else {
              if (prepared.value.terminalFailure === 'empty_input') result.emptyInput += 1;
              if (prepared.value.terminalFailure === 'configuration_invalid') result.invalidInput += 1;
              const retained = await this.store.ensure(this.ids.generate(), prepared.value);
              if (retained === null) result.unavailable += 1;
              else {
                result.retained += 1;
                if (retained.state === 'assessed') result.assessedCacheHits += 1;
              }
            }
          }
          result.discovered += 1;
          this.cursors.set(key, row.cursor);
        }
        if (rows.length < limit) {
          this.cursors.delete(key);
          finished.add(key);
          result.completedSweeps += 1;
          result.sweepDurationMs = Math.max(result.sweepDurationMs, this.clock.now().getTime() - this.sweepStarted.get(key)!);
          this.sweepStarted.delete(key);
        }
      }
      return ok(result);
    } catch { return failed('persistence_unavailable'); }
    finally { this.busy = false; }
  }
}
