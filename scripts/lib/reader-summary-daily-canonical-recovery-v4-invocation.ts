import { invalidProductRetrySetToken } from "./reader-summary-daily-canonical-recovery-v4-invalid-product-retry-set";

export type DailyCanonicalRecoveryV4Invocation =
  | Readonly<{ kind: "ordinary" }>
  | Readonly<{ kind: "invalid_product_retry_set"; terminalSetSha256: string }>;

/**
 * This parser is intentionally narrow because the maintenance ingress repeats
 * the same token/digest check before a container, database, or model call.
 */
export const parseDailyCanonicalRecoveryV4Invocation = (
  argv: readonly string[],
): DailyCanonicalRecoveryV4Invocation => {
  if (argv.length === 0) return Object.freeze({ kind: "ordinary" as const });
  if (
    argv.length === 2 &&
    argv[0] === invalidProductRetrySetToken &&
    /^[0-9a-f]{64}$/u.test(argv[1] ?? "")
  ) {
    return Object.freeze({
      kind: "invalid_product_retry_set" as const,
      terminalSetSha256: argv[1]!,
    });
  }
  throw new Error(
    "Daily canonical recovery invocation must be empty or invalid-product-retry-set-v1 plus a lowercase terminal-set SHA-256",
  );
};
