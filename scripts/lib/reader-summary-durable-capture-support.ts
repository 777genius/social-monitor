import type { Clock, DomainError, Result } from "@social-monitor/shared-kernel";
import { ok } from "@social-monitor/shared-kernel";
import type { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import type { EnqueueReaderSummaryJobCommand, ReaderSummaryJobQueuePort, ReaderSummaryTimestampPolicy, ReserveSummaryJobQuotaCommand, ReserveSummaryJobQuotaResult, SummaryQuotaPort } from "@social-monitor/summary/ports";
import { ReaderSummaryDayDatasetGuard, readReaderSummaryDayDatasetAdmission, readReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-guard";
import { assertImmutableRecoveryInputs } from "./reader-summary-recovery-files";

export function buildDatasetGuard(params: {
  readonly client: PrismaSummaryConnection;
  readonly clock: Clock;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly periodStartedAt: Date;
  readonly periodEndedAt: Date;
  readonly now: Date;
  readonly timestampPolicy: ReaderSummaryTimestampPolicy;
}): ReaderSummaryDayDatasetGuard {
  const admission = readReaderSummaryDayDatasetAdmission(process.env);
  const manifestPath = requiredEnvironment("DURABLE_READER_SUMMARY_DATASET_MANIFEST_PATH");
  assertImmutableRecoveryInputs({
    recoveryRoot: requiredEnvironment("DURABLE_READER_SUMMARY_RECOVERY_ROOT"),
    inputPaths: [manifestPath],
    forbiddenOutputPaths: [],
  });
  const { manifest, fileSha256 } = readReaderSummaryDayDatasetManifest({
    path: manifestPath,
    expectedFileSha256: requiredEnvironment("DURABLE_READER_SUMMARY_DATASET_MANIFEST_SHA256"),
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    startedAt: params.periodStartedAt,
    endedAt: params.periodEndedAt,
    now: params.now,
    expectedTimestampPolicy: params.timestampPolicy,
    ...(admission === undefined ? {} : { admission }),
  });
  return new ReaderSummaryDayDatasetGuard(
    params.client,
    manifest,
    fileSha256,
    () => params.clock.now(),
    admission,
  );
}

export class CapturingReaderSummaryJobQueue implements ReaderSummaryJobQueuePort {
  private readonly commands: EnqueueReaderSummaryJobCommand[] = [];

  async canAccept(): Promise<boolean> {
    return true;
  }

  async enqueue(command: EnqueueReaderSummaryJobCommand): Promise<void> {
    this.commands.push(command);
  }

  all(): readonly EnqueueReaderSummaryJobCommand[] {
    return [...this.commands];
  }
}

export class AllowingSummaryQuota implements SummaryQuotaPort {
  constructor(private readonly clock: Clock) {}

  async reserveSummaryJob(
    _command: ReserveSummaryJobQuotaCommand,
  ): Promise<Result<ReserveSummaryJobQuotaResult, DomainError>> {
    void _command;

    return ok({
      remaining: 999,
      resetAt: new Date(
        this.clock.now().getTime() + 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
