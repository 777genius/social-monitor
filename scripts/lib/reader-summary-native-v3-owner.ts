import { NATIVE_V3_PREPARATION_MS } from "./reader-summary-native-v3-budget";
import { canonicalReaderSummaryPreparationTimestamp, compareReaderSummaryPreparationTimestamps } from "@social-monitor/summary/domain";
import { setTimeout as wait } from 'node:timers/promises';
import type { Clock } from '@social-monitor/shared-kernel';
import { READER_SUMMARY_NATIVE_V3_PREFIX, type ReaderSummaryNativeOwner } from
  '@social-monitor/summary/application/contracts/reader-summary-native-owner';
import type { ReaderSummaryJobRepositoryPort } from '@social-monitor/summary/ports';
import type { ExecuteReaderSummaryJobCommand } from
  '@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.command';
import type { ExecuteReaderSummaryJobUseCase } from
  '@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case';

// A finite safety ceiling is not a required operation runtime or host proof.
export const NATIVE_V3_MAXIMUM_BUDGET_MS = 3 * 60 * 60_000;
export const validateNativeV3Budget = (argv: readonly string[], budgetValue: string | undefined): void => {
  if (!argv.includes('--native-jev-v3')) return;
  const budget = Number(budgetValue);
  if (argv.filter((value) => value === '--native-jev-v3').length !== 1 ||
      !Number.isSafeInteger(budget) || budget <= 0 ||
      budget > NATIVE_V3_MAXIMUM_BUDGET_MS) {
    throw new Error('Native V3 requires qualified finite owner budget');
  }
};
export const nativeV3Owner = (params: {
  readonly argv: readonly string[]; readonly legacyKey: string;
  readonly tenantId: string; readonly workspaceId: string;
  readonly cutoff?: Date; readonly exactCutoffAt?: string; readonly now: Date;
  readonly specialMode: boolean; readonly budget: string | undefined;
}): ReaderSummaryNativeOwner | undefined => {
  if (!params.argv.includes('--native-jev-v3')) return undefined;
  validateNativeV3Budget(params.argv, params.budget);
  if (params.specialMode || params.cutoff === undefined ||
      !/^durable-reader-summary-daily:[a-f0-9]{64}$/u.test(params.legacyKey) ||
      params.cutoff.toISOString().slice(0, 10) !== params.now.toISOString().slice(0, 10) ||
      params.cutoff.getTime() > params.now.getTime()) {
    throw new Error('Native V3 requires ordinary daily cutoff and qualified finite owner budget');
  }
  const cutoffAt = canonicalReaderSummaryPreparationTimestamp(params.exactCutoffAt ?? params.cutoff.toISOString());
  if (Date.parse(cutoffAt) !== params.cutoff.getTime() ||
      compareReaderSummaryPreparationTimestamps(cutoffAt, params.now.toISOString()) > 0) {
    throw new Error('Native V3 exact source cutoff changed or is in the future');
  }
  return { tenantId: params.tenantId, workspaceId: params.workspaceId,
    idempotencyKey: READER_SUMMARY_NATIVE_V3_PREFIX + params.legacyKey.split(':')[1],
    cutoffAt,
    preparationDeadlineAt: new Date(params.now.getTime() + NATIVE_V3_PREPARATION_MS)
      .toISOString().replace(/\.(\d{3})Z$/u, '.$1000Z') };
};

/** Only this process's native requested UUID may be advanced; no queue redelivery. */
export const executeNativeReaderSummary = async (params: {
  readonly owner: ReaderSummaryNativeOwner; readonly jobs: ReaderSummaryJobRepositoryPort;
  readonly execute: Pick<ExecuteReaderSummaryJobUseCase, 'execute'>;
  readonly command: ExecuteReaderSummaryJobCommand; readonly clock: Clock;
  readonly sleep?: (milliseconds: number) => Promise<unknown>;
}): ReturnType<ExecuteReaderSummaryJobUseCase['execute']> => {
  for (;;) {
    const persisted = await params.jobs.findById(params.command);
    if (persisted === null) throw new Error('Native summary job disappeared');
    const snapshot = persisted.toSnapshot();
    if (snapshot.idempotencyKey !== params.owner.idempotencyKey ||
        snapshot.preparationCutoffAt !== params.owner.cutoffAt ||
        snapshot.preparationDeadlineAt !== params.owner.preparationDeadlineAt) {
      throw new Error('Native summary owner identity changed');
    }
    if (snapshot.status === 'running') throw new Error('Native summary already running; never steal or replay');
    const observedNow = params.clock.now().getTime();
    if (snapshot.status === 'requested' && observedNow >= Date.parse(params.owner.preparationDeadlineAt)) {
      throw new Error('Native summary preparation deadline exhausted before execution');
    }

    if (snapshot.status === 'requested' && snapshot.preparationNextCheckAt !== undefined &&
        snapshot.preparationNextCheckAt.getTime() > observedNow) {
      const remaining = Date.parse(params.owner.preparationDeadlineAt) - observedNow;
      if (remaining <= 0 || snapshot.preparationNextCheckAt.getTime() > Date.parse(params.owner.preparationDeadlineAt)) {
        throw new Error('Native summary preparation deadline exhausted');
      }
      await (params.sleep ?? wait)(Math.min(10_000, remaining,
        snapshot.preparationNextCheckAt.getTime() - observedNow));
      continue;
    }

    const outcome = await params.execute.execute(params.command);
    if (!outcome.ok) return outcome;
    if (outcome.value.status !== 'requested') {
      if ((outcome.value.status !== 'completed' && outcome.value.status !== 'no_signal') ||
          outcome.value.readerSummaryId === undefined) {
        throw new Error('Native summary did not reach published artifact closure');
      }
      return outcome;
    }
    const deferred = await params.jobs.findById(params.command);
    const next = deferred?.toSnapshot();
    if (next?.status !== 'requested' || next.preparationNextCheckAt === undefined ||
        next.id !== snapshot.id || next.idempotencyKey !== params.owner.idempotencyKey) {
      throw new Error('Native summary defer did not persist owned requested timing');
    }
    const now = params.clock.now().getTime();
    const deadline = Date.parse(params.owner.preparationDeadlineAt);
    if (now >= deadline || next.preparationNextCheckAt.getTime() > deadline) {
      throw new Error('Native summary preparation deadline exhausted');
    }
    await (params.sleep ?? wait)(Math.max(1, Math.min(10_000,
      next.preparationNextCheckAt.getTime() - now, deadline - now)));
  }
};
