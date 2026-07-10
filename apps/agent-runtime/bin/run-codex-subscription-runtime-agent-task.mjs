#!/usr/bin/env node

import { FileBackendCodexWorker } from "@vioxen/subscription-runtime/worker-codex";
import { runSubscriptionAgentTaskCli } from "../../../node_modules/@vioxen/subscription-runtime/dist/worker-local/agent-task-runner-cli.js";

const requiredModel = "gpt-5.5";
const requiredReasoningEffort = "xhigh";

const reasoningEffort =
  process.env.AGENT_RUNTIME_REASONING_EFFORT?.trim() ??
  requiredReasoningEffort;

if (reasoningEffort !== requiredReasoningEffort) {
  throw new Error(
    `Social Monitor production summaries require reasoning effort ${requiredReasoningEffort}`,
  );
}

const createStrictCodexWorker = (input) => {
  if (input.provider !== "codex") {
    throw new Error("Social Monitor production summaries require Codex");
  }

  const model = input.model?.trim() || requiredModel;
  if (model !== requiredModel) {
    throw new Error(
      `Social Monitor production summaries require model ${requiredModel}`,
    );
  }

  return new FileBackendCodexWorker({
    providerInstanceId: input.providerInstanceId,
    stateRootDir: input.stateRootDir,
    encryptionKey: input.encryptionKey,
    codexBinaryPath: input.codexBinaryPath ?? "codex",
    sourceEnv: input.env,
    workspacePath: input.cwd,
    model,
    reasoningEffort,
    ...(input.timeoutMs ? { taskTimeoutMs: input.timeoutMs } : {}),
  });
};

process.exitCode = await runSubscriptionAgentTaskCli(
  process.argv.slice(2),
  undefined,
  createStrictCodexWorker,
);
