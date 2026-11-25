import { ScanJob } from '@social-monitor/monitoring/domain';
import type { ScanJobRepositoryPort, ScanPolicyRepositoryPort } from '@social-monitor/monitoring/ports';
import type { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

type HttpServer = Parameters<typeof request>[0];
type RequestHeaders = Record<string, string>;

type SourceBindingFixture = {
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
};

export const createInterest = async (params: {
  readonly httpServer: HttpServer;
  readonly headers: RequestHeaders;
  readonly idempotencyKey: string;
  readonly name: string;
  readonly query: string;
}): Promise<string> => {
  const topic = await request(params.httpServer)
    .post('/interests')
    .set(params.headers)
    .set('idempotency-key', params.idempotencyKey)
    .send({
      name: params.name,
      query: params.query,
    })
    .expect(201);

  return topic.body.interestId;
};

export const createBindingWithPolicy = async (params: {
  readonly httpServer: HttpServer;
  readonly interestId: string;
  readonly headers: RequestHeaders;
  readonly idempotencyKey: string;
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
  readonly providerKey?: string;
  readonly config?: Record<string, unknown>;
}): Promise<SourceBindingFixture> => {
  const binding = await request(params.httpServer)
    .post(`/interests/${params.interestId}/source-bindings`)
    .set(params.headers)
    .set('idempotency-key', `binding-${params.idempotencyKey}`)
    .send({
      providerKey: params.providerKey ?? 'fake-source',
      config: params.config ?? { mode: 'search', query: `health ${params.idempotencyKey}` },
    })
    .expect(201);

  const policy = await request(params.httpServer)
    .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
    .set(params.headers)
    .set('idempotency-key', `policy-${params.idempotencyKey}`)
    .send({
      intervalSeconds: params.intervalSeconds,
      freshnessSeconds: params.freshnessSeconds,
      retryBudget: 3,
    })
    .expect(201);

  return {
    sourceBindingId: binding.body.sourceBindingId,
    scanPolicyId: policy.body.scanPolicyId,
  };
};

export const readHealth = async (params: {
  readonly httpServer: HttpServer;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly headers: RequestHeaders;
}) =>
  request(params.httpServer)
    .get(`/interests/${params.interestId}/source-bindings/${params.sourceBindingId}/health`)
    .set(params.headers)
    .expect(200);

export const seedCompletedScan = async (params: {
  readonly scanJobs: ScanJobRepositoryPort;
  readonly tenant: ReturnType<typeof tenantId>;
  readonly workspace: ReturnType<typeof workspaceId>;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly scanJobId: string;
  readonly completedAt: Date;
  readonly failureReason?: string;
}): Promise<void> => {
  const requestedAt = new Date(params.completedAt.getTime() - 2_000);
  const enqueuedAt = new Date(params.completedAt.getTime() - 1_000);
  const enqueued = ScanJob.request({
    id: params.scanJobId,
    tenantId: params.tenant,
    workspaceId: params.workspace,
    sourceBindingId: params.sourceBindingId,
    scanPolicyId: params.scanPolicyId,
    idempotencyKey: `seed-${params.scanJobId}`,
    requestedAt,
  }).markEnqueued({ enqueuedAt });
  const completed =
    params.failureReason === undefined
      ? enqueued.markSucceeded({ completedAt: params.completedAt })
      : enqueued.markFailed({
          completedAt: params.completedAt,
          failureReason: params.failureReason,
        });

  await params.scanJobs.save(completed);
};

export const movePolicyNextRunForward = async (params: {
  readonly scanPolicies: ScanPolicyRepositoryPort;
  readonly tenant: ReturnType<typeof tenantId>;
  readonly workspace: ReturnType<typeof workspaceId>;
  readonly sourceBindingId: string;
  readonly nextRunAt: Date;
}): Promise<void> => {
  const policy = await params.scanPolicies.findBySourceBinding({
    tenantId: params.tenant,
    workspaceId: params.workspace,
    sourceBindingId: params.sourceBindingId,
  });
  if (policy === null) {
    throw new Error('scheduled-later fixture must have scan policy');
  }
  await params.scanPolicies.save(policy.scheduleNext({ nextRunAt: params.nextRunAt }));
};
