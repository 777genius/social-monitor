import { createHash } from "node:crypto";

export const codexAuthPoolExecutionPolicy = Object.freeze({
  maxAttempts: 1,
  retryOnCapacity: true,
  retryOnAccountUnavailable: true,
  retryOnReconnectRequired: false,
  retryUnknownCleanWorkspace: false,
  retryUnknownChangedWorkspace: false,
  continuationMode: "disabled",
});

export const codexAuthPoolTaskHash = (taskId) =>
  createHash("sha256").update(taskId).digest("hex");

export const orderCodexAuthAccountsForTask = (accounts, taskId) => {
  if (accounts.length < 2) {
    return [...accounts];
  }
  const digest = createHash("sha256").update(taskId).digest();
  const start = digest.readUInt32BE(0) % accounts.length;
  return [...accounts.slice(start), ...accounts.slice(0, start)];
};
