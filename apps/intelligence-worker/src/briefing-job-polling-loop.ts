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
import { WorkerCommandIdFactory } from "@social-monitor/platform-worker";
import {
  EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE,
  type ReaderSummaryJobRepositoryPort,
} from "@social-monitor/summary/ports";
import { ExecuteReaderSummaryJobCommandHandler } from "@social-monitor/summary/interfaces/queue/execute-reader-summary-job-command.handler";
import { READER_SUMMARY_JOB_REPOSITORY } from "@social-monitor/summary/interfaces/rest/summary-provider-tokens";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  INTELLIGENCE_BRIEFING_JOB_LOOP_OPTIONS,
  type IntelligenceBriefingJobLoopOptions,
} from "./intelligence-worker-provider-tokens";

@Injectable()
export class BriefingJobPollingLoop
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger: StructuredLogger = new NestStructuredLogger(
    BriefingJobPollingLoop.name,
  );
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    private readonly handler: ExecuteReaderSummaryJobCommandHandler,
    @Inject(READER_SUMMARY_JOB_REPOSITORY)
    private readonly readerSummaryJobs: ReaderSummaryJobRepositoryPort,
    @Inject(INTELLIGENCE_BRIEFING_JOB_LOOP_OPTIONS)
    private readonly options: IntelligenceBriefingJobLoopOptions,
    private readonly commandIds: WorkerCommandIdFactory = WorkerCommandIdFactory.system(),
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info("briefing job polling loop disabled", {
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

    this.logger.info("briefing job polling loop started", {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
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
    this.logger.info("briefing job polling loop stopped", {
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
      const jobs = await this.readerSummaryJobs.findRequested({
        limit: this.options.limit,
        ...(this.options.tenantId === undefined
          ? {}
          : {
              tenantId: tenantId(this.options.tenantId),
              workspaceId: workspaceId(this.options.workspaceId ?? ""),
            }),
      });
      let completed = 0;
      let failed = 0;

      for (const job of jobs) {
        const snapshot = job.toSnapshot();

        try {
          await this.handler.handle({
            commandId: this.commandIds.next("briefing-job-poller", [
              snapshot.id,
            ]),
            commandType: EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE,
            schemaVersion: 1,
            correlationId: this.commandIds.next("briefing-job-poller", [
              trigger,
            ]),
            payload: {
              tenantId: snapshot.tenantId,
              workspaceId: snapshot.workspaceId,
              readerSummaryJobId: snapshot.id,
            },
          });
          completed += 1;
        } catch (error) {
          failed += 1;
          this.logger.error("briefing job polling loop item failed", {
            readerSummaryJobId: snapshot.id,
            trigger,
            error: error instanceof Error ? error.message : String(error),
            worker: "intelligence-worker",
          });
        }
      }

      this.logger.info("briefing job polling loop tick completed", {
        trigger,
        evaluated: jobs.length,
        completed,
        failed,
        worker: "intelligence-worker",
      });
    } catch (error) {
      this.logger.error("briefing job polling loop tick failed", {
        trigger,
        error: error instanceof Error ? error.message : String(error),
        worker: "intelligence-worker",
      });
    }
  }
}
