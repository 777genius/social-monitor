import { DomainError } from '@social-monitor/shared-kernel';

import type { SummaryJob } from '../../domain';
import type { CompleteSummaryExecution } from '../../ports';

export const prepareCompletedSummaryJob = (command: CompleteSummaryExecution): SummaryJob => {
  const job = command.execution.job.toSnapshot();
  const artifact = command.artifact.toSnapshot();
  const event = command.event;
  const status = artifact.qualityFlags.includes('no_signal') ? 'no_signal' : 'completed';
  if (job.tenantId !== artifact.tenantId || job.workspaceId !== artifact.workspaceId ||
      job.interestId !== artifact.interestId || job.userId !== artifact.userId ||
      job.subscriptionId !== artifact.subscriptionId ||
      event.tenantId !== job.tenantId || event.workspaceId !== job.workspaceId ||
      event.payload.tenantId !== job.tenantId || event.payload.workspaceId !== job.workspaceId ||
      event.payload.summaryJobId !== job.id || event.payload.summaryId !== artifact.summaryId ||
      event.payload.interestId !== job.interestId || event.payload.userId !== job.userId ||
      event.payload.subscriptionId !== job.subscriptionId || event.payload.status !== status) {
    throw new DomainError('operation.conflict', 'Summary completion scope or artifact identity does not match its execution');
  }

  return status === 'no_signal'
    ? command.execution.job.markNoSignal({ completedAt: command.completedAt, summaryId: artifact.summaryId })
    : command.execution.job.complete({ completedAt: command.completedAt, summaryId: artifact.summaryId });
};
