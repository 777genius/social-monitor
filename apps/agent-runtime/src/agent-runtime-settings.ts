import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { activeReaderSummaryReasoningEffort } from "./subscription-runtime-purpose-model-policy";

export type AgentRuntimeSettings = {
  readonly bindAddress: string;
  readonly serviceToken?: string;
  readonly cli: {
    readonly command: string;
    readonly stateRoot?: string;
    readonly ephemeral: boolean;
    readonly localEncryptionKey?: string;
    readonly codexAuthJsonPath?: string;
    readonly claudeTokenEnv?: string;
    readonly model: string;
    readonly reasoningEffort: typeof activeReaderSummaryReasoningEffort;
  };
};

export const resolveAgentRuntimeSettings = (
  env: NodeJS.ProcessEnv,
): AgentRuntimeSettings => ({
  bindAddress: nonEmptyOrFallback(env.AGENT_RUNTIME_GRPC_BIND, "0.0.0.0:50052"),
  serviceToken: nonEmptyOptional(env.AGENT_RUNTIME_SERVICE_TOKEN),
  cli: {
    command: nonEmptyOrFallback(
      env.AGENT_RUNTIME_CLI_PATH,
      "apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs",
    ),
    stateRoot: resolveStateRoot(env),
    ephemeral: parseBoolean(env.AGENT_RUNTIME_EPHEMERAL),
    localEncryptionKey: resolveLocalEncryptionKey(env),
    codexAuthJsonPath: nonEmptyOptional(
      env.AGENT_RUNTIME_CODEX_AUTH_JSON_PATH ?? env.CODEX_AUTH_JSON_PATH,
    ),
    claudeTokenEnv: nonEmptyOrFallback(
      env.AGENT_RUNTIME_CLAUDE_TOKEN_ENV,
      "CLAUDE_CODE_OAUTH_TOKEN",
    ),
    model: nonEmptyOrFallback(env.AGENT_RUNTIME_MODEL, "gpt-5.6-sol"),
    reasoningEffort: resolveReasoningEffort(env.AGENT_RUNTIME_REASONING_EFFORT),
  },
});

const resolveReasoningEffort = (
  value: string | undefined,
): typeof activeReaderSummaryReasoningEffort => {
  const resolved = nonEmptyOrFallback(
    value,
    activeReaderSummaryReasoningEffort,
  );
  if (resolved !== activeReaderSummaryReasoningEffort) {
    throw new Error(
      "AGENT_RUNTIME_REASONING_EFFORT must be high for production runtime admission",
    );
  }

  return resolved;
};

const nonEmptyOrFallback = (
  value: string | undefined,
  fallback: string,
): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

const nonEmptyOptional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const parseBoolean = (value: string | undefined): boolean =>
  value === "1" || value?.toLowerCase() === "true";

const resolveStateRoot = (env: NodeJS.ProcessEnv): string => {
  const configured = nonEmptyOptional(
    env.AGENT_RUNTIME_STATE_ROOT ?? env.SUBSCRIPTION_RUNTIME_STATE_ROOT,
  );
  if (configured !== undefined) {
    return configured;
  }

  const stateHome = nonEmptyOrFallback(
    env.XDG_STATE_HOME,
    join(homedir(), ".local", "state"),
  );
  return join(stateHome, "social-monitor", "subscription-runtime");
};

const resolveLocalEncryptionKey = (
  env: NodeJS.ProcessEnv,
): string | undefined => {
  const inlineKey = nonEmptyOptional(
    env.SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY,
  );
  if (inlineKey !== undefined) {
    return inlineKey;
  }

  const keyFile = nonEmptyOptional(
    env.AGENT_RUNTIME_LOCAL_ENCRYPTION_KEY_FILE ??
      env.SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY_FILE,
  );
  if (keyFile === undefined) {
    return undefined;
  }

  const fileValue = readFileSync(keyFile, "utf8").trim();
  if (fileValue.length === 0) {
    throw new Error(
      `Agent runtime local encryption key file is empty: ${keyFile}`,
    );
  }

  return fileValue;
};
