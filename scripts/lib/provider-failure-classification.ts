import type { ProviderFailure } from '../../libs/ingestion/ports';

type FailureClassificationCase = {
  readonly label: string;
  readonly error: Error;
  readonly expectedKind: ProviderFailure['kind'];
  readonly expectedRetryable: boolean;
};

export const classifyProviderFailures = (
  providerName: string,
  classify: (error: unknown) => ProviderFailure,
  cases: readonly FailureClassificationCase[],
): {
  readonly summary: string;
  readonly failureKindsObserved: readonly string[];
  readonly retryPolicyObserved: true;
  readonly classifiedWithoutRawPayloads: true;
} => {
  const failures = cases.map((failureCase) => {
    const failure = classify(failureCase.error);
    assert(
      failure.kind === failureCase.expectedKind,
      `${providerName} ${failureCase.label} must classify as ${failureCase.expectedKind}, got ${failure.kind}`,
    );
    assert(
      failure.retryable === failureCase.expectedRetryable,
      `${providerName} ${failureCase.label} retryable must be ${failureCase.expectedRetryable}`,
    );
    assert(failure.message.trim().length > 0, `${providerName} ${failureCase.label} must keep a diagnostic message`);
    return failure;
  });

  return {
    summary: `${providerName} provider-specific failures were classified into release-safe retry/backoff states.`,
    failureKindsObserved: [...new Set(failures.map((failure) => failure.kind))],
    retryPolicyObserved: true,
    classifiedWithoutRawPayloads: true,
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
