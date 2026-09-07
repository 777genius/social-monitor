class TrustedCodexUsageValidationError extends Error {}

// This boundary accepts runtime worker metadata only, never model-authored JSON.
export function trustedCodexWorkerResultToCli(result) {
  const root = readUsage(result.usage);
  const telemetry = readUsage(result.telemetry?.usage);
  if (root && telemetry && Object.keys(root).some((key) => root[key] !== telemetry[key])) {
    throw new TrustedCodexUsageValidationError("Conflicting trusted Codex usage");
  }
  const usage = root ?? telemetry;
  return usage === undefined ? result : {
    ...result,
    telemetry: { ...result.telemetry, usage },
  };
}

export function withTrustedCodexWorkerUsage(worker) {
  return {
    start: (...args) => worker.start(...args),
    dispose: (...args) => worker.dispose(...args),
    seedCodexAuthJsonFile: (...args) => worker.seedCodexAuthJsonFile(...args),
    run: async (...args) => {
      const result = await worker.run(...args);
      // Preserve completed output while keeping invalid accounting unknown.
      // Only our validator's failures are recoverable at this boundary.
      try {
        return trustedCodexWorkerResultToCli(result);
      } catch (error) {
        if (!(error instanceof TrustedCodexUsageValidationError)) throw error;
        const sanitized = { ...result };
        delete sanitized.usage;
        if (result.telemetry !== null && typeof result.telemetry === "object") {
          sanitized.telemetry = { ...result.telemetry };
          delete sanitized.telemetry.usage;
        }
        console.error("codex-worker-cli-usage: dropping untrusted usage");
        return sanitized;
      }
    },
  };
}

function readUsage(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TrustedCodexUsageValidationError("Malformed trusted Codex usage");
  }
  const { inputTokens, outputTokens, totalTokens } = value;
  if (![inputTokens, outputTokens, totalTokens].every(
    (count) => Number.isSafeInteger(count) && count >= 0,
  ) || totalTokens !== inputTokens + outputTokens) {
    throw new TrustedCodexUsageValidationError("Malformed trusted Codex usage");
  }
  return { inputTokens, outputTokens, totalTokens };
}
