import { readFileSync } from "node:fs";

const compose = readFileSync("docker-compose.yml", "utf8").replaceAll(
  "\r\n",
  "\n",
);
const codexAuthCompose = readFileSync(
  "docker-compose.agent-runtime-codex.yml",
  "utf8",
).replaceAll("\r\n", "\n");
const productionAgentRuntimeCompose = readFileSync(
  "ops/deploy/production-runtime/compose.agent-runtime-model.yml",
  "utf8",
).replaceAll("\r\n", "\n");
const startAgentRuntime = readFileSync(
  "scripts/start-agent-runtime.mjs",
  "utf8",
).replaceAll("\r\n", "\n");
const envExample = readFileSync(".env.example", "utf8").replaceAll(
  "\r\n",
  "\n",
);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const violations = [];

const runtimeServices = [
  ["api", "api"],
  ["ingestion-worker", "ingestion"],
  ["intelligence-worker", "intelligence"],
  ["delivery-service", "delivery"],
  ["event-relay", "event-relay"],
];

const migrateBlock = serviceBlock("migrate");
if (migrateBlock.length === 0) {
  violations.push("docker-compose.yml missing runtime service migrate");
} else {
  if (!migrateBlock.includes("SERVICE: api")) {
    violations.push(
      "migrate must build the API image variant used for Prisma migration commands",
    );
  }

  if (!migrateBlock.includes("npm run migrate:deploy")) {
    violations.push(
      "migrate must run npm run migrate:deploy before app services start",
    );
  }

  if (!migrateBlock.includes("npm run seed")) {
    violations.push(
      "migrate must seed durable source catalog entries after migrations",
    );
  }

  if (
    !migrateBlock.includes("postgres:") ||
    !migrateBlock.includes("condition: service_healthy")
  ) {
    violations.push("migrate must wait for healthy postgres");
  }

  if (!migrateBlock.includes('profiles: ["app"]')) {
    violations.push("migrate must run behind the app profile");
  }
}

const otelCollectorBlock = serviceBlock("otel-collector");
for (const marker of [
  "${OTEL_COLLECTOR_IMAGE:-otel/opentelemetry-collector-contrib:0.157.0@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6}",
  "${OTEL_COLLECTOR_CONFIG_PATH:-./ops/observability/otel-collector.yml}:/etc/otelcol-contrib/config.yaml:ro",
  'expose: ["4318", "8889", "13133"]',
  'profiles: ["app"]',
  "restart: unless-stopped",
]) {
  if (!otelCollectorBlock.includes(marker)) {
    violations.push(`otel-collector missing runtime marker "${marker}"`);
  }
}
if (otelCollectorBlock.includes("\n    ports:")) {
  violations.push(
    "otel-collector telemetry endpoints must not be published on host ports",
  );
}

for (const [service, npmService] of runtimeServices) {
  const block = serviceBlock(service);

  if (block.length === 0) {
    violations.push(`docker-compose.yml missing runtime service ${service}`);
    continue;
  }

  if (
    !block.includes('profiles: ["app"]') &&
    !block.includes("<<: *app-common")
  ) {
    violations.push(
      `${service} must run behind the app profile/common runtime anchor`,
    );
  }

  if (!block.includes(`SERVICE: ${npmService}`)) {
    violations.push(
      `${service} must pass Docker build arg SERVICE: ${npmService}`,
    );
  }

  const startScript = `start:${npmService}`;
  if (!packageJson.scripts?.[startScript]) {
    violations.push(
      `package.json missing ${startScript} for runtime service ${service}`,
    );
  }
}

