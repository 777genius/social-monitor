import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { parseEnvFile, readEnvFile } from "./api-env-entrypoint.mjs";

// main() sets this process's own process.exitCode and registers signal
// handlers on it, so it can only be exercised safely as a real subprocess
// (spawning it in-process would corrupt the test runner's own exit status).
const entrypointPath = fileURLToPath(new URL("./api-env-entrypoint.mjs", import.meta.url));

test("parseEnvFile parses simple KEY=VALUE lines", () => {
  const env = parseEnvFile("PORT=3000\nNODE_ENV=production\n");
  assert.deepEqual(env, { PORT: "3000", NODE_ENV: "production" });
});

test("parseEnvFile skips blank lines and comments", () => {
  const env = parseEnvFile("\n# a comment\nPORT=3000\n\n#another\n");
  assert.deepEqual(env, { PORT: "3000" });
});

test("parseEnvFile strips matching single or double quotes", () => {
  const env = parseEnvFile('A="hello world"\nB=\'quoted value\'\nC=unquoted\n');
  assert.deepEqual(env, { A: "hello world", B: "quoted value", C: "unquoted" });
});

test("parseEnvFile preserves an empty value", () => {
  const env = parseEnvFile("EMPTY=\n");
  assert.deepEqual(env, { EMPTY: "" });
});

test("parseEnvFile preserves embedded equals signs in the value", () => {
  const env = parseEnvFile("DATABASE_URL=postgres://user:password@host/db?sslmode=verify-full\n");
  assert.equal(env.DATABASE_URL, "postgres://user:password@host/db?sslmode=verify-full");
});

test("parseEnvFile rejects a line with no separator", () => {
  assert.throws(() => parseEnvFile("NOT_KEY_VALUE\n"), SyntaxError);
});

test("parseEnvFile rejects an invalid key", () => {
  assert.throws(() => parseEnvFile("1BAD=value\n"), SyntaxError);
});

test("parseEnvFile rejects a duplicate key", () => {
  assert.throws(() => parseEnvFile("A=1\nA=2\n"), SyntaxError);
});

test("parseEnvFile never evaluates shell metacharacters in a value", () => {
  const env = parseEnvFile("CMD=$(rm -rf /)\n");
  assert.equal(env.CMD, "$(rm -rf /)");
});

test("readEnvFile reads and parses a real file from disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-api-env-entrypoint-test-"));
  try {
    const path = join(dir, "api.env");
    writeFileSync(path, "PORT=3000\n# comment\nNODE_ENV=production\n");
    assert.deepEqual(readEnvFile(path), { PORT: "3000", NODE_ENV: "production" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main() reports a clean error instead of an uncaught exception when the target command cannot be launched", () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-api-env-entrypoint-spawn-test-"));
  try {
    const envPath = join(dir, "api.env");
    writeFileSync(envPath, "PORT=3000\n");
    const result = spawnSync(process.execPath, [entrypointPath, "/definitely/does-not-exist-xyz"], {
      env: { ...process.env, SOCIAL_MONITOR_API_ENV_FILE: envPath },
      encoding: "utf8",
    });
    assert.equal(result.signal, null, "a launch failure must not crash the entrypoint itself");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /failed to launch/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main() forwards SIGTERM to the child and then actually terminates itself, instead of re-forwarding to a dead child forever", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-api-env-entrypoint-signal-test-"));
  try {
    const envPath = join(dir, "api.env");
    writeFileSync(envPath, "PORT=3000\n");
    const childScript = join(dir, "sleep.mjs");
    // No SIGTERM handler here on purpose: the child must actually be
    // terminated by the signal itself (reported to the entrypoint as
    // `(code=null, signal="SIGTERM")`), not catch it and exit with a code -
    // that is the exact branch this test exercises.
    writeFileSync(childScript, "console.log('child-ready');\nsetInterval(() => {}, 1000);\n");

    const proc = spawn(process.execPath, [entrypointPath, process.execPath, childScript], {
      env: { ...process.env, SOCIAL_MONITOR_API_ENV_FILE: envPath },
      stdio: ["ignore", "pipe", "ignore"],
    });

    // Wait for the grandchild's own readiness marker instead of a fixed
    // delay: a magic-number sleep here would be flaky under CI load (spawn
    // and the SIGTERM-listener registration racing an arbitrary timeout).
    await new Promise((resolve, reject) => {
      let buffered = "";
      const onData = (chunk) => {
        buffered += chunk.toString();
        if (buffered.includes("child-ready")) {
          proc.stdout.off("data", onData);
          resolve();
        }
      };
      proc.stdout.on("data", onData);
      proc.once("exit", (code, signal) => reject(new Error(`entrypoint exited early (code=${code}, signal=${signal}) before the child became ready`)));
    });
    proc.kill("SIGTERM");

    const exited = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 5000);
      proc.on("exit", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });

    assert.notEqual(exited, null, "the entrypoint must actually exit after SIGTERM, not hang re-forwarding to the now-dead child");
    assert.equal(exited.signal, "SIGTERM");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
