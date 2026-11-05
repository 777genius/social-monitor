export type XCollectorRuntimeConfig = {
  readonly address: string;
  readonly timeoutMs: number;
  readonly serviceToken?: string;
};

// A multi-pass collection can take two minutes before ranking and returning.
// Keep the RPC bounded while allowing that result to reach the scan caller.
export const DEFAULT_X_COLLECTOR_GRPC_TIMEOUT_MS = 180_000;

export const resolveXCollectorRuntimeConfig = (
  env: NodeJS.ProcessEnv,
): XCollectorRuntimeConfig | null => {
  if (!isXCollectorRuntimeEnabled(env)) {
    return null;
  }

  const address = env.X_COLLECTOR_GRPC_ADDRESS?.trim();
  if (address === undefined || address.length === 0) {
    return null;
  }

  return {
    address,
    timeoutMs: readPositiveEnvInteger(
      env.X_COLLECTOR_GRPC_TIMEOUT_MS,
      DEFAULT_X_COLLECTOR_GRPC_TIMEOUT_MS,
    ),
    serviceToken: readOptionalEnvString(env.X_COLLECTOR_SERVICE_TOKEN),
  };
};

export const isXCollectorRuntimeConfigured = (
  env: NodeJS.ProcessEnv,
): boolean => resolveXCollectorRuntimeConfig(env) !== null;

const isXCollectorRuntimeEnabled = (env: NodeJS.ProcessEnv): boolean =>
  env.X_COLLECTOR_ENABLED === '1' ||
  env.X_COLLECTOR_EXPERIMENTAL_ENABLED === '1';

const readPositiveEnvInteger = (
  value: string | undefined,
  fallback: number,
): number => {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const readOptionalEnvString = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};