for (const marker of [
  "migrate:",
  "condition: service_completed_successfully",
  "SOCIAL_MONITOR_RUNTIME_PROFILE: beta",
  "MONITORING_PERSISTENCE: prisma",
  "MONITORING_SCAN_QUEUE: rabbitmq",
  "INGESTION_WORKER_PERSISTENCE: prisma",
  "RELEVANCE_PERSISTENCE: prisma",
  "INGESTION_SCAN_QUEUE_READER: rabbitmq",
  "SUMMARY_JOB_QUEUE_MODE: rabbitmq",
  "INTELLIGENCE_SUMMARY_QUEUE_READER: rabbitmq",
  "DELIVERY_ATTEMPT_DISPATCH_QUEUE: rabbitmq",
  "DELIVERY_ATTEMPT_QUEUE_READER: rabbitmq",
  "DELIVERY_ENABLED_CHANNELS: webhook",
  "DELIVERY_WEBHOOK_PROVIDER: http",
  "EVENT_RELAY_LOOP: enabled",
  "RABBITMQ_DEAD_LETTER_EXCHANGE: social-monitor.commands.dlx",
  "RABBITMQ_QUEUE_TYPE: quorum",
  'RABBITMQ_QUEUE_DELIVERY_LIMIT: "20"',
]) {
  if (!compose.includes(marker)) {
    violations.push(`docker-compose.yml missing runtime marker "${marker}"`);
  }
}

for (const marker of [
  "SOCIAL_MONITOR_RUNTIME_PROFILE=local-dev",
  "DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY=",
  "MONITORING_PERSISTENCE=",
  "RELEVANCE_PERSISTENCE=",
  "SUMMARY_JOB_QUEUE_MODE=",
  "INGESTION_SCAN_QUEUE_READER=",
  "INTELLIGENCE_SUMMARY_QUEUE_READER=",
  "DELIVERY_ENABLED_CHANNELS=",
  "DELIVERY_ATTEMPT_QUEUE_READER=",
]) {
  if (!envExample.includes(marker)) {
    violations.push(`.env.example missing runtime marker "${marker}"`);
  }
}

if (
  !String(packageJson.scripts?.verify ?? "").includes("check:runtime-compose")
) {
  violations.push("package.json verify must include check:runtime-compose");
}

if (envExample.includes("SOCIAL_MONITOR_RUNTIME_PROFILE=beta")) {
  violations.push(".env.example must default to local-dev, not beta");
}

for (const marker of [
  "agent-runtime:",
  "AGENT_RUNTIME_PROVIDER: codex",
  "AGENT_RUNTIME_CODEX_AUTH_JSON_PATH: /run/secrets/codex-auth.json",
  "${CODEX_AUTH_JSON_HOST_PATH:-${HOME}/.codex/auth.json}:/run/secrets/codex-auth.json:ro",
]) {
  if (!codexAuthCompose.includes(marker)) {
    violations.push(
      `docker-compose.agent-runtime-codex.yml missing marker "${marker}"`,
    );
  }
}

if (
  codexAuthCompose.includes("auth_token") ||
  codexAuthCompose.includes("CLAUDE_CODE_OAUTH_TOKEN=")
) {
  violations.push(
    "docker-compose.agent-runtime-codex.yml must not contain raw auth tokens",
  );
}

for (const marker of [
  'AGENT_RUNTIME_CODEX_AUTH_JSON_PATH: ""',
  'CODEX_AUTH_JSON_PATH: ""',
  "AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT: /run/social-monitor-codex-auth-pool",
  "AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST: /run/social-monitor-codex-auth-pool/current.json",
  "/var/data/social-monitor/auth-pool:/run/social-monitor-codex-auth-pool:ro",
]) {
  if (!productionAgentRuntimeCompose.includes(marker)) {
    violations.push(
      `production agent-runtime overlay missing marker "${marker}"`,
    );
  }
}

for (const marker of [
  '"AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT"',
  '"AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST"',
  "env.AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT === undefined",
  "env.AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST === undefined",
]) {
  if (!startAgentRuntime.includes(marker)) {
    violations.push(`start-agent-runtime missing auth-pool marker "${marker}"`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Runtime compose contract OK");

function serviceBlock(service) {
  const escapedService = service.replaceAll("-", "\\-");
  const match = compose.match(
    new RegExp(
      `\\n  ${escapedService}:\\n([\\s\\S]*?)(?=\\n  [a-z0-9-]+:|\\nvolumes:)`,
    ),
  );

  return match?.[1] ?? "";
}
