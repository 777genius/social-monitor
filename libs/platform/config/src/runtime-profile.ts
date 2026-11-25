import { z } from 'zod';

const runtimeProfileSchema = z.enum(['local-dev', 'deterministic-test', 'beta']);
const nodeEnvSchema = z.enum(['development', 'test', 'staging', 'production']).default('development');

export type RuntimeProfile = z.infer<typeof runtimeProfileSchema>;

export type RuntimeProfileValidation = {
  readonly runtimeProfile: RuntimeProfile;
  readonly nodeEnv: 'development' | 'test' | 'staging' | 'production';
  readonly durableRequired: boolean;
  readonly violations: readonly string[];
};

export type RuntimeModeGuardOptions<TMode extends string> = {
  readonly env: NodeJS.ProcessEnv;
  readonly settingName: string;
  readonly selectedMode: TMode;
  readonly durableModes: readonly TMode[];
};

export const resolveRuntimeProfile = (env: NodeJS.ProcessEnv): RuntimeProfile => {
  const configuredProfile = env.SOCIAL_MONITOR_RUNTIME_PROFILE;

  if (configuredProfile !== undefined) {
    return runtimeProfileSchema.parse(configuredProfile);
  }

  const nodeEnv = nodeEnvSchema.parse(env.NODE_ENV);
  if (nodeEnv === 'test') {
    return 'deterministic-test';
  }

  if (nodeEnv === 'staging' || nodeEnv === 'production') {
    return 'beta';
  }

  return 'local-dev';
};

export const validateRuntimeProfile = (env: NodeJS.ProcessEnv): RuntimeProfileValidation => {
  const nodeEnv = nodeEnvSchema.parse(env.NODE_ENV);
  const runtimeProfile = resolveRuntimeProfile(env);
  const violations: string[] = [];

  if (runtimeProfile === 'local-dev' && nodeEnv !== 'development') {
    violations.push('local-dev runtime profile is allowed only with NODE_ENV=development');
  }

  if (runtimeProfile === 'deterministic-test' && nodeEnv !== 'test') {
    violations.push('deterministic-test runtime profile is allowed only with NODE_ENV=test');
  }

  if ((nodeEnv === 'staging' || nodeEnv === 'production') && runtimeProfile !== 'beta') {
    violations.push(`${nodeEnv} runtime must use SOCIAL_MONITOR_RUNTIME_PROFILE=beta`);
  }

  return {
    runtimeProfile,
    nodeEnv,
    durableRequired: runtimeProfile === 'beta',
    violations,
  };
};

export const assertRuntimeProfileAllowsMode = <TMode extends string>({
  env,
  settingName,
  selectedMode,
  durableModes,
}: RuntimeModeGuardOptions<TMode>): void => {
  const validation = validateRuntimeProfile(env);

  if (validation.violations.length > 0) {
    throw new Error(`Invalid runtime profile: ${validation.violations.join('; ')}`);
  }

  if (!validation.durableRequired || durableModes.includes(selectedMode)) {
    return;
  }

  const allowedModes = durableModes.map((mode) => `"${mode}"`).join(' or ');
  throw new Error(
    `${settingName}=${selectedMode} is not allowed when SOCIAL_MONITOR_RUNTIME_PROFILE=beta; use ${allowedModes}`,
  );
};
