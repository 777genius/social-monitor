import { createHash } from 'node:crypto';

import type { FailedScanCommand } from '../../ports';

/** Stable UUIDv8 command identity makes recovery of failure recording idempotent. */
export const scanFailureEntryKey = (command: FailedScanCommand,
  status: 'RETRY_ENQUEUED' | 'DEAD_LETTERED', nextAttemptNumber: number | null): string => {
  const hash = createHash('sha256').update(JSON.stringify([
    command.tenantId, command.workspaceId, command.scanJobId,
    command.attemptNumber, status, nextAttemptNumber,
  ])).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
