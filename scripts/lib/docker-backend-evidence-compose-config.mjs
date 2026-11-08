import { URL } from "node:url";
import { hostBindStorageServiceSections, serviceEnvironment } from "./docker-backend-evidence-compose-render.mjs";

const DEFAULT_DOCKER_EVIDENCE_OPENAI_SUMMARY_MODEL = "gpt-4.1-mini";
const DEFAULT_DOCKER_EVIDENCE_OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS = "8000";

// Compose environment configuration stays separate from Docker lifecycle orchestration.
export function buildComposeOverride(values) {
  const commonEnvironment = [
    ["SOCIAL_MONITOR_OIDC_ISSUER", values.issuer],
    ["SOCIAL_MONITOR_OIDC_AUDIENCE", values.audience],
    ["SOCIAL_MONITOR_OIDC_JWKS_JSON", values.jwksJson],
    ["SOURCE_CONFIG_ENCRYPTION_KEY", values.sourceConfigEncryptionKey],
    [
      "SOURCE_CREDENTIAL_SECRET_ENCRYPTION_KEY",
      values.sourceCredentialSecretEncryptionKey,
    ],
    [
      "DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY",
      values.webhookSecretEncryptionKey,
    ],
    [
      "SOCIAL_MONITOR_CORS_ORIGINS",
      process.env.SOCIAL_MONITOR_CORS_ORIGINS,
    ],
    ["SUBSCRIPTIONS_PERSISTENCE", "prisma"],
    ["REDDIT_APP_CLIENT_ID", process.env.REDDIT_APP_CLIENT_ID],
    ["REDDIT_APP_CLIENT_SECRET", process.env.REDDIT_APP_CLIENT_SECRET],
    ["REDDIT_APP_USER_AGENT", process.env.REDDIT_APP_USER_AGENT],
    ["SUMMARY_MODEL_PROVIDER", "openai-responses"],
    ["READER_SUMMARY_MODEL_PROVIDER", "openai-responses"],
    ["OPENAI_API_KEY", process.env.OPENAI_API_KEY],
    ["OPENAI_RESPONSES_ENDPOINT_URL", process.env.OPENAI_RESPONSES_ENDPOINT_URL],
    ["OPENAI_SUMMARY_MODEL", dockerEvidenceOpenAiSummaryModel()],
    [
      "OPENAI_SUMMARY_PROMPT_VERSION",
      process.env.OPENAI_SUMMARY_PROMPT_VERSION,
    ],
    ["OPENAI_SUMMARY_TIMEOUT_MS", process.env.OPENAI_SUMMARY_TIMEOUT_MS],
    [
      "OPENAI_SUMMARY_MAX_OUTPUT_TOKENS",
      process.env.OPENAI_SUMMARY_MAX_OUTPUT_TOKENS,
    ],
    [
      "OPENAI_READER_SUMMARY_MODEL",
      dockerEvidenceOpenAiReaderSummaryModel(),
    ],
    [
      "OPENAI_READER_SUMMARY_TIMEOUT_MS",
      process.env.OPENAI_READER_SUMMARY_TIMEOUT_MS,
    ],
    [
      "OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS",
      dockerEvidenceOpenAiReaderSummaryMaxOutputTokens(),
    ],
    ...memoStackEnvironmentEntries(),
  ];
  const fastLoopEnvironment = [
    ...commonEnvironment,
    ["INGESTION_SCAN_SCHEDULER_INTERVAL_MS", "1000"],
    ["INGESTION_SCAN_QUEUE_DRAIN_INTERVAL_MS", "500"],
    ["INTELLIGENCE_AUTO_SUMMARY_SCHEDULER", "enabled"],
    ["INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_INTERVAL_MS", "1000"],
    ["INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_MIN_FEED_AGE_MS", "2000"],
    ["INTELLIGENCE_SUMMARY_QUEUE_DRAIN_INTERVAL_MS", "500"],
    ["DELIVERY_ATTEMPT_QUEUE_DRAIN_INTERVAL_MS", "500"],
    ["DELIVERY_SUMMARY_READY_EVENT_DRAIN_INTERVAL_MS", "500"],
    ["DELIVERY_DIGEST_SCHEDULER_INTERVAL_MS", "1000"],
    ["DELIVERY_ATTEMPT_DISPATCH_INTERVAL_MS", "1000"],
    ["EVENT_RELAY_INTERVAL_MS", "500"],
  ];

  return [
    "services:",
    ...hostBindStorageServiceSections(values.hostStorageRoot),
    serviceEnvironment("api", commonEnvironment),
    serviceEnvironment("ingestion-worker", fastLoopEnvironment),
    serviceEnvironment("intelligence-worker", fastLoopEnvironment),
    serviceEnvironment("delivery-service", fastLoopEnvironment),
    serviceEnvironment("event-relay", fastLoopEnvironment),
    "",
  ].join("\n");
}

function memoStackEnvironmentEntries() {
  const baseUrl = nonEmptyEnvValue("INFINITY_CONTEXT_URL");
  const token = nonEmptyEnvValue("INFINITY_CONTEXT_TOKEN");
  if (baseUrl === undefined && token === undefined) {
    return [];
  }
  if (baseUrl === undefined || token === undefined) {
    throw new Error(
      "INFINITY_CONTEXT_URL and INFINITY_CONTEXT_TOKEN must be set together for Docker backend evidence memory mode",
    );
  }

  return [
    ["SUMMARY_MEMORY_MODE", "memo-stack"],
    [
      "SUMMARY_MEMORY_FAILURE_MODE",
      process.env.SUMMARY_MEMORY_FAILURE_MODE ?? "fail",
    ],
    [
      "INFINITY_CONTEXT_URL",
      dockerReachableHttpUrl(baseUrl, "INFINITY_CONTEXT_URL"),
    ],
    ["INFINITY_CONTEXT_TOKEN", token],
    [
      "SUMMARY_MEMORY_TIMEOUT_MS",
      process.env.SUMMARY_MEMORY_TIMEOUT_MS ?? "30000",
    ],
  ];
}

function dockerEvidenceOpenAiSummaryModel() {
  return (
    nonEmptyEnvValue("DOCKER_BACKEND_EVIDENCE_OPENAI_SUMMARY_MODEL") ??
    DEFAULT_DOCKER_EVIDENCE_OPENAI_SUMMARY_MODEL
  );
}

function dockerEvidenceOpenAiReaderSummaryModel() {
  return (
    nonEmptyEnvValue("DOCKER_BACKEND_EVIDENCE_OPENAI_READER_SUMMARY_MODEL") ??
    dockerEvidenceOpenAiSummaryModel()
  );
}

function dockerEvidenceOpenAiReaderSummaryMaxOutputTokens() {
  return (
    nonEmptyEnvValue(
      "DOCKER_BACKEND_EVIDENCE_OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS",
    ) ??
    nonEmptyEnvValue("OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS") ??
    DEFAULT_DOCKER_EVIDENCE_OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS
  );
}

export function nonEmptyEnvValue(name) {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function dockerReachableHttpUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an http(s) URL`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${name} must be an http(s) URL`);
  }
  if (["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    url.hostname = "host.docker.internal";
  }

  return url.toString().replace(/\/$/u, "");
}

