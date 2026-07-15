import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import {
  NestStructuredLogger,
  type StructuredLogger,
} from "@social-monitor/platform-logging";
import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";
import { queueCommandDeliveryLagSeconds } from "@social-monitor/platform-queue";
import { EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE } from "@social-monitor/summary/ports";
import { ExecuteReaderSummaryJobCommandHandler } from "@social-monitor/summary/interfaces/queue/execute-reader-summary-job-command.handler";
import type { Clock } from "@social-monitor/shared-kernel";

import {
  INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
  type IntelligenceReaderSummaryQueueDrainLoopOptions,
} from "./intelligence-worker-provider-tokens";
import {
  INTELLIGENCE_READER_SUMMARY_JOB_QUEUE_READER,
  type SummaryJobQueueReaderPort,
} from "./summary-job-queue-reader";

@Injectable()
export class ReaderSummaryJobQueueDrainLoop
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger: StructuredLogger = new NestStructuredLogger(
    ReaderSummaryJobQueueDrainLoop.name,
  );
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    @Inject(INTELLIGENCE_READER_SUMMARY_JOB_QUEUE_READER)
    private readonly queue: SummaryJobQueueReaderPort,
    private readonly handler: ExecuteReaderSummaryJobCommandHandler,
    @Inject(INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS)
    private readonly options: IntelligenceReaderSummaryQueueDrainLoopOptions,
    private readonly metrics: MetricsRecorderPort,
    private readonly clock: Clock,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info("readerSummary queue drain loop disabled", {
        worker: "intelligence-worker",
      });
      return;
    }

    if (this.options.runOnStart) {
      await this.runTick("startup");
    }

    this.timer = setInterval(() => {
      void this.runTick("interval");
    }, this.options.intervalMs);

    this.logger.info("readerSummary queue drain loop started", {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
      worker: "intelligence-worker",
    });
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.shuttingDown = true;

    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await this.currentTick;
    this.logger.info("readerSummary queue drain loop stopped", {
      signal,
      worker: "intelligence-worker",
    });
  }

  private async runTick(trigger: "startup" | "interval"): Promise<void> {
    if (this.shuttingDown || this.currentTick !== undefined) {
      return;
    }

    this.currentTick = this.executeTick(trigger).finally(() => {
      this.currentTick = undefined;
    });
    await this.currentTick;
  }

  private async executeTick(trigger: "startup" | "interval"): Promise<void> {
    const deliveries = await this.queue.drain({
      commandType: EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE,
      limit: this.options.limit,
    });
    let completed = 0;
    let failed = 0;

    for (const delivery of deliveries) {
      const { command } = delivery;
      this.recordDeliveryLag(delivery);
      try {
        await this.handler.handle(command);
        await delivery.ack();
        completed += 1;
      } catch (error) {
        await delivery.nack({ requeue: false });
        failed += 1;
        this.logger.error("readerSummary queue drain loop item failed", {
          commandId: command.commandId,
          trigger,
          error: error instanceof Error ? error.message : String(error),
          redelivered: delivery.diagnostics.redelivered,
          deadLetterCount: delivery.diagnostics.deadLetterCount,
          deadLetterReason: delivery.diagnostics.deadLetterReason,
          deadLetterQueue: delivery.diagnostics.deadLetterQueue,
          worker: "intelligence-worker",
        });
      }
    }

    this.logger.info("readerSummary queue drain loop tick completed", {
      trigger,
      evaluated: deliveries.length,
      completed,
      failed,
      worker: "intelligence-worker",
    });
  }

  private recordDeliveryLag(
    delivery: Awaited<ReturnType<SummaryJobQueueReaderPort["drain"]>>[number],
  ): void {
    const lagSeconds = queueCommandDeliveryLagSeconds(
      delivery.diagnostics,
      this.clock.now(),
    );

    if (lagSeconds === undefined) {
      return;
    }

    this.metrics.recordGauge({
      name: "queue_command_delivery_lag_seconds",
      value: lagSeconds,
      labels: {
        command_type: delivery.command.commandType,
        queue: "readerSummary",
        worker: "intelligence-worker",
      },
    });
  }
}
