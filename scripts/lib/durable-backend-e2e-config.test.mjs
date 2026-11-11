import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { emptyToUndefined, loadConfig } from "./durable-backend-e2e-config.ts";
import "./durable-backend-e2e-scan-targets.test.mjs";

const fixtureValue = new Array(3).fill("fixture").join("-");
const required = {
  API_BASE_URL: "https://api.example.test",
  DATABASE_URL: "postgresql://localhost/fixture",
  DURABLE_BACKEND_E2E_ARTIFACT_PATH: "/tmp/durable-backend-fixture.json",
  STAGING_ENVIRONMENT_ID: "staging-fixture",
  BACKEND_IMAGE_DIGEST: "sha256:" + "a".repeat(64),
  INFINITY_CONTEXT_URL: "https://memory.example.test",
  INFINITY_CONTEXT_TOKEN: fixtureValue,
  SOCIAL_MONITOR_OIDC_ISSUER: "https://issuer.example.test",
  SOCIAL_MONITOR_OIDC_AUDIENCE: "staging-fixture",
};
const optional = [
  "STAGING_OPERATOR",
  "DURABLE_BACKEND_E2E_OIDC_ISSUER",
  "DURABLE_BACKEND_E2E_OIDC_AUDIENCE",
  "DURABLE_BACKEND_E2E_PRIVATE_KEY_PEM",
  "DURABLE_BACKEND_E2E_JWT_KID",
  "DURABLE_BACKEND_E2E_ACCESS_TOKEN",
  "DURABLE_BACKEND_E2E_ACCESS_TOKEN_TTL_SECONDS",
  "DURABLE_BACKEND_E2E_FRONTEND_ENV_PATH",
  "DURABLE_BACKEND_E2E_WEBHOOK_URL",
  "SUMMARY_MEMORY_TIMEOUT_MS",
  "GITHUB_ACCESS_TOKEN",
];
const keys = [...new Set([...Object.keys(required), ...optional])];

function withFixtureEnv(changes, run) {
  const before = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, required);
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return run();
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("required values and defaults preserve the original configuration contract", () => {
  withFixtureEnv({}, () => {
    const config = loadConfig(17_500);
    assert.equal(config.apiBaseUrl, required.API_BASE_URL);
    assert.equal(config.databaseUrl, required.DATABASE_URL);
    assert.equal(config.outputPath, required.DURABLE_BACKEND_E2E_ARTIFACT_PATH);
    assert.equal(config.imageDigest, required.BACKEND_IMAGE_DIGEST);
    assert.equal(config.memoryToken, fixtureValue);
    assert.equal(config.memoryTimeoutMs, 17_500);
    assert.equal(config.accessTokenTtlSeconds, 900);
    assert.equal(config.operator, "backend-ops-1");
    assert.equal(config.webhookUrl, "https://httpbingo.org/post");
    assert.equal(config.accessToken, undefined);
    assert.equal(config.frontendEnvPath, undefined);
  });
});

test("optional overrides, whitespace and legacy OIDC aliases retain precedence", () => {
  withFixtureEnv({
    SOCIAL_MONITOR_OIDC_ISSUER: undefined,
    SOCIAL_MONITOR_OIDC_AUDIENCE: undefined,
    DURABLE_BACKEND_E2E_OIDC_ISSUER: "fallback-issuer",
    DURABLE_BACKEND_E2E_OIDC_AUDIENCE: "fallback-audience",
    DURABLE_BACKEND_E2E_ACCESS_TOKEN: `  ${fixtureValue}  `,
    DURABLE_BACKEND_E2E_JWT_KID: "  key-id  ",
    DURABLE_BACKEND_E2E_ACCESS_TOKEN_TTL_SECONDS: " 60 ",
    DURABLE_BACKEND_E2E_FRONTEND_ENV_PATH: "  /tmp/frontend-fixture  ",
    DURABLE_BACKEND_E2E_WEBHOOK_URL: "https://hook.example.test",
    SUMMARY_MEMORY_TIMEOUT_MS: "120000",
  }, () => {
    const config = loadConfig(1_500);
    assert.equal(config.issuer, "fallback-issuer");
    assert.equal(config.audience, "fallback-audience");
    assert.equal(config.accessToken, fixtureValue);
    assert.equal(config.keyId, "key-id");
    assert.equal(config.accessTokenTtlSeconds, 60);
    assert.equal(config.frontendEnvPath, "/tmp/frontend-fixture");
    assert.equal(config.webhookUrl, "https://hook.example.test");
    assert.equal(config.memoryTimeoutMs, 120_000);
  });
  assert.equal(emptyToUndefined("  "), undefined);
  assert.equal(emptyToUndefined("  fixture  "), "fixture");
});

