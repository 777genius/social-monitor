#!/usr/bin/env node

import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  admitSubscriptionRuntimeWrapperRequest,
  subscriptionOnlyCodexEnvironment,
} from "./subscription-runtime-purpose-model-policy.mjs";
import { loadCodexAuthPoolFromEnv } from "./codex-auth-pool-manifest.mjs";
import {
  codexAuthPoolExecutionPolicy,
  codexAuthPoolTaskHash,
  orderCodexAuthAccountsForTask,
} from "./codex-auth-pool-routing.mjs";

const argv = process.argv.slice(2);
const provider = requiredArgument(argv, "--provider");
const inputPath = requiredArgument(argv, "--input");
const requestedModel = optionalArgument(argv, "--model");
const requestedReasoningEffort =
  process.env.AGENT_RUNTIME_REASONING_EFFORT?.trim() || undefined;
const request = JSON.parse(await readFile(inputPath, "utf8"));
const pinnedCodexBinaryPath = join(
  process.cwd(),
  "node_modules",
  ".bin",
  "codex",
);
const admission = admitSubscriptionRuntimeWrapperRequest({
  request,
  provider,
  model: requestedModel,
  reasoningEffort: requestedReasoningEffort,
});
await writeFile(inputPath, JSON.stringify(admission.canonicalRequest), "utf8");

const { FileBackendCodexWorker } = await import(
  "@vioxen/subscription-runtime/worker-codex"
);
const { FileBackendCodexSafeExecutor } = await import(
  "@vioxen/subscription-runtime/worker-codex"
);
const { SubscriptionWorkerError } = await import(
  "@vioxen/subscription-runtime/worker-core"
);
const { runSubscriptionAgentTaskCli } = await import(
  "../../../node_modules/@vioxen/subscription-runtime/dist/worker-local/agent-task-runner-cli.js"
);

const authPool = await loadCodexAuthPoolFromEnv(process.env);

const createStrictCodexWorker = (input) => {
  if (input.provider !== admission.profile.provider) {
    throw new Error("Agent runtime provider conflicts with purpose policy");
  }

  const model = input.model?.trim() || admission.profile.model;
  if (model !== admission.profile.model) {
    throw new Error("Agent runtime model conflicts with purpose policy");
  }

  if (authPool !== undefined) {
    return createPooledCodexWorker({ input, model, authPool });
  }

  return new FileBackendCodexWorker({
    providerInstanceId: input.providerInstanceId,
    stateRootDir: input.stateRootDir,
    encryptionKey: input.encryptionKey,
    codexBinaryPath: input.codexBinaryPath ?? pinnedCodexBinaryPath,
    sourceEnv: subscriptionOnlyCodexEnvironment(input.env),
    workspacePath: input.cwd,
    model,
    reasoningEffort: admission.profile.reasoningEffort,
    ...(input.timeoutMs ? { taskTimeoutMs: input.timeoutMs } : {}),
  });
};

function createPooledCodexWorker({ input, model, authPool }) {
  let executor;
  let disposed = false;

  return {
    async start() {},

    async seedCodexAuthJsonFile(authJsonPath) {
      const selectedPath = await realpath(authJsonPath);
      if (
        !authPool.accounts.some(
          (account) => account.authJsonPath === selectedPath,
        )
      ) {
        throw new Error(
          "--codex-auth-json cannot override the configured Codex auth pool",
        );
      }
    },

    async run(job) {
      if (disposed) {
        throw new Error("Pooled Codex worker has been disposed");
      }
      if (executor !== undefined) {
        throw new Error("Pooled Codex worker accepts one task per CLI process");
      }
      const taskId = job.runId?.trim();
      if (!taskId) {
        throw new Error("Pooled Codex worker requires a stable runId");
      }
      const taskHash = codexAuthPoolTaskHash(taskId);
      const workspacePath = join(
        input.stateRootDir,
        "task-workspaces",
        taskHash,
      );
      await mkdir(workspacePath, { recursive: true, mode: 0o700 });

      executor = new FileBackendCodexSafeExecutor({
        executorId: `social-monitor-agent-task:${taskHash}`,
        stateRootDir: input.stateRootDir,
        workspacePath,
        requireGitWorkspace: false,
        effectMode: "read_only",
        maxAccountCycles: 1,
        safeExecutionPolicy: {
          ...codexAuthPoolExecutionPolicy,
          maxAttempts: authPool.accounts.length,
        },
        accounts: orderCodexAuthAccountsForTask(
          authPool.accounts,
          taskId,
        ).map((account) => ({
          codexAuthJsonPath: account.authJsonPath,
          worker: {
            providerInstanceId: `codex:${account.id}`,
            capacityAccountId: account.id,
            stateRootDir: input.stateRootDir,
            encryptionKey: input.encryptionKey,
            codexBinaryPath: input.codexBinaryPath ?? pinnedCodexBinaryPath,
            sourceEnv: subscriptionOnlyCodexEnvironment(input.env),
            model,
            reasoningEffort: admission.profile.reasoningEffort,
            ...(input.timeoutMs ? { taskTimeoutMs: input.timeoutMs } : {}),
          },
        })),
      });
      const result = await executor.run({
        ...job,
        taskId,
        originalPrompt: job.prompt,
        effectMode: "read_only",
        maxAccountCycles: 1,
      });
      if (result.status === "completed") {
        return result.result;
      }
      throw new SubscriptionWorkerError(
        "subscription_worker_run_failed",
        result.safeMessage,
        {
          details: {
            reason: result.reason,
            ...(result.failureDetails ?? {}),
          },
        },
      );
    },

    async dispose() {
      disposed = true;
      await executor?.dispose();
    },
  };
}

process.exitCode = await runSubscriptionAgentTaskCli(
  withExactModel(argv, admission.profile.model),
  undefined,
  createStrictCodexWorker,
);

function withExactModel(args, model) {
  return optionalArgument(args, "--model") === undefined
    ? [...args, "--model", model]
    : args;
}

function requiredArgument(args, name) {
  const value = optionalArgument(args, name);
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalArgument(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${name} requires a value`);
      }
      values.push(value);
      index += 1;
    }
  }
  if (new Set(values).size > 1) {
    throw new Error(`${name} contains conflicting values`);
  }
  return values[0];
}
