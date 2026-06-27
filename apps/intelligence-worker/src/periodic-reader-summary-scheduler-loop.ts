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
import { RequestCorrelationIdFactory } from "@social-monitor/platform-request-context";
import { SchedulePeriodicReaderSummariesUseCase } from "@social-monitor/summary/features/schedule-periodic-reader-summaries/schedule-periodic-reader-summaries.use-case";
import {
  SystemClock,
  tenantId,
  workspaceId,
  type Clock,
} from "@social-monitor/shared-kernel";

import {
  INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_OPTIONS,
  type IntelligencePeriodicReaderSummarySchedulerOptions,
} from "./intelligence-worker-provider-tokens";

@Injectable()
export class PeriodicReaderSummarySchedulerLoop
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger: StructuredLogger = new NestStructuredLogger(
    PeriodicReaderSummarySchedulerLoop.name,
  );
  private readonly correlationIds = new RequestCorrelationIdFactory();
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    private readonly schedulePeriodicReaderSummaries: SchedulePeriodicReaderSummariesUseCase,
    @Inject(INTELLIGENCE_PERIODIC_READER_SUMMARY_SCHEDULER_OPTIONS)
    private readonly options: IntelligencePeriodicReaderSummarySchedulerOptions,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info("periodic reader summary scheduler loop disabled", {
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

    this.logger.info("periodic reader summary scheduler loop started", {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
      readyAtUtcHour: this.options.readyAtUtc.hour,
      readyAtUtcMinute: this.options.readyAtUtc.minute,
      scoped: this.options.tenantId !== undefined,
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
    this.logger.info("periodic reader summary scheduler loop stopped", {
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
    try {
      const result = await this.schedulePeriodicReaderSummaries.execute({
        limit: this.options.limit,
        correlationId: this.correlationIds.fromRequestId(
          `periodic-reader-summary-${trigger}`,
        ),
        now: this.clock.now(),
        readyAtUtc: this.options.readyAtUtc,
        ...(this.options.tenantId === undefined
          ? {}
          : {
              tenantId: tenantId(this.options.tenantId),
              workspaceId: workspaceId(this.options.workspaceId ?? ""),
            }),
      });

      if (!result.ok) {
        this.logger.error(
          "periodic reader summary scheduler loop tick rejected",
          {
            trigger,
            error:
              result.error instanceof Error
                ? result.error.message
                : String(result.error),
            worker: "intelligence-worker",
          },
        );
        return;
      }

      for (const summary of result.value.summaries) {
        this.logger.info("periodic reader summary scheduler item completed", {
          trigger,
          cadence: summary.cadence,
          periodKey: summary.period.periodKey,
          scheduled: summary.created,
          existing: !summary.created,
          status: summary.status,
          readerSummaryJobId: summary.readerSummaryJobId,
          worker: "intelligence-worker",
        });
      }

      this.logger.info(
        "periodic reader summary scheduler loop tick completed",
        {
          trigger,
          evaluated: result.value.evaluated,
          scheduled: result.value.scheduled,
          existing: result.value.existing,
          notReady: result.value.notReady,
          failed: result.value.failed,
          readyAtUtcHour: this.options.readyAtUtc.hour,
          readyAtUtcMinute: this.options.readyAtUtc.minute,
          worker: "intelligence-worker",
        },
      );
    } catch (error) {
      this.logger.error("periodic reader summary scheduler loop tick failed", {
        trigger,
        error: error instanceof Error ? error.message : String(error),
        worker: "intelligence-worker",
      });
    }
  }
}
