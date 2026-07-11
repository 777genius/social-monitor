import type { ProviderCollectionRetryDisposition } from "@social-monitor/ingestion/features/provider-collection-slo/provider-collection-slo-policy";

export type TargetedProviderCollectionOutcome<TTarget, TResult> = {
  readonly target: TTarget;
  readonly attempts: readonly TResult[];
  readonly result: TResult;
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
}): Promise<readonly TargetedProviderCollectionOutcome<TTarget, TResult>[]> => {
  const outcomes = await initialRound(params.targets, params.collect);

  for (let retry = 0; retry < params.retryBudget; retry += 1) {
    const retryable = outcomes.filter(
      (outcome) => params.retryDisposition(outcome.result) === "immediate",
    );
    if (retryable.length === 0) {
      break;
    }

    for (const outcome of retryable) {
      const result = await params.collect(
        outcome.target,
        outcome.attempts.length + 1,
      );
      outcome.attempts.push(result);
      outcome.result = result;
    }
  }

  return outcomes;
};

type MutableOutcome<TTarget, TResult> = {
  readonly target: TTarget;
  readonly attempts: TResult[];
  result: TResult;
};

const initialRound = async <TTarget, TResult>(
  targets: readonly TTarget[],
  collect: (target: TTarget, attemptNumber: number) => Promise<TResult>,
): Promise<MutableOutcome<TTarget, TResult>[]> => {
  const outcomes: MutableOutcome<TTarget, TResult>[] = [];
  for (const target of targets) {
    const result = await collect(target, 1);
    outcomes.push({ target, attempts: [result], result });
  }

  return outcomes;
};
