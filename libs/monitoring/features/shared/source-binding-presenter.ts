import type { SourceBinding, SourceBindingProps } from '../../domain';

export type SourceBindingConfigPreviewValue =
  | string
  | number
  | boolean
  | null
  | readonly SourceBindingConfigPreviewValue[]
  | { readonly [key: string]: SourceBindingConfigPreviewValue };

export type SourceBindingConfigPreview = Readonly<Record<string, SourceBindingConfigPreviewValue>>;

export type SourceBindingView = Omit<SourceBindingProps, 'config' | 'createdAt'> & {
  readonly configPreview: SourceBindingConfigPreview;
  readonly createdAt: string;
};

export const presentSourceBinding = (binding: SourceBinding): SourceBindingView => {
  const snapshot = binding.toSnapshot();

  return {
    id: snapshot.id,
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    topicId: snapshot.topicId,
    providerKey: snapshot.providerKey,
    capabilityProfileVersion: snapshot.capabilityProfileVersion,
    status: snapshot.status,
    configPreview: previewConfig(snapshot.config),
    createdAt: snapshot.createdAt.toISOString(),
  };
};

const previewConfig = (config: Readonly<Record<string, unknown>>): SourceBindingConfigPreview =>
  Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, previewConfigValue(value)]),
  );

const previewConfigValue = (value: unknown): SourceBindingConfigPreviewValue => {
  if (isEncryptedConfigValue(value)) {
    return {
      encrypted: true,
      algorithm: value.algorithm,
    };
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(previewConfigValue);
  }

  if (typeof value === 'object') {
    return previewConfig(value as Readonly<Record<string, unknown>>);
  }

  return String(value);
};

const isEncryptedConfigValue = (value: unknown): value is {
  readonly encrypted: true;
  readonly algorithm: string;
  readonly keyId: string;
} =>
  typeof value === 'object' &&
  value !== null &&
  (value as { readonly encrypted?: unknown }).encrypted === true &&
  typeof (value as { readonly algorithm?: unknown }).algorithm === 'string' &&
  typeof (value as { readonly keyId?: unknown }).keyId === 'string';
