import type {
  CompleteSummaryExecution,
  FailSummaryExecution,
  StartSummaryExecution,
  SummaryExecutionClaim,
  SummaryExecutionWorkflowPort,
} from '../../ports';
import type { InMemorySummaryEventPublisher } from '../messaging/in-memory-summary-event-publisher';
import type { InMemorySummaryArtifactRepository } from './in-memory-summary-artifact.repository';
import type { InMemorySummaryJobRepository } from './in-memory-summary-job.repository';
import { prepareCompletedSummaryJob } from './summary-execution-outcome';

export class InMemorySummaryExecutionWorkflow implements SummaryExecutionWorkflowPort {
  constructor(
    private readonly jobs: InMemorySummaryJobRepository,
    private readonly artifacts: InMemorySummaryArtifactRepository,
    private readonly events: InMemorySummaryEventPublisher,
  ) {}

  async tryStart(command: StartSummaryExecution): Promise<SummaryExecutionClaim | null> {
    const current = this.jobs.readForExecution(command);
    if (current === null) return null;
    const status = current.job.toSnapshot().status;
    if (status !== 'requested' && status !== 'failed') return null;
    const requested = status === 'failed'
      ? current.job.retry({ requestedAt: command.startedAt }) : current.job;
    this.jobs.store(requested.start({ startedAt: command.startedAt }));
    return this.jobs.readForExecution(command);
  }

  async complete(command: CompleteSummaryExecution) {
    const finalJob = prepareCompletedSummaryJob(command);
    if (!this.owns(command.execution)) return null;
    const createArtifact = this.artifacts.prepareCreate(command.artifact);
    const createEvent = this.events.prepareCreate(command.event);
    // Domain/uniqueness validation completes before the synchronous commit.
    // These prepared writes only mutate local maps/arrays; there is no await.
    createArtifact();
    createEvent();
    this.jobs.store(finalJob);
    return finalJob;
  }

  async fail(command: FailSummaryExecution): Promise<boolean> {
    if (!this.owns(command.execution)) return false;
    const failedJob = command.execution.job.fail({
      failedAt: command.failedAt, failureReason: command.failureReason,
    });
    this.jobs.store(failedJob);
    return true;
  }

  private owns(execution: SummaryExecutionClaim): boolean {
    const snapshot = execution.job.toSnapshot();
    const current = this.jobs.readForExecution({
      tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId, summaryJobId: snapshot.id,
    });
    return current?.version === execution.version && current.job.toSnapshot().status === 'running';
  }
}
