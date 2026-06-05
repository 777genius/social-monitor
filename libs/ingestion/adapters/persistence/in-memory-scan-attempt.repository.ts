import type { ScanAttempt } from '../../domain';
import type { FindScanAttemptQuery, ScanAttemptRepositoryPort } from '../../ports';

export class InMemoryScanAttemptRepository implements ScanAttemptRepositoryPort {
  private readonly attempts = new Map<string, ScanAttempt>();

  async save(attempt: ScanAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();
    this.attempts.set(this.key({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scanJobId: snapshot.scanJobId,
    }), attempt);
  }

  async findByScanJob(query: FindScanAttemptQuery): Promise<ScanAttempt | null> {
    return this.attempts.get(this.key(query)) ?? null;
  }

  private key(query: FindScanAttemptQuery): string {
    return `${query.tenantId}:${query.workspaceId}:${query.scanJobId}`;
  }
}
