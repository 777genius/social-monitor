import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { IdGenerator } from '@social-monitor/shared-kernel';

import type { FindScanCursorQuery, SaveScanCursorCommand, ScanCursorRepositoryPort, ScanCursorRecord } from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { cursorFromPrisma } from './prisma-ingestion-records';

export class PrismaScanCursorRepository implements ScanCursorRepositoryPort {
  constructor(
    private readonly prisma: PrismaIngestionClient,
    private readonly ids: IdGenerator,
  ) {}

  async save(command: SaveScanCursorCommand): Promise<void> {
    const id = this.ids.generate();

    await withPrismaWriteRetry(() => this.prisma.cursorCheckpoint.upsert({
      where: {
        tenantId_sourceBindingId: {
          tenantId: command.tenantId,
          sourceBindingId: command.sourceBindingId,
        },
      },
      update: {
        cursorPayload: { cursor: command.cursor },
      },
      create: {
        id,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        sourceBindingId: command.sourceBindingId,
        cursorPayload: { cursor: command.cursor },
      },
    }));
  }

  async findBySourceBinding(query: FindScanCursorQuery): Promise<ScanCursorRecord | null> {
    const record = await this.prisma.cursorCheckpoint.findFirst({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        sourceBindingId: query.sourceBindingId,
      },
    });

    return record === null ? null : cursorFromPrisma(record);
  }
}
