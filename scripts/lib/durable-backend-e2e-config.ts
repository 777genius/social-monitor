export type RunnerConfig = {
  readonly apiBaseUrl: string;
  readonly databaseUrl: string;
  readonly outputPath: string;
  readonly environmentId: string;
  readonly imageDigest: string;
  readonly operator: string;
  readonly issuer: string;
  readonly audience: string;
  readonly privateKeyPem?: string;
  readonly keyId?: string;
  readonly accessToken?: string;
  readonly accessTokenTtlSeconds: number;
  readonly frontendEnvPath?: string;
  readonly webhookUrl: string;
  readonly memoryBaseUrl: string;
  readonly memoryToken: string;
  readonly memoryTimeoutMs: number;
};


export function loadConfig(defaultMemoStackTimeoutMs: number): RunnerConfig {
  const apiBaseUrl = requireEnv("API_BASE_URL");
  const configValue: RunnerConfig = {
    apiBaseUrl,
    databaseUrl: requireEnv("DATABASE_URL"),
    outputPath: requireEnv("DURABLE_BACKEND_E2E_ARTIFACT_PATH"),
    environmentId: requireEnv("STAGING_ENVIRONMENT_ID"),
    imageDigest: requireEnv("BACKEND_IMAGE_DIGEST"),
    operator: process.env.STAGING_OPERATOR ?? "backend-ops-1",
    issuer:
      process.env.SOCIAL_MONITOR_OIDC_ISSUER ??
      process.env.DURABLE_BACKEND_E2E_OIDC_ISSUER ??
      "",
    audience:
      process.env.SOCIAL_MONITOR_OIDC_AUDIENCE ??
      process.env.DURABLE_BACKEND_E2E_OIDC_AUDIENCE ??
      "",
    privateKeyPem: emptyToUndefined(
      process.env.DURABLE_BACKEND_E2E_PRIVATE_KEY_PEM,
    ),
    keyId: emptyToUndefined(process.env.DURABLE_BACKEND_E2E_JWT_KID),
    accessToken: emptyToUndefined(process.env.DURABLE_BACKEND_E2E_ACCESS_TOKEN),
    accessTokenTtlSeconds: readPositiveIntegerEnv(
      "DURABLE_BACKEND_E2E_ACCESS_TOKEN_TTL_SECONDS",
      900,
      60,
      86_400,
    ),
    frontendEnvPath: emptyToUndefined(
      process.env.DURABLE_BACKEND_E2E_FRONTEND_ENV_PATH,
    ),
    webhookUrl:
      process.env.DURABLE_BACKEND_E2E_WEBHOOK_URL ??
      "https://httpbingo.org/post",
    memoryBaseUrl: requireEnv("INFINITY_CONTEXT_URL"),
    memoryToken: requireEnv("INFINITY_CONTEXT_TOKEN"),
    memoryTimeoutMs: readPositiveIntegerEnv(
      "SUMMARY_MEMORY_TIMEOUT_MS",
      defaultMemoStackTimeoutMs,
      1_000,
      120_000,
    ),
  };

  if (!/^https?:\/\//.test(configValue.apiBaseUrl)) {
    throw new Error("API_BASE_URL must be an http(s) URL");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(configValue.imageDigest)) {
    throw new Error("BACKEND_IMAGE_DIGEST must be sha256:<64 hex chars>");
  }
  if (
    configValue.accessToken === undefined &&
    (configValue.issuer.trim() === "" || configValue.audience.trim() === "")
  ) {
    throw new Error(
      "SOCIAL_MONITOR_OIDC_ISSUER and SOCIAL_MONITOR_OIDC_AUDIENCE are required when signing runner JWTs",
    );
  }

  return configValue;
}


function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
}


export function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}


function readPositiveIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }

  return parsed;
}

