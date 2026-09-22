import { err, ok, type Result } from '@social-monitor/shared-kernel';
import type { ReaderValueMaintenanceScopes } from '../contracts/reader-value-maintenance-scopes';
import type { ReaderValueAssessmentStore, ReaderValueCleanupPolicy, ReaderValueCleanupResult,
  ReaderValueDiscoveryScope } from '../contracts/reader-value-assessment-store';

/** Independent of scoring mode and fatal provider pause. One scope, at most 100 rows per tick. */
export class CleanupReaderValueCacheUseCase {
  private cursor: ReaderValueDiscoveryScope | undefined;
  private busy = false;
  constructor(private readonly scopes: ReaderValueMaintenanceScopes,
    private readonly store: Pick<ReaderValueAssessmentStore, 'cleanup'>, private readonly policy: ReaderValueCleanupPolicy) {}

  async execute(): Promise<Result<ReaderValueCleanupResult, 'cleanup_busy' | 'persistence_unavailable'>> {
    if (this.busy) return err('cleanup_busy');
    this.busy = true;
    try {
      const scope = await this.scopes.next(this.cursor) ?? (this.cursor ? await this.scopes.next(undefined) : null);
      if (!scope) {
        this.cursor = undefined;
        return ok({ deleted: 0, deferredActiveJob: 0, deferredHold: 0, deferredUnknownPolicy: 0 });
      }
      const result = await this.store.cleanup(scope, this.policy);
      this.cursor = scope;
      return ok(result);
    } catch { return err('persistence_unavailable'); }
    finally { this.busy = false; }
  }
}
