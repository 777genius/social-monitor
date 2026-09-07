// This boundary accepts runtime worker metadata only, never model-authored JSON.
export function trustedCodexWorkerResultToCli(result) {
  const root = readUsage(result.usage);
  const telemetry = readUsage(result.telemetry?.usage);
  if (root && telemetry && Object.keys(root).some((key) => root[key] !== telemetry[key])) {
    throw new Error("Conflicting trusted Codex usage");
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
      // Usage-tracking integrity is enforced separately by
      // trustedCodexWorkerResultToCli (fail closed on malformed/conflicting
      // usage). A billing-only enrichment failure must not take down the
      // underlying task result -- drop the untrusted usage and let the
      // already-completed work through instead of losing it.
      try {
        return trustedCodexWorkerResultToCli(result);
      } catch (error) {
        console.error(
          `codex-worker-cli-usage: dropping untrusted usage (${error.message})`,
        );
        return result;
      }
    },
  };
}

function readUsage(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed trusted Codex usage");
  }
  const { inputTokens, outputTokens, totalTokens } = value;
  if (![inputTokens, outputTokens, totalTokens].every(
    (count) => Number.isSafeInteger(count) && count >= 0,
  ) || totalTokens !== inputTokens + outputTokens) {
    throw new Error("Malformed trusted Codex usage");
  }
  return { inputTokens, outputTokens, totalTokens };
}
