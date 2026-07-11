#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parse as parseDotenv } from "dotenv";

const allowedEnvKeys = [
  "AGENT_RUNTIME_GRPC_BIND",
  "AGENT_RUNTIME_SERVICE_TOKEN",
  "AGENT_RUNTIME_CLI_PATH",
  "AGENT_RUNTIME_STATE_ROOT",
  "SUBSCRIPTION_RUNTIME_STATE_ROOT",
  "AGENT_RUNTIME_EPHEMERAL",
  "AGENT_RUNTIME_LOCAL_ENCRYPTION_KEY_FILE",
  "SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY",
  "SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY_FILE",
  "AGENT_RUNTIME_CODEX_AUTH_JSON_PATH",
  "CODEX_AUTH_JSON_PATH",
  "AGENT_RUNTIME_CLAUDE_TOKEN_ENV",
  "AGENT_RUNTIME_MODEL",
  "AGENT_RUNTIME_REASONING_EFFORT",
];

const env = { ...process.env };
const fileEnv = readLocalEnv();
for (const key of allowedEnvKeys) {
  if (env[key] === undefined && fileEnv[key] !== undefined) {
    env[key] = fileEnv[key];
  }
}

const defaultCodexAuthPath = join(homedir(), ".codex", "auth.json");
if (
  env.AGENT_RUNTIME_CODEX_AUTH_JSON_PATH === undefined &&
  env.CODEX_AUTH_JSON_PATH === undefined &&
  existsSync(defaultCodexAuthPath)
) {
  env.AGENT_RUNTIME_CODEX_AUTH_JSON_PATH = defaultCodexAuthPath;
}

const child = spawn(
  process.execPath,
  [
    "-r",
    "ts-node/register",
    "-r",
    "tsconfig-paths/register",
    "apps/agent-runtime/src/main.ts",
  ],
  { env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error(`Agent runtime failed to start: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal === null ? 1 : 0);
});

function readLocalEnv() {
  if (!existsSync(".env")) {
    return {};
  }

  return parseDotenv(readFileSync(".env"));
}
