import {
  failedScanCommandFromPrisma,
  type PrismaScanFailureQueueEntryRecord,
} from './prisma-ingestion-records';

describe('prisma ingestion record mappers', () => {
  it('preserves source query parameters when reading failed scan commands', () => {
    const command = failedScanCommandFromPrisma({
      id: 'failure-1',
      tenantId: 'tenant-prisma-records',
      workspaceId: 'workspace-prisma-records',
      scanJobId: 'scan-job-prisma-records',
      interestId: 'interest-prisma-records',
      sourceBindingId: 'binding-prisma-records',
      scanPolicyId: 'policy-prisma-records',
      providerKey: 'reddit',
      sourceQuery: {
        mode: 'listing',
        query: 'ClaudeAI:top',
        parameters: {
          topTime: 'week',
          scanPasses: [
            {
              mode: 'listing',
              subreddit: 'ClaudeAI',
              listing: 'top',
            },
          ],
        },
      },
      correlationId: 'correlation-prisma-records',
      causationId: 'causation-prisma-records',
      attemptNumber: 2,
      retryBudget: 4,
      nextAttemptNumber: 3,
      failureReason: 'rate limited',
      status: 'RETRY_ENQUEUED',
      createdAt: new Date('2026-07-04T00:00:00.000Z'),
    } satisfies PrismaScanFailureQueueEntryRecord);

    expect(command.sourceQuery).toEqual({
      mode: 'listing',
      query: 'ClaudeAI:top',
      parameters: {
        topTime: 'week',
        scanPasses: [
          {
            mode: 'listing',
            subreddit: 'ClaudeAI',
            listing: 'top',
          },
        ],
      },
    });
  });
});
