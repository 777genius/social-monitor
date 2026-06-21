import type { SourceConfigReaderPort, SourceRuntimeConfig } from '@social-monitor/ingestion/ports';
import { isSensitiveKey } from '@social-monitor/shared-kernel';
import type {
  SourceBindingConfig,
  SourceBindingConfigProtectorPort,
  SourceBindingRepositoryPort,
  SourceCredentialResolverPort,
} from '@social-monitor/monitoring/ports';

export class MonitoringSourceConfigReaderAdapter implements SourceConfigReaderPort {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly configProtector: SourceBindingConfigProtectorPort,
    private readonly sourceCredentials?: SourceCredentialResolverPort,
  ) {}

  async readConfig(
    params: Parameters<SourceConfigReaderPort['readConfig']>[0],
  ): Promise<SourceRuntimeConfig | null> {
    const binding = await this.sourceBindings.findById(params);

    if (binding === null) {
      return null;
    }

    const snapshot = binding.toSnapshot();
    const config = await this.configProtector.unprotect(snapshot.config as SourceBindingConfig);
    const credentialRef = readCredentialRef(config);
    if (credentialRef === undefined) {
      return toSourceRuntimeConfig(config);
    }

    if (this.sourceCredentials === undefined) {
      throw new Error('Source credential resolver is required for credentialRef source binding config');
    }

    assertNoInlineCredentialSecrets(config);

    const resolvedSecret = await this.sourceCredentials.resolve({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      sourceCredentialId: credentialRef.sourceCredentialId,
      providerKey: snapshot.providerKey,
    });
    if (!resolvedSecret.ok) {
      throw resolvedSecret.error;
    }

    return toSourceRuntimeConfig({
      ...resolvedSecret.value,
      ...stripCredentialRef(config),
    });
  }
}

const toSourceRuntimeConfig = (config: SourceBindingConfig): SourceRuntimeConfig =>
  Object.fromEntries(Object.entries(config).map(([key, value]) => [key, value]));

const readCredentialRef = (config: SourceBindingConfig): { readonly sourceCredentialId: string } | undefined => {
  const nested = config.credentialRef;
  if (isRecord(nested)) {
    const sourceCredentialId = readNonEmptyString(nested.sourceCredentialId ?? nested.id);
    if (sourceCredentialId !== undefined) {
      return { sourceCredentialId };
    }
  }

  const sourceCredentialId = readNonEmptyString(config.sourceCredentialId);

  return sourceCredentialId === undefined ? undefined : { sourceCredentialId };
};

const assertNoInlineCredentialSecrets = (config: SourceBindingConfig): void => {
  for (const [key, value] of Object.entries(stripCredentialRef(config))) {
    if (containsSensitiveConfigValue(key, value)) {
      throw new Error(`Source binding config with credentialRef must not include inline credential field: ${key}`);
    }
  }
};

const containsSensitiveConfigValue = (key: string, value: unknown): boolean => {
  if (isSensitiveKey(key)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveConfigValue(key, item));
  }

  if (isRecord(value)) {
    return Object.entries(value).some(([nestedKey, nestedValue]) =>
      containsSensitiveConfigValue(nestedKey, nestedValue));
  }

  return false;
};

const stripCredentialRef = (config: SourceBindingConfig): SourceBindingConfig => {
  const safeConfig = { ...config };
  delete safeConfig.credentialRef;
  delete safeConfig.sourceCredentialId;

  return safeConfig;
};

const readNonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
