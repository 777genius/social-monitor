import type { FindScanCursorQuery, SaveScanCursorCommand, ScanCursorRepositoryPort, ScanCursorRecord } from '../../ports';

export class InMemoryScanCursorRepository implements ScanCursorRepositoryPort {
  private readonly cursors = new Map<string, ScanCursorRecord>();

  async save(command: SaveScanCursorCommand): Promise<void> {
    this.cursors.set(this.key(command), command);
  }

  async findBySourceBinding(query: FindScanCursorQuery): Promise<ScanCursorRecord | null> {
    return this.cursors.get(this.key(query)) ?? null;
  }

  private key(query: FindScanCursorQuery): string {
    return `${query.tenantId}:${query.workspaceId}:${query.sourceBindingId}`;
  }
}
