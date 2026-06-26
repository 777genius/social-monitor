import type {
  ListScanSchedulerDecisionsBySourceBindingWindowQuery,
  ListScanSchedulerDecisionsBySourceBindingWindowResult,
  RecordScanSchedulerDecisionsCommand,
  ScanSchedulerDecisionHistoryPort,
  ScanSchedulerDecisionRecord,
} from '../../ports';

export class InMemoryScanSchedulerDecisionHistoryRepository implements ScanSchedulerDecisionHistoryPort {
  private readonly recordsByKey = new Map<string, ScanSchedulerDecisionRecord>();

  async recordBatch(command: RecordScanSchedulerDecisionsCommand): Promise<void> {
    for (const record of command.records) {
      this.recordsByKey.set(this.key(record), record);
    }
  }

  async listBySourceBindingWindow(
    query: ListScanSchedulerDecisionsBySourceBindingWindowQuery,
  ): Promise<ListScanSchedulerDecisionsBySourceBindingWindowResult> {
    const records = [...this.recordsByKey.values()]
      .filter((record) => (
        record.tenantId === query.tenantId &&
        record.workspaceId === query.workspaceId &&
        record.sourceBindingId === query.sourceBindingId &&
        record.evaluatedAt.getTime() >= query.windowStartedAt.getTime() &&
        record.evaluatedAt.getTime() < query.windowEndedAt.getTime()
      ))
      .sort((left, right) => {
        const evaluatedDiff = right.evaluatedAt.getTime() - left.evaluatedAt.getTime();

        return evaluatedDiff === 0 ? right.id.localeCompare(left.id) : evaluatedDiff;
      });
    const page = records.slice(0, query.limit);

    return {
      records: page,
      truncated: records.length > query.limit,
    };
  }

  private key(record: ScanSchedulerDecisionRecord): string {
    return `${record.tenantId}:${record.workspaceId}:${record.decisionKey}`;
  }
}
