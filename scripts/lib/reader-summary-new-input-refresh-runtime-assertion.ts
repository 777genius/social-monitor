/** Share only an unsettled live identity assertion within this refresh process.
 * Freshness, fences and database checks remain owned by each caller. */
export function singleFlightRefreshRuntimeAssertion(assertIdentity: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => {
    if (pending === undefined) {
      pending = Promise.resolve().then(assertIdentity).finally(() => { pending = undefined; });
    }
    return pending;
  };
}

export type RefreshPreDelegationFailureStage = "local" | "assessment_budget" |
  "request_admission" | "runtime_health" | "runtime_mismatch" |
  "current_authority" | "journal_consumption";

/** Fixed codes only: neither exception text nor provider payload is retained. */
export class RefreshRuntimeAssertionFailure extends Error {
  constructor(readonly stage: "runtime_health" | "runtime_mismatch") {
    super("Refresh live runtime assertion failed");
  }
}
