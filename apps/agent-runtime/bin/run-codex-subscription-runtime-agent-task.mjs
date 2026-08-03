#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

import {
  admitSubscriptionRuntimeWrapperRequest,
  subscriptionOnlyCodexEnvironment,
} from "./subscription-runtime-purpose-model-policy.mjs";

const argv = process.argv.slice(2);
const provider = requiredArgument(argv, "--provider");
const inputPath = requiredArgument(argv, "--input");
const requestedModel = optionalArgument(argv, "--model");
const requestedReasoningEffort =
  process.env.AGENT_RUNTIME_REASONING_EFFORT?.trim() || undefined;
const request = JSON.parse(await readFile(inputPath, "utf8"));
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
const { runSubscriptionAgentTaskCli } = await import(
  "../../../node_modules/@vioxen/subscription-runtime/dist/worker-local/agent-task-runner-cli.js"
);

const createStrictCodexWorker = (input) => {
  if (input.provider !== admission.profile.provider) {
    throw new Error("Agent runtime provider conflicts with purpose policy");
  }

  const model = input.model?.trim() || admission.profile.model;
  if (model !== admission.profile.model) {
    throw new Error("Agent runtime model conflicts with purpose policy");
  }

  return new FileBackendCodexWorker({
    providerInstanceId: input.providerInstanceId,
    stateRootDir: input.stateRootDir,
    encryptionKey: input.encryptionKey,
    codexBinaryPath: input.codexBinaryPath ?? "codex",
    sourceEnv: subscriptionOnlyCodexEnvironment(input.env),
    workspacePath: input.cwd,
    model,
    reasoningEffort: admission.profile.reasoningEffort,
    ...(input.timeoutMs ? { taskTimeoutMs: input.timeoutMs } : {}),
  });
};

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
