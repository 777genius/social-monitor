import assert from "node:assert/strict";
import test from "node:test";
import { buildComposeOverride, nonEmptyEnvValue } from "../lib/docker-backend-evidence-compose-config.mjs";

const names = [
  "SOCIAL_MONITOR_CORS_ORIGINS", "REDDIT_APP_CLIENT_ID", "REDDIT_APP_CLIENT_SECRET",
  "REDDIT_APP_USER_AGENT", "OPENAI_API_KEY", "OPENAI_RESPONSES_ENDPOINT_URL",
  "DOCKER_BACKEND_EVIDENCE_OPENAI_SUMMARY_MODEL",
  "DOCKER_BACKEND_EVIDENCE_OPENAI_READER_SUMMARY_MODEL",
  "DOCKER_BACKEND_EVIDENCE_OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS",
  "OPENAI_SUMMARY_PROMPT_VERSION", "OPENAI_SUMMARY_TIMEOUT_MS",
  "OPENAI_SUMMARY_MAX_OUTPUT_TOKENS", "OPENAI_READER_SUMMARY_TIMEOUT_MS",
  "OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS", "INFINITY_CONTEXT_URL",
  "INFINITY_CONTEXT_TOKEN", "SUMMARY_MEMORY_FAILURE_MODE", "SUMMARY_MEMORY_TIMEOUT_MS",
];
const values = {
  issuer: "https://auth.internal.invalid/realms/main",
  audience: "api-audience",
  jwksJson: '{"keys":[]}',
  sourceConfigEncryptionKey: "redacted",
  sourceCredentialSecretEncryptionKey: "redacted",
  webhookSecretEncryptionKey: "redacted",
  hostStorageRoot: undefined,
};
function inEnv(env, run) {
  const backup = new Map(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) {
      if (Object.hasOwn(env, name) && env[name] !== undefined) {
        process.env[name] = env[name];
      } else {
        delete process.env[name];
      }
    }
    return run();
  } finally {
    for (const [name, original] of backup) {
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    }
  }
}
const render = (env = {}, options = values) => inEnv(env, () => buildComposeOverride(options));
test("default compose override has the five original application services", () => {
  const yaml = render();
  for (const service of ["api", "ingestion-worker", "intelligence-worker", "delivery-service", "event-relay"]) {
    assert.ok(yaml.includes("  " + service + ":\n    environment:"));
  }
});
test("app authentication and encryption values remain explicitly mapped", () => {
  const yaml = render();
  assert.ok(yaml.includes('SOCIAL_MONITOR_OIDC_ISSUER: "https://auth.internal.invalid/realms/main"'));
  assert.ok(yaml.includes('SOCIAL_MONITOR_OIDC_AUDIENCE: "api-audience"'));
  assert.ok(yaml.includes('SOURCE_CONFIG_ENCRYPTION_KEY: "redacted"'));
  assert.ok(yaml.includes('DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY: "redacted"'));
});
test("fixed acceleration timings remain limited to four worker services", () => {
  const yaml = render();
  assert.equal(yaml.split("INGESTION_SCAN_SCHEDULER_INTERVAL_MS: \"1000\"").length-1, 4);
  assert.equal(yaml.split("EVENT_RELAY_INTERVAL_MS: \"500\"").length-1, 4);
});
test("default OpenAI models and reader output cap survive extraction", () => {
  const yaml = render();
  assert.equal(yaml.split('OPENAI_SUMMARY_MODEL: "gpt-4.1-mini"').length-1, 5);
  assert.equal(yaml.split('OPENAI_READER_SUMMARY_MODEL: "gpt-4.1-mini"').length-1, 5);
  assert.equal(yaml.split('OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS: "8000"').length-1, 5);
});
test("explicit summary model is reused by reader when no reader override exists", () => {
  const yaml = render({ DOCKER_BACKEND_EVIDENCE_OPENAI_SUMMARY_MODEL: "model-custom" });
  assert.ok(yaml.includes('OPENAI_SUMMARY_MODEL: "model-custom"'));
  assert.ok(yaml.includes('OPENAI_READER_SUMMARY_MODEL: "model-custom"'));
});
test("reader-specific model overrides summary model", () => {
  const yaml = render({
    DOCKER_BACKEND_EVIDENCE_OPENAI_SUMMARY_MODEL: "base-model",
    DOCKER_BACKEND_EVIDENCE_OPENAI_READER_SUMMARY_MODEL: "reader-model",
  });
  assert.ok(yaml.includes('OPENAI_SUMMARY_MODEL: "base-model"'));
  assert.ok(yaml.includes('OPENAI_READER_SUMMARY_MODEL: "reader-model"'));
});
test("reader output cap priority is dedicated environment then ordinary env then default", () => {
  for (const [env, expected] of [
    [{ OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS: "900" }, "900"],
    [{ OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS: "900", DOCKER_BACKEND_EVIDENCE_OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS: "1000" }, "1000"],
    [{}, "8000"],
  ]) {
    assert.ok(render(env).includes('OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS: "' + expected + '"'));
  }
});
test("empty optional memory environment omits all memory services", () => {
  const yaml = render();
  assert.ok(!yaml.includes("SUMMARY_MEMORY_MODE:"));
  assert.ok(!yaml.includes("INFINITY_CONTEXT_TOKEN:"));
});
test("missing memory token must reject a URL-only configuration", () => {
  assert.throws(() => render({ INFINITY_CONTEXT_URL: "http://localhost:7070" }),
    /INFINITY_CONTEXT_URL and INFINITY_CONTEXT_TOKEN must be set together/);
});
test("missing memory URL must reject a token-only configuration", () => {
  assert.throws(() => render({ INFINITY_CONTEXT_TOKEN: "redacted" }),
    /INFINITY_CONTEXT_URL and INFINITY_CONTEXT_TOKEN must be set together/);
});
test("local memory URL maps to the Docker host preserving explicit port and scheme", () => {
  const yaml = render({ INFINITY_CONTEXT_URL: "http://localhost:7070/", INFINITY_CONTEXT_TOKEN: "redacted" });
  assert.ok(yaml.includes('INFINITY_CONTEXT_URL: "http://host.docker.internal:7070"'));
  assert.equal(yaml.split('SUMMARY_MEMORY_MODE: "memo-stack"').length-1, 5);
});
test("remote HTTPS memory URL is retained and its trailing slash stripped", () => {
  const yaml = render({ INFINITY_CONTEXT_URL: "https://memory.internal.invalid/", INFINITY_CONTEXT_TOKEN: "redacted" });
  assert.ok(yaml.includes('INFINITY_CONTEXT_URL: "https://memory.internal.invalid"'));
});
test("unsupported memory URL scheme fails closed", () => {
  assert.throws(() => render({ INFINITY_CONTEXT_URL: "ftp://memory.invalid/", INFINITY_CONTEXT_TOKEN: "redacted" }),
    /must be an http\(s\) URL/);
});
test("invalid memory URL fails closed with original diagnostic", () => {
  assert.throws(() => render({ INFINITY_CONTEXT_URL: "not-a-url", INFINITY_CONTEXT_TOKEN: "redacted" }),
    /must be an http\(s\) URL/);
});
test("host-bound storage paths retain original service volume sections", () => {
  const yaml = render({}, { ...values, hostStorageRoot: "/var/tmp/docker-evidence" });
  for (const service of ["postgres", "redis", "rabbitmq"]) {
    assert.ok(yaml.includes("  " + service + ":\n    volumes:"));
  }
});
test("optional environment variables remain omitted when blank", () => {
  const yaml = render({ OPENAI_API_KEY: "  ", REDDIT_APP_CLIENT_ID: "" });
  assert.ok(!yaml.includes("OPENAI_API_KEY:"));
  assert.ok(!yaml.includes("REDDIT_APP_CLIENT_ID:"));
});
test("nonEmptyEnvValue trims nonempty values and returns undefined for blanks", () => {
  inEnv({ OPENAI_API_KEY: "  some-test-value " }, () => assert.equal(nonEmptyEnvValue("OPENAI_API_KEY"), "some-test-value"));
  inEnv({ OPENAI_API_KEY: "  " }, () => assert.equal(nonEmptyEnvValue("OPENAI_API_KEY"), undefined));
  inEnv({}, () => assert.equal(nonEmptyEnvValue("OPENAI_API_KEY"), undefined));
});
test("identical inputs render stable compose config across independent invocations", () => {
  assert.equal(render(), render());
});
