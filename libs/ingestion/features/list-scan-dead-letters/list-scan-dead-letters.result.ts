export type ScanDeadLetterFailureClass =
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'worker_conflict'
  | 'system_failure';

export type ScanDeadLetterEntry = {
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly attemptNumber: number;
  readonly retryBudget: number;
  readonly failureClass: ScanDeadLetterFailureClass;
  readonly operatorAction: string;
  readonly correlationId: string;
  readonly causationId: string;
};

export type ListScanDeadLettersResult = {
  readonly deadLetters: readonly ScanDeadLetterEntry[];
};
