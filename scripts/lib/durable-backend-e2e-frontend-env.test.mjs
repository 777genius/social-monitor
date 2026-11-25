import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { writeFrontendRuntimeEnvFile } from "./durable-backend-e2e-frontend-env.ts";

const config = { apiBaseUrl: "https://api.example.test" };
const auth = { tenantId: "tenant", workspaceId: "workspace", token: "token'with-single-quote" };
const ids = { runId: "run-123", userId: "user" };

test("omitted frontend path skips private output", () => {
  const original = console.log;
  const messages = [];
  try {
    console.log = (message) => messages.push(message);
    assert.equal(writeFrontendRuntimeEnvFile(config, auth, ids), undefined);
    assert.deepEqual(messages, []);
  } finally { console.log = original; }
});

test("relative and workspace-contained frontend paths fail closed before writing", () => {
  assert.throws(() => writeFrontendRuntimeEnvFile({ ...config, frontendEnvPath: "relative.env" }, auth, ids),
    /DURABLE_BACKEND_E2E_FRONTEND_ENV_PATH must be an absolute path/);
  assert.throws(() => writeFrontendRuntimeEnvFile({ ...config, frontendEnvPath: process.cwd() }, auth, ids),
    /DURABLE_BACKEND_E2E_FRONTEND_ENV_PATH must not be inside the git workspace/);
  const path = join(process.cwd(), "should-not-write-frontend.env");
  assert.throws(() => writeFrontendRuntimeEnvFile({ ...config, frontendEnvPath: path }, auth, ids),
    /DURABLE_BACKEND_E2E_FRONTEND_ENV_PATH must not be inside the git workspace/);
  assert.equal(existsSync(path), false);
});

test("output preserves original values, single-quote escaping, mode 0600 and safe log", () => {
  const dir = mkdtempSync(join(tmpdir(), "durable-frontend-env-"));
  const path = join(dir, "nested", "frontend.env");
  const original = console.log;
  const messages = [];
  try {
    console.log = (message) => messages.push(message);
    writeFrontendRuntimeEnvFile({ ...config, frontendEnvPath: path }, auth, ids);
    const lines = readFileSync(path, "utf8").split("\n");
    assert.deepEqual(lines.slice(0, 4), [
      "# Generated for local Marionette visual verification only.",
      "# Contains a short-lived backend JWT. Keep outside git and do not commit.",
      "SOCIAL_MONITOR_API_BASE_URL='https://api.example.test'",
      "SOCIAL_MONITOR_TENANT_ID='tenant'",
    ]);
    assert.equal(lines[4], "SOCIAL_MONITOR_WORKSPACE_ID='workspace'");
    assert.equal(lines[5], "SOCIAL_MONITOR_TENANT_NAME='tenant-run-123'");
    assert.equal(lines[6], "SOCIAL_MONITOR_WORKSPACE_NAME='workspace-run-123'");
    assert.equal(lines[7], "SOCIAL_MONITOR_WORKSPACE_ROLE='owner'");
    assert.equal(lines[8], "SOCIAL_MONITOR_USER_ID='user'");
    assert.equal(lines[9], "SOCIAL_MONITOR_USER_LABEL='MVP Operator'");
    assert.equal(lines[10], "SOCIAL_MONITOR_CORRELATION_ID='frontend-visual-run-123'");
    assert.equal(lines[11], "SOCIAL_MONITOR_API_BEARER_TOKEN='token'\\''with-single-quote'");
    assert.equal(lines[12], "");
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.deepEqual(messages, ["DURABLE_BACKEND_E2E_FRONTEND_ENV_PATH=" + path]);
    assert.equal(messages.join(" ").includes(auth.token), false);
  } finally { console.log = original; rmSync(dir, { recursive: true, force: true }); }
});

test("rewrites existing frontend file with mode 0600 and new token", () => {
  const dir = mkdtempSync(join(tmpdir(), "durable-frontend-env-replace-"));
  const path = join(dir, "frontend.env");
  const original = console.log;
  try {
    console.log = () => {};
    writeFrontendRuntimeEnvFile({ ...config, frontendEnvPath: path }, auth, ids);
    writeFrontendRuntimeEnvFile({ ...config, frontendEnvPath: path }, { ...auth, token: "updated" }, ids);
    assert.match(readFileSync(path, "utf8"), /SOCIAL_MONITOR_API_BEARER_TOKEN='updated'\n$/);
    assert.equal(statSync(path).mode & 0o777, 0o600);
  } finally { console.log = original; rmSync(dir, { recursive: true, force: true }); }
});

test("original runner retains delegation, removing duplicate formatter and path-checker owners", () => {
  const source = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  assert.match(source, /import \{ writeFrontendRuntimeEnvFile \} from "\.\/lib\/durable-backend-e2e-frontend-env"/);
  assert.match(source, /writeFrontendRuntimeEnvFile\(config, auth, ids\)/);
  assert.doesNotMatch(source, /function writeFrontendRuntimeEnvFile\(/);
  assert.doesNotMatch(source, /function validatePrivateOutOfWorkspacePath\(/);
  assert.doesNotMatch(source, /function shellQuote\(/);
});
