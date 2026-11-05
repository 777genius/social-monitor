// This boundary exports diagnostic codes, never arbitrary executor/provider data.
const classifiedReasons = new Set([
  "quota_limited", "capacity_unavailable", "account_unavailable",
  "reconnect_required", "permission_required", "task_timeout",
  "provider_output_invalid", "runtime_interrupted", "goal_slice_exhausted",
  "budget_exceeded", "model_unavailable", "user_abort", "unknown_error",
]);
const capacityReasons = new Set([
  "quota_recheck_identity_changed", "quota_recheck_inconclusive",
  "quota_recheck_failed",
  "rate_limit_threshold", "quota_limited", "account_exhausted",
]);
const failureStatuses = new Set(["waiting_capacity", "partial", "failed", "aborted"]);
const availabilities = new Set([
  "available", "busy", "warming", "cooldown", "quota_exhausted", "degraded", "disabled",
]);

export const subscriptionRuntimeFailureDetails = (result) => {
  const details = {};
  if (classifiedReasons.has(result.reason)) details.reason = result.reason;
  if (failureStatuses.has(result.status)) details.safeExecutorStatus = result.status;
  const failure = result.failureDetails ?? {};
  if (capacityReasons.has(failure.reason)) details.capacityReason = failure.reason;
  if (availabilities.has(failure.availability)) details.availability = failure.availability;
  if (typeof failure.cooldownUntil === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(failure.cooldownUntil)
    && Number.isFinite(Date.parse(failure.cooldownUntil))) {
    details.cooldownUntil = failure.cooldownUntil;
  }
  return details;
};
