import type { ReaderValueAssessmentStore, ReaderValueDiscoveryScope } from '../contracts/reader-value-assessment-store';
import type { ReaderValueDiscoveryScopes, ReaderValueMaintenanceScopes } from '../contracts/reader-value-maintenance-scopes';
import type { ReaderValueFailureCode } from '../../domain/reader-value/reader-value-failure';
import type { AssessReaderValueBatchUseCase } from './assess-reader-value-batch.use-case';
import type { DiscoverReaderValueBatchUseCase } from './discover-reader-value-batch.use-case';

export type ReaderValueTickHealth = 'ok' | 'provider_paused' | 'configuration_invalid' | 'persistence_unavailable';
/** Operational fields only; no input, scope identifiers, or provider payloads. */
export type ReaderValueTickResult = {
  readonly health: ReaderValueTickHealth;
  readonly fatalFailureCode: ReaderValueFailureCode | 'persistence_unavailable' | null;
  readonly discovered: number; readonly retained: number; readonly assessedCacheHits: number;
  readonly invalidInput: number; readonly unsupportedKind: number; readonly emptyInput: number; readonly unsafeSource: number; readonly unavailable: number;
  readonly completedSweeps: number; readonly sweepDurationMs: number;
  readonly dispatched: number; readonly assessed: number; readonly failed: number; readonly retries: number;
  readonly unknownUsage: number; readonly discarded: number; readonly recoveredAcknowledgements: number;
  /** Maximum pending age across maintenance scopes visited by this bounded tick. */
  readonly backlogAgeMs: number;
};
export class RunReaderValueTickUseCase {
  private cursor: ReaderValueDiscoveryScope | undefined;
  private discoveryCursor: ReaderValueDiscoveryScope | undefined;
  constructor(private readonly discovery: DiscoverReaderValueBatchUseCase,
    private readonly assessment: AssessReaderValueBatchUseCase, private readonly scopes: ReaderValueMaintenanceScopes,
    private readonly options: { readonly discoveryScopes: readonly ReaderValueDiscoveryScope[]; readonly backfillFrom: string | null;
      readonly modelConfigVersion: string; readonly pinnedOnly: boolean; readonly discoverAllActiveScopes?: boolean },
    private readonly store: Pick<ReaderValueAssessmentStore, 'backlogAgeMs'>,
    private readonly discoveryScopes?: ReaderValueDiscoveryScopes) {}

  async execute(): Promise<ReaderValueTickResult> {
    const counts = { discovered: 0, retained: 0, assessedCacheHits: 0, unsupportedKind: 0, emptyInput: 0, invalidInput: 0,
      unsafeSource: 0, unavailable: 0, completedSweeps: 0, sweepDurationMs: 0, dispatched: 0, assessed: 0,
      failed: 0, retries: 0, unknownUsage: 0, discarded: 0, recoveredAcknowledgements: 0, backlogAgeMs: 0 };
    const result = (health: ReaderValueTickHealth, fatalFailureCode: ReaderValueTickResult['fatalFailureCode'] = null): ReaderValueTickResult =>
      ({ ...counts, health, fatalFailureCode });
    if (this.assessment.isPaused()) return result('provider_paused', this.assessment.pauseCode());
    let discoveryFailure: 'configuration_invalid' | 'persistence_unavailable' | null = null;
    try {
      if (this.options.backfillFrom !== null) {
        if (this.options.discoverAllActiveScopes && !this.discoveryScopes) {
          discoveryFailure = 'configuration_invalid';
        } else {
          let selectedScopes: readonly ReaderValueDiscoveryScope[] | null = null;
          try {
            const scopes = this.options.discoverAllActiveScopes
              ? await this.discoveryScopes!.nextDiscoverable(this.discoveryCursor,
                this.options.backfillFrom, 1)
              : this.options.discoveryScopes;
            selectedScopes = scopes;
            if (this.options.discoverAllActiveScopes && scopes.length > 1) {
              discoveryFailure = 'persistence_unavailable';
            } else {
              const discovered = await this.discovery.execute({ scopes, backfillFrom: this.options.backfillFrom });
              const diagnostics = discovered.ok ? discovered.value : discovered.diagnostics;
              if (diagnostics) Object.assign(counts, diagnostics);
              if (!discovered.ok) {
                discoveryFailure = discovered.error === 'configuration_invalid'
                  ? 'configuration_invalid' : 'persistence_unavailable';
              }
              if (this.options.discoverAllActiveScopes &&
                  (discovered.ok || discovered.error === 'persistence_unavailable')) {
                // Keep the failed scope's item cursor for its next turn, but do
                // not let one oversized or unavailable source starve the rest.
                this.discoveryCursor = scopes[0];
              }
            }
          } catch {
            discoveryFailure = 'persistence_unavailable';
            if (this.options.discoverAllActiveScopes && selectedScopes?.length === 1) {
              this.discoveryCursor = selectedScopes[0];
            }
          }
        }
      }
      // Four scopes, 25 reservations each; persistent rows, disposable fair cursor.
      for (let page = 0; page < 4; page += 1) {
        const scope = await this.scopes.next(this.cursor);
        if (!scope) { this.cursor = undefined; break; }
        this.cursor = scope;
        const allowed = this.options.discoverAllActiveScopes || this.options.discoveryScopes.some((item) => item.tenantId === scope.tenantId &&
          item.workspaceId === scope.workspaceId && item.interestId === scope.interestId);
        const pinnedOnly = this.options.pinnedOnly || !allowed;
        counts.backlogAgeMs = Math.max(counts.backlogAgeMs, await this.store.backlogAgeMs(scope, this.options.modelConfigVersion, pinnedOnly));
        const assessed = await this.assessment.execute({ ...scope, modelConfigVersion: this.options.modelConfigVersion, limit: 25, pinnedOnly });
        const diagnostics = assessed.ok ? assessed.value : assessed.diagnostics;
        if (diagnostics) {
          for (const key of ['dispatched','assessed','failed','retries','unknownUsage','discarded','recoveredAcknowledgements'] as const) {
            counts[key] += diagnostics[key];
          }
        }
        if (!assessed.ok) return result('persistence_unavailable', diagnostics?.fatalFailureCode ?? 'persistence_unavailable');
        if (assessed.value.paused) return result('provider_paused', assessed.value.fatalFailureCode);
      }
      return result(discoveryFailure ?? 'ok', discoveryFailure);
    } catch { return result('persistence_unavailable', 'persistence_unavailable'); }
  }
}
