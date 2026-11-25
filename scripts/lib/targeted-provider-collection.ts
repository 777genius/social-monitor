import type { ProviderCollectionRetryDisposition } from "@social-monitor/ingestion/features/provider-collection-slo/provider-collection-slo-policy";

export type TargetedProviderCollectionOutcome<TTarget, TResult> = {
  readonly target: TTarget;
  readonly attempts: readonly TResult[];
  readonly result: TResult;
  readonly retryStopReason?: "duplicate_plan";
};

export type ProviderCollectionReadinessRetryPolicy<TTarget, TResult> = {
  readonly delaysMs: readonly number[];
  readonly maxTotalAttempts: number;
  readonly shouldRetry: (target: TTarget, result: TResult) => boolean;
  readonly wait?: (delayMs: number) => Promise<void>;
  readonly onWait?: (params: {
    readonly target: TTarget;
    readonly delayMs: number;
    readonly attemptNumber: number;
  }) => void;
};

export const runTargetedProviderCollection = async <TTarget, TResult>(params: {
  readonly targets: readonly TTarget[];
  readonly retryBudget: number;
  readonly collect: (
    target: TTarget,
    attemptNumber: number,
  ) => Promise<TResult>;
  readonly retryDisposition: (
    result: TResult,
  ) => ProviderCollectionRetryDisposition;
  readonly selectPreferredResult?: (
    current: TResult,
    candidate: TResult,
  ) => TResult;
  readonly retryPlanKey?: (params: {
    readonly target: TTarget;
    readonly attemptNumber: number;
  }) => string | undefined;
  readonly stopDuplicatePlanRetry?: (latestAttempt: TResult) => boolean;
  readonly readinessRetry?: ProviderCollectionReadinessRetryPolicy<
    TTarget,
    TResult
  >;
}): Promise<readonly TargetedProviderCollectionOutcome<TTarget, TResult>[]> => {
  const outcomes = await initialRound(
    params.targets,
    params.collect,
    params.retryPlanKey,
  );

  for (let retry = 0; retry < params.retryBudget; retry += 1) {
    const retryable = outcomes.filter(
      (outcome) =>
        outcome.retryStopReason === undefined &&
        params.retryDisposition(outcome.latestAttempt) === "immediate",
    );
    if (retryable.length === 0) {
      break;
    }

    for (const outcome of retryable) {
      const attemptNumber = outcome.attempts.length + 1;
      const retryPlanKey = params.retryPlanKey?.({
        target: outcome.target,
        attemptNumber,
      });
      if (
        retryPlanKey !== undefined &&
        outcome.observedRetryPlanKeys.has(retryPlanKey) &&
        (params.stopDuplicatePlanRetry?.(outcome.latestAttempt) ?? true)
      ) {
        outcome.retryStopReason = "duplicate_plan";
        continue;
      }

      const result = await params.collect(outcome.target, attemptNumber);
      outcome.attempts.push(result);
      if (retryPlanKey !== undefined) {
        outcome.observedRetryPlanKeys.add(retryPlanKey);
      }
      if (params.selectPreferredResult !== undefined) {
        outcome.result = params.selectPreferredResult(outcome.result, result);
      } else {
        outcome.result = result;
      }
      outcome.latestAttempt = result;
    }
  }

  await runReadinessRetries(outcomes, params);

  return outcomes.map((outcome) => ({
    target: outcome.target,
    attempts: outcome.attempts,
    result: outcome.result,
    ...(outcome.retryStopReason === undefined
      ? {}
      : { retryStopReason: outcome.retryStopReason }),
  }));
};

const runReadinessRetries = async <TTarget, TResult>(
  outcomes: readonly MutableOutcome<TTarget, TResult>[],
  params: {
    readonly collect: (
      target: TTarget,
      attemptNumber: number,
    ) => Promise<TResult>;
    readonly selectPreferredResult?: (
      current: TResult,
      candidate: TResult,
    ) => TResult;
    readonly readinessRetry?: ProviderCollectionReadinessRetryPolicy<
      TTarget,
      TResult
    >;
  },
): Promise<void> => {
  const policy = params.readinessRetry;
  if (policy === undefined) {
    return;
  }

  for (const outcome of outcomes) {
    const remainingAttempts = Math.max(
      0,
      policy.maxTotalAttempts - outcome.attempts.length,
    );
    const delays = policy.delaysMs.slice(-remainingAttempts);
    for (const delayMs of delays) {
      if (!policy.shouldRetry(outcome.target, outcome.result)) {
        break;
      }
      const attemptNumber = outcome.attempts.length + 1;
      policy.onWait?.({ target: outcome.target, delayMs, attemptNumber });
      await (policy.wait ?? wait)(delayMs);
      const result = await params.collect(outcome.target, attemptNumber);
      outcome.attempts.push(result);
      outcome.latestAttempt = result;
      outcome.result =
        params.selectPreferredResult?.(outcome.result, result) ?? result;
      outcome.retryStopReason = undefined;
    }
  }
};

const wait = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

type MutableOutcome<TTarget, TResult> = {
  readonly target: TTarget;
  readonly attempts: TResult[];
  readonly observedRetryPlanKeys: Set<string>;
  result: TResult;
  latestAttempt: TResult;
  retryStopReason?: "duplicate_plan";
};

const initialRound = async <TTarget, TResult>(
  targets: readonly TTarget[],
  collect: (target: TTarget, attemptNumber: number) => Promise<TResult>,
  retryPlanKey:
    | ((params: {
        readonly target: TTarget;
        readonly attemptNumber: number;
      }) => string | undefined)
    | undefined,
): Promise<MutableOutcome<TTarget, TResult>[]> => {
  const outcomes: MutableOutcome<TTarget, TResult>[] = [];
  for (const target of targets) {
    const result = await collect(target, 1);
    const initialPlanKey = retryPlanKey?.({
      target,
      attemptNumber: 1,
    });
    outcomes.push({
      target,
      attempts: [result],
      observedRetryPlanKeys: new Set(
        initialPlanKey === undefined ? [] : [initialPlanKey],
      ),
      result,
      latestAttempt: result,
    });
  }

  return outcomes;
};
