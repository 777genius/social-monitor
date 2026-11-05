import type {
  FindScanCursorQuery,
  SaveScanCursorCommand,
  ScanCursorRecord,
  ScanCursorRepositoryPort,
} from "../../ports";

/** A single-run checkpoint that cannot consult or update durable cursors. */
export class IsolatedScanCursorRepository implements ScanCursorRepositoryPort {
  private cursor: ScanCursorRecord | null = null;

  constructor(private readonly scope: FindScanCursorQuery) {
    for (const value of [scope.tenantId, scope.workspaceId, scope.sourceBindingId]) {
      if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
        throw new Error("Isolated scan cursor requires a valid scope");
      }
    }
    this.scope = { ...scope };
  }

  async save(command: SaveScanCursorCommand): Promise<void> {
    this.assertScope(command);
    if (typeof command.cursor !== "string" || !Number.isFinite(command.committedAt?.getTime())) {
      throw new Error("Invalid isolated scan cursor value");
    }
    this.cursor = { ...command, committedAt: new Date(command.committedAt) };
  }

  async findBySourceBinding(query: FindScanCursorQuery): Promise<ScanCursorRecord | null> {
    this.assertScope(query);
    return this.cursor === null
      ? null
      : { ...this.cursor, committedAt: new Date(this.cursor.committedAt) };
  }

  private assertScope(query: FindScanCursorQuery): void {
    if (
      query.tenantId !== this.scope.tenantId ||
      query.workspaceId !== this.scope.workspaceId ||
      query.sourceBindingId !== this.scope.sourceBindingId
    ) {
      throw new Error("Isolated scan cursor scope mismatch");
    }
  }
}
