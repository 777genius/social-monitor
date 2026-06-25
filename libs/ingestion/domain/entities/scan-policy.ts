export type ScanPolicy = {
  readonly scanPolicyId: string;
  readonly attemptNumber: number;
  readonly retryBudget: number;
  readonly leaseTtlSeconds: number;
};

export const createScanPolicy = (props: {
  readonly scanPolicyId: string;
  readonly attemptNumber?: number;
  readonly retryBudget?: number;
  readonly leaseTtlSeconds?: number;
}): ScanPolicy => {
  const scanPolicyId = props.scanPolicyId.trim();
  const attemptNumber = props.attemptNumber ?? 1;
  const retryBudget = props.retryBudget ?? 3;
  const leaseTtlSeconds = props.leaseTtlSeconds ?? 300;

  if (scanPolicyId.length === 0) {
    throw new Error("Scan policy id must be non-empty");
  }
  assertPositiveInteger(attemptNumber, "Scan attempt number");
  assertPositiveInteger(retryBudget, "Scan retry budget");
  assertPositiveInteger(leaseTtlSeconds, "Scan lease ttl seconds");
  if (attemptNumber > retryBudget) {
    throw new Error("Scan attempt number must not exceed retry budget");
  }

  return {
    scanPolicyId,
    attemptNumber,
    retryBudget,
    leaseTtlSeconds,
  };
};

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
};
