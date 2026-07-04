import { readFileSync } from "node:fs";

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
    readonly model?: string;
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
      "node_modules/.bin/subscription-runtime-run-agent-task",
    ),
    stateRoot: nonEmptyOptional(env.AGENT_RUNTIME_STATE_ROOT),
    ephemeral: parseBoolean(env.AGENT_RUNTIME_EPHEMERAL),
    localEncryptionKey: resolveLocalEncryptionKey(env),
    codexAuthJsonPath: nonEmptyOptional(
      env.AGENT_RUNTIME_CODEX_AUTH_JSON_PATH ?? env.CODEX_AUTH_JSON_PATH,
    ),
    claudeTokenEnv: nonEmptyOrFallback(
      env.AGENT_RUNTIME_CLAUDE_TOKEN_ENV,
      "CLAUDE_CODE_OAUTH_TOKEN",
    ),
    model: nonEmptyOptional(env.AGENT_RUNTIME_MODEL),
  },
});

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
