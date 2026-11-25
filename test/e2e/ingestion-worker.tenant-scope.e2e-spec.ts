import { Test } from '@nestjs/testing';
import { DomainError } from '@social-monitor/shared-kernel';

import { IngestionWorkerModule } from '../../apps/ingestion-worker/src/ingestion-worker.module';
import { ExecuteScanCommandHandler } from '../../libs/ingestion/interfaces/queue/execute-scan-command.handler';

describe('Ingestion worker tenant scope guard (e2e)', () => {
  it('returns controlled tenant.scope_missing error when scan command tenant is absent', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    }).compile();
    await moduleRef.init();

    const handler = moduleRef.get(ExecuteScanCommandHandler);

    await expect(handler.handle({
      commandId: 'scan-job-missing-tenant',
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      correlationId: 'correlation-missing-tenant',
      payload: {
        workspaceId: 'workspace-worker-scope-e2e',
        scanJobId: 'scan-job-missing-tenant',
        sourceBindingId: 'source-binding-worker-scope-e2e',
        scanPolicyId: 'scan-policy-worker-scope-e2e',
        providerKey: 'fake-source',
        sourceQuery: { mode: 'search', query: 'worker tenant scope e2e' },
      },
    })).rejects.toThrow(new DomainError('tenant.scope_missing', 'tenantId command payload field is required'));

    await moduleRef.close();
  });

  it('returns controlled tenant.scope_missing error when scan command workspace is absent', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IngestionWorkerModule],
    }).compile();
    await moduleRef.init();

    const handler = moduleRef.get(ExecuteScanCommandHandler);

    await expect(handler.handle({
      commandId: 'scan-job-missing-workspace',
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      correlationId: 'correlation-missing-workspace',
      payload: {
        tenantId: 'tenant-worker-scope-e2e',
        scanJobId: 'scan-job-missing-workspace',
        sourceBindingId: 'source-binding-worker-scope-e2e',
        scanPolicyId: 'scan-policy-worker-scope-e2e',
        providerKey: 'fake-source',
        sourceQuery: { mode: 'search', query: 'worker tenant scope e2e' },
      },
    })).rejects.toThrow(new DomainError('tenant.scope_missing', 'workspaceId command payload field is required'));

    await moduleRef.close();
  });
});
