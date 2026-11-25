export type SocialResearchGrpcSettings = {
  readonly bindAddress: string;
  readonly serviceToken?: string;
};

export const resolveSocialResearchGrpcSettings = (
  env: NodeJS.ProcessEnv,
): SocialResearchGrpcSettings => ({
  bindAddress: nonEmptyOrFallback(
    env.SOCIAL_RESEARCH_GRPC_BIND,
    '0.0.0.0:50053',
  ),
  serviceToken: nonEmptyOptional(env.SOCIAL_RESEARCH_GRPC_SERVICE_TOKEN),
});

const nonEmptyOrFallback = (
  value: string | undefined,
  fallback: string,
): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

const nonEmptyOptional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};
