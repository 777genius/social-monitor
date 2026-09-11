import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { parseEnvFile, readEnvFile } from "./api-env-entrypoint.mjs";

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
