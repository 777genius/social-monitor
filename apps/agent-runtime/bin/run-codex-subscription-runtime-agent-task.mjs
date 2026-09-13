#!/usr/bin/env node

import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { resolvePinnedCodexBinaryPath } from "./pinned-codex-native-binary.mjs";
import { withTrustedCodexWorkerUsage } from "./codex-worker-cli-usage.mjs";
import { createAssessmentCliLifecycle } from "./assessment-cli-lifecycle.mjs";
import { createAssessmentProgress } from "./assessment-cli-progress.mjs";
import { subscriptionRuntimeFailureDetails } from "./subscription-runtime-failure-details.mjs";

import {
  admitSubscriptionRuntimeWrapperRequest,
  readerPromotionV2CanaryActivationCapability,
  readerPromotionV2CanaryPurpose,
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanarySchemaName,
  subscriptionOnlyCodexEnvironment,
} from "./subscription-runtime-purpose-model-policy.mjs";
import { loadCodexAuthPoolFromEnv } from "./codex-auth-pool-manifest.mjs";
import {
  codexAuthPoolExecutionPolicy,
  codexAuthPoolTaskHash,
  describeCodexAuthPoolRunFailure,
  orderCodexAuthAccountsForTask,
} from "./codex-auth-pool-routing.mjs";

let lifecycle;
let progress = process.env.SOCIAL_MONITOR_ASSESSMENT_DEADLINE_MS === undefined ? undefined :
  createAssessmentProgress({ write: (line) => process.stderr.write(line),
    now: () => globalThis.performance.now(), remaining: () => lifecycle?.remaining() ?? 0 });
