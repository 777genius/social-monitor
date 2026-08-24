import assert from "node:assert/strict";
import test from "node:test";

import {
  admitSubscriptionRuntimeWrapperRequest,
  subscriptionOnlyCodexEnvironment,
} from "./subscription-runtime-purpose-model-policy.mjs";

test("MJS policy removes both schema-name fields for output_text", () => {
  const admission = admitSubscriptionRuntimeWrapperRequest({
    provider: "codex",
    request: {
      context: { purpose: "social_monitor.reader_summary.weekly.generate" },
      task: {
        outputSchemaName: "weekly-summary",
        controls: {
          outputSchemaName: "weekly-summary",
          responseFormat: "text",
        },
        metadata: { runtimeOutput: "output_text" },
      },
    },
  });
  const task = admission.canonicalRequest.task;

  assert.equal(Object.hasOwn(task, "outputSchemaName"), false);
  assert.equal(Object.hasOwn(task.controls, "outputSchemaName"), false);
  assert.equal(task.controls.responseFormat, "text");
  assert.equal(task.metadata.runtimeOutput, "output_text");
});

test("MJS policy preserves structured schema names", () => {
  const admission = admitSubscriptionRuntimeWrapperRequest({
    provider: "codex",
    request: {
      context: { purpose: "social_monitor.reader_summary.generate" },
      task: {
        outputSchemaName: "daily-summary",
        controls: {
          outputSchemaName: "daily-summary",
          outputSchema: { type: "object" },
          responseFormat: "json",
        },
        metadata: { runtimeOutput: "structured_output" },
      },
    },
  });
  const task = admission.canonicalRequest.task;

  assert.equal(task.outputSchemaName, "daily-summary");
  assert.equal(task.controls.outputSchemaName, "daily-summary");
  assert.deepEqual(task.controls.outputSchema, { type: "object" });
  assert.equal(task.controls.responseFormat, "json");
  assert.equal(task.metadata.runtimeOutput, "structured_output");
});

test("active v2 admits high, rejects xhigh, and frozen recovery admits xhigh", () => {
  const request = (purpose, reasoningEffort) => ({
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort,
    request: {
      context: { purpose },
      task: {
        controls: {
          model: "gpt-5.6-sol",
          reasoningEffort,
          outputSchema: { type: "object" },
          responseFormat: "json",
        },
        metadata: { reasoningEffort, runtimeOutput: "structured_output" },
      },
    },
  });

  assert.doesNotThrow(() => admitSubscriptionRuntimeWrapperRequest(
    request("social_monitor.reader_summary.generate.v2", "high"),
  ));
  assert.throws(
    () => admitSubscriptionRuntimeWrapperRequest(
      request("social_monitor.reader_summary.generate.v2", "xhigh"),
    ),
    /runtime reasoning effort conflicts with purpose policy/u,
  );
  assert.doesNotThrow(() => admitSubscriptionRuntimeWrapperRequest(
    request("social_monitor.reader_summary.generate", "xhigh"),
  ));
});

test("Codex subprocess environment admits only safe execution basics", () => {
  const safeEnvironment = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    LANG: "C.UTF-8",
    LANGUAGE: "en_US:en",
    LC_ALL: "C.UTF-8",
    LC_CTYPE: "C.UTF-8",
    LC_MESSAGES: "C.UTF-8",
    TMPDIR: "/tmp/runtime",
    TMP: "/tmp/runtime",
    TEMP: "/tmp/runtime",
    SSL_CERT_FILE: "/etc/ssl/certs/ca-certificates.crt",
    SSL_CERT_DIR: "/etc/ssl/certs",
    NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/private-ca.pem",
  };
  const injectedEnvironment = {
    ...safeEnvironment,
    DATABASE_URL: "postgresql://redacted.invalid/database",
    AGENT_RUNTIME_SERVICE_TOKEN: "redacted-service-token",
    SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY: "redacted-key",
    AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT: "/run/private/auth-pool",
    AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST: "current.json",
    CODEX_AUTH_JSON_PATH: "/run/private/auth.json",
    OPENAI_API_KEY: "redacted-api-key",
    AWS_ACCESS_KEY_ID: "redacted-access-key",
    SESSION_SECRET: "redacted-secret",
    PROVIDER_TOKEN: "redacted-token",
    DATABASE_PASSWORD: "redacted-password",
    CLIENT_CREDENTIAL_FILE: "/run/private/credential",
    CALLBACK_URL: "https://redacted.invalid/callback",
    HTTP_PROXY: "http://redacted.invalid:8080",
    HTTPS_PROXY: "http://redacted.invalid:8080",
    ALL_PROXY: "socks5://redacted.invalid:1080",
    NO_PROXY: "localhost",
    HOME: "/run/private/home",
    NODE_OPTIONS: "--require=/tmp/injected.cjs",
    LD_PRELOAD: "/tmp/injected.so",
    LC_SECRET: "redacted-locale-injection",
    PATH_URL: "https://redacted.invalid/path",
    __proto__: { polluted: true },
  };

  assert.deepEqual(
    subscriptionOnlyCodexEnvironment(injectedEnvironment),
    safeEnvironment,
  );
  assert.equal({}.polluted, undefined);
});
