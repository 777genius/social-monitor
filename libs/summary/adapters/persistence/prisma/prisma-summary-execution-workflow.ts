import { runWithTenantDatabaseAccess, withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type {
  CompleteSummaryExecution,
  FailSummaryExecution,
  StartSummaryExecution,
  SummaryExecutionClaim,
  SummaryExecutionVersion,
  SummaryExecutionWorkflowPort,
} from '../../../ports';
import { prepareCompletedSummaryJob } from '../summary-execution-outcome';
import type { PrismaSummaryClient } from './prisma-summary-client';
import { summaryArtifactWrite, summaryEventWrite } from './prisma-summary-execution-writes';
import { summaryJobFromPrisma, summaryJobStatusToPrisma, type PrismaSummaryJobRecord } from './prisma-summary-records';

type SummaryExecutionPrismaClient = PrismaSummaryClient & {
  readonly $transaction: <T>(
    operation: (transaction: PrismaSummaryClient) => Promise<T>,
    options: { readonly isolationLevel: 'Serializable' },
  ) => Promise<T>;
};

class SummaryExecutionOwnershipLost extends Error {}

export class PrismaSummaryExecutionWorkflow implements SummaryExecutionWorkflowPort {
  private readonly prisma: SummaryExecutionPrismaClient;

  constructor(prisma: PrismaSummaryClient) {
    if (!('$transaction' in prisma) || typeof prisma.$transaction !== 'function') {
      throw new Error('Summary execution requires atomic Prisma transactions');
    }
    this.prisma = prisma as SummaryExecutionPrismaClient;
  }

  async tryStart(command: StartSummaryExecution): Promise<SummaryExecutionClaim | null> {
    return runWithTenantDatabaseAccess(command, () => withPrismaWriteRetry(async () => {
      const rows = await this.prisma.$queryRaw<readonly (PrismaSummaryJobRecord & {
        readonly executionVersion: SummaryExecutionVersion;
      })[]>`
        UPDATE summary_jobs
        SET status = 'RUNNING',
            requested_at = CASE WHEN status = 'FAILED' THEN ${command.startedAt}::timestamptz ELSE requested_at END,
            started_at = ${command.startedAt}::timestamptz,
            completed_at = NULL, failed_at = NULL, summary_artifact_id = NULL, failure_reason = NULL,
            updated_at = ${command.startedAt}::timestamptz
        WHERE id = ${command.summaryJobId}::uuid
          AND tenant_id = ${command.tenantId}::uuid AND workspace_id = ${command.workspaceId}::uuid
          AND status IN ('REQUESTED', 'FAILED')
        RETURNING id, tenant_id AS "tenantId", workspace_id AS "workspaceId", interest_id AS "interestId",
          user_id AS "userId", subscription_id AS "subscriptionId", status,
          idempotency_key AS "idempotencyKey", requested_at AS "requestedAt", started_at AS "startedAt",
          completed_at AS "completedAt", failed_at AS "failedAt", summary_artifact_id AS "summaryArtifactId",
          failure_reason AS "failureReason", created_at AS "createdAt", updated_at AS "updatedAt",
          xmin::text AS "executionVersion"
      `;
      const row = rows[0];
      return row === undefined ? null : { job: summaryJobFromPrisma(row), version: row.executionVersion };
    }));
  }

  async complete(command: CompleteSummaryExecution) {
    const finalJob = prepareCompletedSummaryJob(command);
    const snapshot = finalJob.toSnapshot();
    const artifactWrite = summaryArtifactWrite(command.artifact);
    const eventWrite = summaryEventWrite(command.event);
    try {
      return await runWithTenantDatabaseAccess(snapshot, () => withPrismaWriteRetry(() =>
        this.prisma.$transaction(async (transaction) => {
          await transaction.summaryArtifact.create({ data: artifactWrite.create });
          const rows = await transaction.$queryRaw<readonly { readonly id: string }[]>`
            UPDATE summary_jobs
            SET status = ${summaryJobStatusToPrisma(snapshot.status)}::"SummaryStatus",
                completed_at = ${command.completedAt}::timestamptz,
                summary_artifact_id = ${snapshot.summaryId}::uuid,
                failed_at = NULL, failure_reason = NULL, updated_at = ${command.completedAt}::timestamptz
            WHERE id = ${snapshot.id}::uuid
              AND tenant_id = ${snapshot.tenantId}::uuid AND workspace_id = ${snapshot.workspaceId}::uuid
              AND status = 'RUNNING' AND xmin::text = ${command.execution.version}
            RETURNING id
          `;
          if (rows.length === 0) throw new SummaryExecutionOwnershipLost();
          await transaction.outboxEvent.create(eventWrite);
          return finalJob;
        }, { isolationLevel: 'Serializable' }),
      ));
    } catch (error) {
      // Returning false inside the transaction would commit the orphan artifact.
      if (error instanceof SummaryExecutionOwnershipLost) return null;
      throw error;
    }
  }

  async fail(command: FailSummaryExecution): Promise<boolean> {
    const failedJob = command.execution.job.fail({
      failedAt: command.failedAt, failureReason: command.failureReason,
    });
    const snapshot = failedJob.toSnapshot();
    return runWithTenantDatabaseAccess(snapshot, () => withPrismaWriteRetry(async () => {
      const rows = await this.prisma.$queryRaw<readonly { readonly id: string }[]>`
        UPDATE summary_jobs
        SET status = 'FAILED', failed_at = ${command.failedAt}::timestamptz,
            failure_reason = ${snapshot.failureReason}, updated_at = ${command.failedAt}::timestamptz
        WHERE id = ${snapshot.id}::uuid
          AND tenant_id = ${snapshot.tenantId}::uuid AND workspace_id = ${snapshot.workspaceId}::uuid
          AND status = 'RUNNING' AND xmin::text = ${command.execution.version}
        RETURNING id
      `;
      return rows.length === 1;
    }));
  }
}
