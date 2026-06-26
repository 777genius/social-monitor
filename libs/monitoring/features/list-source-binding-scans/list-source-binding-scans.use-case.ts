import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { ScanJobStatus } from '../../domain';
import type {
  ScanExecutionAttemptReadPort,
  ScanJobHistoryReadPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import { buildScanStatusView } from '../shared/scan-status-view';
import type { ListSourceBindingScansQuery } from './list-source-binding-scans.query';
import type { ListSourceBindingScansResult } from './list-source-binding-scans.result';

type ListSourceBindingScansFailure = DomainError;

export class ListSourceBindingScansUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanJobs: ScanJobHistoryReadPort,
    private readonly scanExecutionAttempts: ScanExecutionAttemptReadPort,
  ) {}

  async execute(
    query: ListSourceBindingScansQuery,
  ): Promise<Result<ListSourceBindingScansResult, ListSourceBindingScansFailure>> {
    if (query.sourceBindingId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Source binding id is required'));
    }

    if (!Number.isInteger(query.limit) || query.limit <= 0 || query.limit > 100) {
      return err(new DomainError('validation.failed', 'Scan request list limit must be between 1 and 100'));
    }

    const statuses = normalizeStatuses(query.statuses);
    if (statuses instanceof DomainError) {
      return err(statuses);
    }

    const binding = await this.sourceBindings.findById({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      sourceBindingId: query.sourceBindingId,
    });

    if (binding === null) {
      return err(new DomainError('resource.not_found', 'Source binding not found', {
        sourceBindingId: query.sourceBindingId,
      }));
    }

    const result = await this.scanJobs.listBySourceBinding({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      sourceBindingId: query.sourceBindingId,
      limit: query.limit,
      cursor: query.cursor,
      ...(statuses === undefined ? {} : { statuses }),
    });
    const scanRequests = await Promise.all(result.scanJobs.map(async (job) => {
      const snapshot = job.toSnapshot();
      const latestAttempt = await this.scanExecutionAttempts.findLatestByScanJob({
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        scanJobId: snapshot.id,
      });
      const view = buildScanStatusView({
        status: snapshot.status,
        failureReason: snapshot.failureReason,
      });

      return {
        scanJobId: snapshot.id,
        sourceBindingId: snapshot.sourceBindingId,
        scanPolicyId: snapshot.scanPolicyId,
        status: snapshot.status,
        userState: view.userState,
        failureClass: view.failureClass,
        operatorAction: view.operatorAction,
        requestedAt: snapshot.requestedAt,
        enqueuedAt: snapshot.enqueuedAt,
        completedAt: snapshot.completedAt,
        failureReason: snapshot.failureReason,
        latestAttempt: latestAttempt === null
          ? undefined
          : {
              sourceBindingId: latestAttempt.sourceBindingId,
              status: latestAttempt.status,
              startedAt: latestAttempt.startedAt,
              finishedAt: latestAttempt.finishedAt,
              fetched: latestAttempt.fetched,
              inserted: latestAttempt.inserted,
              skippedDuplicates: latestAttempt.skippedDuplicates,
              projected: latestAttempt.projected,
              failureReason: latestAttempt.failureReason,
            },
      };
    }));

    return ok({
      scanRequests,
      nextCursor: result.nextCursor,
    });
  }
}

const scanJobStatuses = new Set<ScanJobStatus>([
  'requested',
  'enqueued',
  'succeeded',
  'failed',
]);

const normalizeStatuses = (
  statuses: readonly string[] | undefined,
): readonly ScanJobStatus[] | undefined | DomainError => {
  if (statuses === undefined) {
    return undefined;
  }

  const normalized = Array.from(
    new Set(statuses.map((status) => status.trim()).filter(Boolean)),
  ).sort();

  if (statuses.length > 0 && normalized.length === 0) {
    return new DomainError('validation.failed', 'Scan request status filter must not be empty');
  }

  const invalidStatus = normalized.find((status) => !scanJobStatuses.has(status as ScanJobStatus));
  if (invalidStatus !== undefined) {
    return new DomainError('validation.failed', 'Unsupported scan request status filter', {
      status: invalidStatus,
    });
  }

  return normalized.length === 0 ? undefined : (normalized as ScanJobStatus[]);
};
