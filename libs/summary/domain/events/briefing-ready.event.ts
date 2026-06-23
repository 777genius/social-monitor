import type { EventEnvelope, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { BriefingJobStatus } from '../entities/briefing-job';
import type { BriefingScope } from '../value-objects/briefing-scope';

export type BriefingReadyEventPayload = {
  readonly briefingJobId: string;
  readonly briefingId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: BriefingScope;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly status: Extract<BriefingJobStatus, 'completed' | 'no_signal'>;
};

export type BriefingReadyEvent = EventEnvelope<BriefingReadyEventPayload> & {
  readonly eventType: 'briefing.ready';
  readonly schemaVersion: 1;
};