lifecycle = createAssessmentCliLifecycle({
  parentDeadline: process.env.SOCIAL_MONITOR_ASSESSMENT_DEADLINE_MS,
  mark: (...args) => progress?.mark(...args),
});
process.exitCode = await lifecycle.runCli(async () => {
const argv = process.argv.slice(2);
const canaryActivationFlag = "--activate-reader-promotion-v2-canary";
const canaryActivationRequested = argv.includes(canaryActivationFlag);
const runtimeArgv = argv.filter((argument) => argument !== canaryActivationFlag);
const provider = requiredArgument(runtimeArgv, "--provider");
const inputPath = requiredArgument(runtimeArgv, "--input");
const requestedModel = optionalArgument(runtimeArgv, "--model");
const requestedReasoningEffort =
  process.env.AGENT_RUNTIME_REASONING_EFFORT?.trim() || undefined;
const request = JSON.parse(await lifecycle.work(() => readFile(inputPath, "utf8")));
const admission = admitSubscriptionRuntimeWrapperRequest({
  request,
  provider,
  model: requestedModel,
  reasoningEffort: requestedReasoningEffort,
}, canaryActivationRequested
  ? readerPromotionV2CanaryActivationCapability
  : undefined);
const isSourceContentAssessment = admission.canonicalRequest.context.purpose === "social_monitor.relevance.assess_source_content.v1";
lifecycle.configure(isSourceContentAssessment, admission.canonicalRequest.timeoutMs);
if (isSourceContentAssessment) {
  progress ??= createAssessmentProgress({ write: (line) => process.stderr.write(line),
    now: () => globalThis.performance.now(), remaining: lifecycle.remaining });
  progress.mark("setup", "started");
}
const isReaderPromotionV2Canary = admission.canonicalRequest.context.purpose === readerPromotionV2CanaryPurpose;
const assessmentOutputSchemas = isSourceContentAssessment
  ? sourceContentAssessmentOutputSchemas(admission.canonicalRequest.task)
  : undefined;
await lifecycle.work(() => writeFile(inputPath, JSON.stringify(admission.canonicalRequest), "utf8"));

const { FileBackendCodexWorker, NodeProcessRunner } = await lifecycle.work(() => import(
  "@vioxen/subscription-runtime/worker-codex"
));
const { FileBackendCodexSafeExecutor } = await lifecycle.work(() => import(
  "@vioxen/subscription-runtime/worker-codex"
));
const { SubscriptionWorkerError } = await lifecycle.work(() => import(
  "@vioxen/subscription-runtime/worker-core"
));
const { runSubscriptionAgentTaskCli } = await lifecycle.work(() => import(
  "../../../node_modules/@vioxen/subscription-runtime/dist/worker-local/agent-task-runner-cli.js"
));

const authPool = await lifecycle.work(() => loadCodexAuthPoolFromEnv(process.env));
progress?.mark("setup", "completed");

const createStrictCodexWorker = (input) => {
  lifecycle.checkpoint();
  if (input.provider !== admission.profile.provider) {
    throw new Error("Agent runtime provider conflicts with purpose policy");
  }

  const model = input.model?.trim() || admission.profile.model;
  if (model !== admission.profile.model) {
    throw new Error("Agent runtime model conflicts with purpose policy");
  }

  if (authPool !== undefined) {
    if (isReaderPromotionV2Canary) {
      return createReaderPromotionV2CanaryWorker({ input, model, authPool });
    }
    return createPooledCodexWorker({ input, model, authPool, outputSchemas: assessmentOutputSchemas });
  }

  if (isSourceContentAssessment) {
    throw new Error("Source content assessment requires the configured Codex auth pool");
  }

  return new FileBackendCodexWorker({
    providerInstanceId: input.providerInstanceId,
    stateRootDir: input.stateRootDir,
    encryptionKey: input.encryptionKey,
    codexBinaryPath: input.codexBinaryPath ?? resolvePinnedCodexBinaryPath(),
    sourceEnv: subscriptionOnlyCodexEnvironment(input.env),
    workspacePath: input.cwd,
    model,
    reasoningEffort: admission.profile.reasoningEffort,
    ...(isReaderPromotionV2Canary ? readerPromotionV2CanaryWorkerOptions() : {}),
    ...(input.timeoutMs ? { taskTimeoutMs: input.timeoutMs } : {}),
  });
};

function createReaderPromotionV2CanaryWorker({ input, model, authPool }) {
  const taskId = nonEmptyRunId(admission.canonicalRequest.runId);
  const selectedAccount = orderCodexAuthAccountsForTask(
    authPool.accounts,
    taskId,
  )[0];
  if (selectedAccount === undefined) {
    throw new Error("Reader promotion V2 canary requires one Codex account");
  }
  const worker = new FileBackendCodexWorker({
    providerInstanceId: `codex:${selectedAccount.id}`,
    capacityAccountId: selectedAccount.id,
    stateRootDir: input.stateRootDir,
    encryptionKey: input.encryptionKey,
    codexBinaryPath: input.codexBinaryPath ?? resolvePinnedCodexBinaryPath(),
    sourceEnv: subscriptionOnlyCodexEnvironment(input.env),
    workspacePath: input.cwd,
    model,
    reasoningEffort: admission.profile.reasoningEffort,
    ...readerPromotionV2CanaryWorkerOptions(),
    ...(input.timeoutMs ? { taskTimeoutMs: input.timeoutMs } : {}),
  });
  let started = false;
  let ran = false;
  let materializedAuthRoot;
  return {
    async start() {
      if (started) throw new Error("Reader promotion V2 canary already started");
      started = true;
      await worker.start();
      materializedAuthRoot = await createAuthMaterializationRoot(
        input.stateRootDir,
        taskId,
      );
      try {
        const authJsonPath = await materializeCodexAuthAccount(
          materializedAuthRoot,
          selectedAccount,
        );
        await worker.seedCodexAuthJsonFile(authJsonPath);
      } catch (error) {
        await removeAuthMaterialization(materializedAuthRoot);
        materializedAuthRoot = undefined;
        throw error;
      }
    },

    async seedCodexAuthJsonFile(authJsonPath) {
      const selectedPath = await realpath(authJsonPath);
      if (!authPool.accounts.some(
        (account) => account.authJsonPath === selectedPath,
      )) {
        throw new Error(
          "--codex-auth-json cannot override the configured Codex auth pool",
        );
      }
    },

    async run(job) {
      if (!started || ran) {
        throw new Error("Reader promotion V2 canary permits exactly one run");
      }
      if (job.logicalThread !== undefined || job.recoveryPacket !== undefined) {
        throw new Error("Reader promotion V2 canary rejects continuation");
      }
      ran = true;
      const result = await worker.run({ ...job, runId: taskId });
      if (result.status === "waiting_for_input") {
        throw new Error("Reader promotion V2 canary rejects waiting output");
      }
      return result;
    },

    async dispose() {
      try {
        await worker.dispose();
      } finally {
        await removeAuthMaterialization(materializedAuthRoot);
      }
    },
  };
}

function oneNativeCommandRunner() {
  const delegate = new NodeProcessRunner();
  let executed = false;
  return {
    runnerId: "reader-promotion-v2-canary-single-command",
    capabilities: {
      ...delegate.capabilities,
      runnerId: "reader-promotion-v2-canary-single-command",
    },
    async run(input) {
      if (executed) {
        throw new Error(
          "Reader promotion V2 canary rejects a second native command",
        );
      }
      executed = true;
      return delegate.run(input);
    },
  };
}

function readerPromotionV2CanaryWorkerOptions() {
  return {
    executionEngine: "packaged-exec",
    refreshConflictRetryMaxMs: 0,
    cleanThreadPrewarm: false,
    runner: oneNativeCommandRunner(),
    outputSchemas: {
      [readerPromotionV2CanarySchemaName]: readerPromotionV2CanaryOutputSchema,
    },
  };
}

function sourceContentAssessmentOutputSchemas(task) {
  const name = "social_monitor_source_content_quality_review";
  const schema = task.controls.outputSchema;
  if (task.outputSchemaName !== name ||
      (task.controls.outputSchemaName !== undefined && task.controls.outputSchemaName !== name) ||
      schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("Source content assessment requires its named output schema object");
  }
  return { [name]: schema };
}

function createPooledCodexWorker({ input, model, authPool, outputSchemas }) {
  let executor;
  let disposed = false;
  let providerEffectPossible = false;
  const assessmentObservability = {
    ...progress,
    emit(event) {
      // Latch before provider work, including session refresh. Missing events
      // alone never authorize fallback: require the typed admission error below.
      if (event?.name === "session.read.started" || event?.name?.startsWith("provider.")) {
        providerEffectPossible = true;
      }
      progress?.emit(event);
    },
  };

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
      if (isSourceContentAssessment && (job.logicalThread !== undefined || job.recoveryPacket !== undefined)) {
        throw new Error("Source content assessment rejects continuation");
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
      lifecycle.checkpoint();
      progress?.mark("account_materialization", "started");
      const materializedAuthRoot = await createAuthMaterializationRoot(
        input.stateRootDir,
        taskId,
      );

      try {
        lifecycle.checkpoint();
        const accounts = await Promise.all(
          orderCodexAuthAccountsForTask(authPool.accounts, taskId).map(
            async (account) => ({
              codexAuthJsonPath: await lifecycle.work(() => materializeCodexAuthAccount(
                materializedAuthRoot,
                account,
              )),
              worker: {
                providerInstanceId: `codex:${account.id}`,
                capacityAccountId: account.id,
                stateRootDir: input.stateRootDir,
                encryptionKey: input.encryptionKey,
                codexBinaryPath: input.codexBinaryPath ?? resolvePinnedCodexBinaryPath(),
                sourceEnv: subscriptionOnlyCodexEnvironment(input.env),
                model,
                reasoningEffort: admission.profile.reasoningEffort,
                ...(outputSchemas === undefined ? {} : { outputSchemas }),
                ...(input.timeoutMs ? { taskTimeoutMs: input.timeoutMs } : {}),
              },
            }),
          ),
        );
        lifecycle.checkpoint();
        progress?.mark("account_materialization", "completed");
        executor = new FileBackendCodexSafeExecutor({
          executorId: `social-monitor-agent-task:${taskHash}`,
          stateRootDir: input.stateRootDir,
          workspacePath,
          requireGitWorkspace: false,
          effectMode: "read_only",
          maxAccountCycles: 1,
          safeExecutionPolicy: {
            ...codexAuthPoolExecutionPolicy,
            maxAttempts: admission.profile.retryMode === "never" ? 1 : authPool.accounts.length,
            ...(admission.profile.retryMode === "never" ? {
              retryOnCapacity: false, retryOnAccountUnavailable: false,
              retryOnReconnectRequired: false, retryUnknownCleanWorkspace: false,
            } : {}),
            ...(isSourceContentAssessment ? { continuationMode: "disabled" } : {}),
          },
          accounts,
          // Assessment never consumes native startup guidance or continuation.
          ...(isSourceContentAssessment ? {
            observability: assessmentObservability, shutdownTimeoutMs: 1_000,
            controlInbox: { consumeForContinuation: async () => undefined },
          } : {}),
        });
        lifecycle.checkpoint();
        progress?.mark("executor_run", "started");
        const runInput = {
          ...job,
          taskId,
          originalPrompt: job.prompt,
          effectMode: "read_only",
          maxAccountCycles: 1,
        };
        let result = await executor.run(runInput);
        // Keep the same executor, task journal and round-robin cursor. Grant
        // exactly one more admission attempt only after proven pre-provider
        // rejection; the executor itself must never retry a provider failure.
        for (let attempt = 1; isSourceContentAssessment && attempt < accounts.length; attempt++) {
          if (providerEffectPossible || !isPreProviderCapacityFailure(result, attempt)) break;
          lifecycle.checkpoint();
          if (disposed || job.abortSignal?.aborted) break;
          result = await executor.run({
            ...runInput,
            safeExecutionPolicy: { maxAttempts: attempt + 1 },
          });
        }
        progress?.mark("executor_run", "completed");
        if (result.status === "completed") {
          return result.result;
        }
        throw new SubscriptionWorkerError(
          "subscription_worker_run_failed",
          describeCodexAuthPoolRunFailure({
            safeMessage: result.safeMessage,
            reason: result.reason,
            failureDetails: result.failureDetails,
            attemptCount: result.attempts?.length,
            accountCount: authPool.accounts.length,
          }),
          {
            details: subscriptionRuntimeFailureDetails(result),
          },
        );
      } finally {
        progress?.mark("auth_cleanup", "started");
        await removeAuthMaterialization(materializedAuthRoot);
        progress?.mark("auth_cleanup", "completed");
      }
    },

    async dispose() {
      disposed = true;
      await executor?.dispose();
    },
  };
}

function isPreProviderCapacityFailure(result, attemptCount) {
  if (result.status !== "waiting_capacity" ||
      !["capacity_unavailable", "account_unavailable"].includes(result.reason) ||
      result.attempts?.length !== attemptCount) return false;
  if (!result.attempts.every((attempt) =>
    attempt.status === "blocked" &&
    ["capacity_unavailable", "account_unavailable"].includes(attempt.failureReason) &&
    attempt.workspaceDirtyBefore === false && attempt.workspaceDirtyAfter === false &&
    attempt.changedFiles?.length === 0 && attempt.usage === undefined &&
    attempt.lastOutputSummary === undefined)) return false;
  let error = result.error;
  // Only unwrap the pool's immediate slot wrapper, never a provider cause chain.
  if (error instanceof SubscriptionWorkerError &&
      error.code === "subscription_worker_pool_slot_failed" && error.usage === undefined) {
    error = error.cause;
  }
  return error instanceof SubscriptionWorkerError && error.cause === undefined &&
    error.usage === undefined &&
    ["subscription_worker_account_unavailable", "subscription_worker_pool_capacity_unavailable"].includes(error.code);
}

async function createAuthMaterializationRoot(stateRootDir, taskId) {
  const parent = join(stateRootDir, "auth-materializations");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  return mkdtemp(join(parent, `${codexAuthPoolTaskHash(taskId)}-`));
}

async function materializeCodexAuthAccount(root, account) {
  const accountRoot = join(root, account.id);
  const authJsonPath = join(accountRoot, "auth.json");
  await mkdir(accountRoot, { mode: 0o700 });
  await writeFile(authJsonPath, await readFile(account.authJsonPath), {
    mode: 0o600,
  });
  return authJsonPath;
}

async function removeAuthMaterialization(path) {
  if (path !== undefined) {
    await rm(path, { recursive: true, force: true });
  }
}

return await runSubscriptionAgentTaskCli(
  withExactModel(runtimeArgv, admission.profile.model),
  undefined,
  (input) => {
    const worker = withTrustedCodexWorkerUsage(createStrictCodexWorker(input));
    return isSourceContentAssessment ? lifecycle.decorateWorker(worker) : worker;
  },
);

function nonEmptyRunId(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Reader promotion V2 canary requires a stable runId");
  }
  return value.trim();
}

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

});
