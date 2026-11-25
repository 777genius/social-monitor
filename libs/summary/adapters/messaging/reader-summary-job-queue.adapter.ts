import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";
import type {
  QueueCommandEnvelope,
  QueuePublisherPort,
} from "@social-monitor/platform-queue";

import {
  EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE,
  type EnqueueReaderSummaryJobCommand,
  type ReaderSummaryJobQueuePort,
} from "../../ports";

type QueueBacklogReader = {
  all(): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[];
};

export class ReaderSummaryJobQueuePublisherAdapter implements ReaderSummaryJobQueuePort {
  private readonly backlogReader: QueueBacklogReader | undefined;

  constructor(
    private readonly publisher: QueuePublisherPort,
    private readonly metrics: MetricsRecorderPort,
    private readonly maxDepth = 1000,
    backlogReader?: QueueBacklogReader,
  ) {
    this.backlogReader =
      backlogReader ??
      (isQueueBacklogReader(publisher) ? publisher : undefined);
  }

  async canAccept(): Promise<boolean> {
    return (
      this.backlogReader === undefined ||
      this.backlogReader.all().length < this.maxDepth
    );
  }

  async enqueue(command: EnqueueReaderSummaryJobCommand): Promise<void> {
    if (!(await this.canAccept())) {
      this.metrics.incrementCounter({
        name: "queue_commands_enqueued_total",
        labels: {
          command_type: EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE,
          job_type: "reader_summary",
          status: "rejected",
        },
      });
      this.recordBacklog();

      throw new Error("Reader summary job queue backpressure limit reached");
    }

    await this.publisher.publish({
      commandId: command.readerSummaryJobId,
      commandType: EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE,
      schemaVersion: 1,
      correlationId: command.correlationId,
      causationId: command.causationId,
      payload: {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        readerSummaryJobId: command.readerSummaryJobId,
      },
    });
    this.metrics.incrementCounter({
      name: "queue_commands_enqueued_total",
      labels: {
        command_type: EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE,
        job_type: "reader_summary",
        status: "enqueued",
      },
    });
    this.recordBacklog();
  }

  all(): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] {
    return this.backlogReader?.all() ?? [];
  }

  private recordBacklog(): void {
    if (this.backlogReader === undefined) {
      return;
    }

    this.metrics.recordGauge({
      name: "queue_commands_backlog",
      value: this.backlogReader.all().length,
      labels: {
        command_type: EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE,
        queue: "reader_summary",
      },
    });
  }
}

export class InMemoryReaderSummaryJobQueueAdapter implements ReaderSummaryJobQueuePort {
  private readonly commands: EnqueueReaderSummaryJobCommand[] = [];

  constructor(private readonly maxDepth = 1000) {}

  async canAccept(): Promise<boolean> {
    return this.commands.length < this.maxDepth;
  }

  async enqueue(command: EnqueueReaderSummaryJobCommand): Promise<void> {
    if (!(await this.canAccept())) {
      throw new Error("Reader summary job queue backpressure limit reached");
    }

    this.commands.push(command);
  }

  all(): readonly EnqueueReaderSummaryJobCommand[] {
    return [...this.commands];
  }
}

const isQueueBacklogReader = (value: unknown): value is QueueBacklogReader =>
  typeof value === "object" &&
  value !== null &&
  "all" in value &&
  typeof (value as { readonly all?: unknown }).all === "function";