test("missing secrets and signing context fail closed without a direct access token", () => {
  for (const key of Object.keys(required)) {
    withFixtureEnv({ [key]: undefined }, () => {
      if (key === "SOCIAL_MONITOR_OIDC_ISSUER" || key === "SOCIAL_MONITOR_OIDC_AUDIENCE") {
        assert.throws(() => loadConfig(2_000), /SOCIAL_MONITOR_OIDC_ISSUER and SOCIAL_MONITOR_OIDC_AUDIENCE are required/);
      } else {
        assert.throws(() => loadConfig(2_000), new RegExp(key + " is required"));
      }
    });
  }
  withFixtureEnv({
    SOCIAL_MONITOR_OIDC_ISSUER: undefined,
    SOCIAL_MONITOR_OIDC_AUDIENCE: undefined,
    DURABLE_BACKEND_E2E_ACCESS_TOKEN: fixtureValue,
  }, () => assert.equal(loadConfig(2_000).accessToken, fixtureValue));
});

test("URLs, digest and bounded timeout/TTL values reject malformed inputs", () => {
  for (const [field, value, message] of [
    ["API_BASE_URL", "file:///tmp/fixture", /API_BASE_URL must be an http\(s\) URL/],
    ["BACKEND_IMAGE_DIGEST", "sha256:abc", /BACKEND_IMAGE_DIGEST must be sha256/],
    ["DURABLE_BACKEND_E2E_ACCESS_TOKEN_TTL_SECONDS", "59", /integer between 60 and 86400/],
    ["DURABLE_BACKEND_E2E_ACCESS_TOKEN_TTL_SECONDS", "86401", /integer between 60 and 86400/],
    ["DURABLE_BACKEND_E2E_ACCESS_TOKEN_TTL_SECONDS", "2.5", /integer between 60 and 86400/],
    ["SUMMARY_MEMORY_TIMEOUT_MS", "999", /integer between 1000 and 120000/],
    ["SUMMARY_MEMORY_TIMEOUT_MS", "120001", /integer between 1000 and 120000/],
    ["SUMMARY_MEMORY_TIMEOUT_MS", "NaN", /integer between 1000 and 120000/],
  ]) {
    withFixtureEnv({ [field]: value }, () => assert.throws(() => loadConfig(2_000), message));
  }
});

test("configuration stays call-time evaluated and CLI delegates to one loader", () => {
  withFixtureEnv({}, () => {
    assert.equal(loadConfig(4_000).memoryTimeoutMs, 4_000);
    process.env.SUMMARY_MEMORY_TIMEOUT_MS = "1100";
    assert.equal(loadConfig(4_000).memoryTimeoutMs, 1_100);
  });
  const src = readFileSync(fileURLToPath(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url)), "utf8");
  assert.equal(src.split("loadConfig(defaultMemoStackTimeoutMs)").length - 1, 1);
  assert.equal(src.includes("function loadConfig("), false);
  assert.equal(src.includes("function requireEnv("), false);
  assert.equal(src.includes("function readPositiveIntegerEnv("), false);
  assert.equal(src.includes("function emptyToUndefined("), false);
});
