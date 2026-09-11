#!/usr/bin/env node
/**
 * Thin container entrypoint: read a newline-delimited KEY=VALUE env file
 * without `eval` or shell sourcing, then exec the real API process with
 * that environment merged in. Parsing lives in `parseEnvFile` (SRP) so it
 * can be unit-tested without ever spawning a process.
 *
 * The env file format matches a conservative dotenv subset: `KEY=value`
 * lines, optional single/double-quoted values, `#` comment lines, and blank
 * lines. No variable expansion, no command substitution, no multi-line
 * values - anything else is a hard parse error rather than a silent guess.
 */

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/**
 * @param {string} contents raw env file contents.
 * @returns {Record<string, string>}
 */
export function parseEnvFile(contents) {
  const env = {};
  const lines = contents.split(/\r\n|\n|\r/u);
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      throw new SyntaxError(`api-env-entrypoint: malformed line ${index + 1}: expected KEY=VALUE`);
    }
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1);
    if (!KEY_PATTERN.test(key)) {
      throw new SyntaxError(`api-env-entrypoint: invalid env key on line ${index + 1}: ${JSON.stringify(key)}`);
    }
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    if (Object.hasOwn(env, key)) {
      throw new SyntaxError(`api-env-entrypoint: duplicate env key on line ${index + 1}: ${JSON.stringify(key)}`);
    }
    env[key] = value;
  }
  return env;
}

/**
 * @param {string} path
 * @returns {Record<string, string>}
 */
export function readEnvFile(path) {
  return parseEnvFile(readFileSync(path, "utf8"));
}

function main(argv) {
  const envFilePath = process.env.SOCIAL_MONITOR_API_ENV_FILE ?? "/run/social-monitor/api.env";
  const fileEnv = readEnvFile(envFilePath);
  const mergedEnv = { ...process.env, ...fileEnv };
  const [command, ...commandArgs] = argv;
  if (!command) {
    process.stderr.write("api-env-entrypoint: no command supplied to exec\n");
    process.exitCode = 64;
    return;
  }
  const child = spawn(command, commandArgs, { env: mergedEnv, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => child.kill(signal));
  }
}

const isMainModule = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) {
  main(process.argv.slice(2));
}
