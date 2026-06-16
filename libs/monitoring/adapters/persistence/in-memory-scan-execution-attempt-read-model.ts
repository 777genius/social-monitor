import type {
  FindScanExecutionAttemptQuery,
  ScanExecutionAttemptReadPort,
  ScanExecutionAttemptSnapshot,
} from '../../ports';

export class InMemoryScanExecutionAttemptReadModel implements ScanExecutionAttemptReadPort {
  private readonly attempts = new Map<string, ScanExecutionAttemptSnapshot>();

  async save(snapshot: ScanExecutionAttemptSnapshot): Promise<void> {
    this.attempts.set(this.key(snapshot), snapshot);
  }

  async findLatestByScanJob(
    query: FindScanExecutionAttemptQuery,
  ): Promise<ScanExecutionAttemptSnapshot | null> {
    return this.attempts.get(this.key(query)) ?? null;
  }

  private key(query: FindScanExecutionAttemptQuery): string {
    return `${query.tenantId}:${query.workspaceId}:${query.scanJobId}`;
  }
}
