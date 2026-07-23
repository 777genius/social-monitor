import type { EventEnvelope } from '@social-monitor/shared-kernel';

import type { ScanJob } from '../domain';
import type { EnqueueScanCommand } from './scan-queue.port';

export interface ScanDispatchPort {
  storeEnqueuedScan(params: {
    readonly job: ScanJob;
    readonly command: EnqueueScanCommand;
    readonly event?: EventEnvelope<Readonly<Record<string, unknown>>>;
  }): Promise<void>;
}
