import { createHash } from "node:crypto";

export const codexAuthPoolExecutionPolicy = Object.freeze({
  retryOnCapacity: true,
  retryOnAccountUnavailable: true,
  retryOnReconnectRequired: false,
  retryUnknownCleanWorkspace: true,
  retryUnknownChangedWorkspace: false,
  continuationMode: "retry_original_job",
});

export const codexAuthPoolTaskHash = (taskId) =>
  createHash("sha256").update(taskId).digest("hex");

/**
 * Detail keys that are safe to echo into an operator-visible failure message.
 * Provider stdout/stderr tails and raw causes stay out on purpose: they can
 * carry prompt or account material.
 */
const reportableCodexAuthPoolFailureDetails = Object.freeze([
  "availability",
  "reason",
  "cooldownUntil",
  "accountId",
  "quotaReason",
  "quotaPlanType",
  "quotaWindowKinds",
]);

/**
 * `Safe execution has no attempts remaining.` is the policy-level message the
 * subscription runtime returns once the attempt budget is spent. On a
 * single-account pool that budget is one attempt, so a capacity block that
 * never reached the provider surfaces as the generic exhaustion text and hides
 * the reason an operator actually needs (revoked session, cooldown, quota).
 * Keep the safe message, but always carry the classified reason and the
 * capacity details next to it.
 */
export const describeCodexAuthPoolRunFailure = (input) => {
  const safeMessage = typeof input.safeMessage === "string"
    ? input.safeMessage.trim()
    : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const details = input.failureDetails ?? {};
  const reported = reportableCodexAuthPoolFailureDetails
    .filter((key) => typeof details[key] === "string" && details[key].trim())
    .map((key) => `${key}=${details[key].trim()}`);
  if (Number.isInteger(input.attemptCount) && Number.isInteger(input.accountCount)) {
    reported.push(`attempts=${input.attemptCount}/${input.accountCount}`);
  }
  const head = reason
    ? `Codex auth pool run failed (${reason})`
    : "Codex auth pool run failed";
  return [
    head,
    ...(safeMessage ? [`: ${safeMessage}`] : [": no safe message"]),
    ...(reported.length > 0 ? [` [${reported.join(" ")}]`] : []),
  ].join("");
};

export const orderCodexAuthAccountsForTask = (accounts, taskId) => {
  if (accounts.length < 2) {
    return [...accounts];
  }
  const digest = createHash("sha256").update(taskId).digest();
  const start = digest.readUInt32BE(0) % accounts.length;
  return [...accounts.slice(start), ...accounts.slice(0, start)];
};
