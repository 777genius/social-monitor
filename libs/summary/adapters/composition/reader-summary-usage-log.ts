import { appendFileSync, closeSync, constants, openSync } from "node:fs";
import type { Clock } from "@social-monitor/shared-kernel";
import type { AgentRuntimeClientPort, AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../ports";

/** Record metadata only: prompts, provider output and credentials never enter this log. */
export const withReaderSummaryUsageLog = (
  client: AgentRuntimeClientPort, evidencePath: string | undefined, runId: string, clock: Clock, periodStart?: string,
): AgentRuntimeClientPort => {
  if (!evidencePath) return client;
  const path = `${evidencePath}.usage.jsonl`;
  const record = (command: AgentRuntimeTaskCommand, started: number, result?: AgentRuntimeTaskResult): void => {
    try {
      const usage = result?.usage;
      const item = {
        version: 1, runId: safeIdentity(runId), timestamp: clock.now().toISOString(),
        targetDate: /^(\d{4}-\d{2}-\d{2})T/u.exec(periodStart ?? "")?.[1] ??
          /durable-reader-summary-(\d{4}-\d{2}-\d{2})/u.exec(evidencePath)?.[1] ?? null,
        requestId: safeIdentity(command.requestId),
        stage: safeIdentity(command.purpose),
        model: safeIdentity(result?.executionAttestation?.model ?? command.controls.model),
        effort: safeIdentity(result?.executionAttestation?.reasoningEffort ?? command.controls.reasoningEffort),
        identitySource: result?.executionAttestation ? "runtime_reported" : "requested",
        status: result?.status ?? "error", durationMs: Math.max(0, clock.now().getTime() - started),
        inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null,
        cachedInputTokens: usage?.cachedInputTokens ?? null, reasoningTokens: usage?.reasoningTokens ?? null,
        usageSource: usage ? "runtime_reported" : "unavailable",
        costUsd: null, costSource: "unavailable",
      };
      const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
      try { appendFileSync(fd, `${JSON.stringify(item)}\n`); } finally { closeSync(fd); }
    } catch {
      // Usage accounting must not turn a successful model call into a failed publication.
      process.stderr.write("Reader summary usage log could not be written\n");
    }
  };
  return {
    checkHealth: (service) => client.checkHealth(service),
    runTask: async (command, options) => {
      const started = clock.now().getTime();
      try {
        const result = await client.runTask(command, options);
        record(command, started, result);
        return result;
      } catch (error) {
        record(command, started);
        throw error;
      }
    },
  };
};

const safeIdentity = (value: unknown): string | null =>
  typeof value === "string" && /^[A-Za-z0-9._:/-]{1,160}$/u.test(value) ? value : null;
