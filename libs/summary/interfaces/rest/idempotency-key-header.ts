import { DomainError } from "@social-monitor/shared-kernel";

export const requireIdempotencyKeyHeader = (
  value: string | undefined,
): string => {
  const normalized = value?.trim();

  if (normalized === undefined || normalized.length === 0) {
    throw new DomainError(
      "validation.failed",
      "idempotency-key header is required",
    );
  }

  return normalized;
};
