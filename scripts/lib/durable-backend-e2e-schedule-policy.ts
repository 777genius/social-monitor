import type { DurableScanProviderKey } from "./durable-backend-e2e-scan-targets";

const DIGEST_EVIDENCE_FIRST_RUN_DELAY_MS = 3_000;
const DIGEST_EVIDENCE_WINDOW_PADDING_MS = 30_000;
const MIN_DIGEST_EVIDENCE_INTERVAL_SECONDS = 60;

/** Source cadence remains live and provider-specific, not cached at construction. */
export function createDurableScanPolicyCadence({ minimumScanIntervalSecondsForProvider }: {
  readonly minimumScanIntervalSecondsForProvider: (providerKey: DurableScanProviderKey) => number;
}) {
  function durableScanPolicyCadence(providerKey: DurableScanProviderKey): {
    readonly intervalSeconds: number;
    readonly freshnessSeconds: number;
  } {
    const intervalSeconds = minimumScanIntervalSecondsForProvider(providerKey);

    return {
      intervalSeconds,
      freshnessSeconds: Math.max(intervalSeconds, 300),
    };
  }
  return { durableScanPolicyCadence };
}

export function durableDeliveryDigestScheduleWindow(params: {
  readonly loopStartedAt: Date;
  readonly scheduledAt: Date;
}): {
  readonly intervalSeconds: number;
  readonly nextRunAt: Date;
} {
  const nextRunAt = new Date(
    params.scheduledAt.getTime() + DIGEST_EVIDENCE_FIRST_RUN_DELAY_MS,
  );
  const intervalMs = Math.max(
    MIN_DIGEST_EVIDENCE_INTERVAL_SECONDS * 1000,
    nextRunAt.getTime() -
      params.loopStartedAt.getTime() +
      DIGEST_EVIDENCE_WINDOW_PADDING_MS,
  );

  return {
    intervalSeconds: Math.ceil(intervalMs / 1000),
    nextRunAt,
  };
}

export function scheduledInterestIdempotencyKey(runId: string): string {
  return `scheduled-topic-${runId}`;
}

export function bindingIdempotencyKey(
  providerKey: DurableScanProviderKey,
  runId: string,
): string {
  return `binding-${providerKey}-${runId}`;
}

export function policyIdempotencyKey(
  providerKey: DurableScanProviderKey,
  runId: string,
): string {
  return `policy-${providerKey}-${runId}`;
}

export function scanIdempotencyKey(
  providerKey: DurableScanProviderKey,
  runId: string,
): string {
  return `scan-${providerKey}-${runId}`;
}

export function scheduledBindingIdempotencyKey(runId: string): string {
  return `scheduled-binding-rss-${runId}`;
}

export function scheduledPolicyIdempotencyKey(runId: string): string {
  return `scheduled-policy-rss-${runId}`;
}
