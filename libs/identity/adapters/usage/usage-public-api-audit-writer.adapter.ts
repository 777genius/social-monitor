import type { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';

import type {
  PublicApiAuditWriterPort,
  RecordIdentityPublicApiAuditCommand,
} from '../../ports';

type AuditWorkflow = Pick<RecordPublicApiAuditEventUseCase, 'execute'>;

export class UsagePublicApiAuditWriterAdapter
  implements PublicApiAuditWriterPort
{
  constructor(private readonly workflow: AuditWorkflow) {}

  record(
    command: RecordIdentityPublicApiAuditCommand,
  ): ReturnType<PublicApiAuditWriterPort['record']> {
    return this.workflow.execute(command);
  }
}
