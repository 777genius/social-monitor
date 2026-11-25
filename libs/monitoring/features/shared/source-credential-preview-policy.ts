import {
  isSensitiveString,
  redactSensitiveText,
} from '@social-monitor/shared-kernel';

const fallbackPreview = 'configured';
const maxSafePreviewLength = 64;
const minimumSecretOverlapLength = 6;

export const previewFromSourceCredentialSecret = (
  configuredPreview: string | undefined,
  secret: Readonly<Record<string, unknown>>,
): string => {
  const trimmed = configuredPreview?.trim();
  if (
    trimmed !== undefined &&
    trimmed.length > 0 &&
    isSafeConfiguredPreview(trimmed, secret)
  ) {
    return trimmed.slice(0, maxSafePreviewLength);
  }

  return fallbackPreview;
};

const isSafeConfiguredPreview = (
  preview: string,
  secret: Readonly<Record<string, unknown>>,
): boolean => {
  if (isSensitiveString(preview) || redactSensitiveText(preview) !== preview) {
    return false;
  }

  const normalizedPreview = normalizePreviewComparable(preview);
  if (normalizedPreview.length < minimumSecretOverlapLength) {
    return true;
  }

  return !secretStringValues(secret).some((value) => {
    const normalizedSecret = normalizePreviewComparable(value);
    if (normalizedSecret.length < minimumSecretOverlapLength) {
      return false;
    }

    return (
      normalizedPreview.includes(normalizedSecret) ||
      normalizedSecret.includes(normalizedPreview)
    );
  });
};

const secretStringValues = (value: unknown): readonly string[] => {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed.length === 0 ? [] : [trimmed];
  }

  if (Array.isArray(value)) {
    return value.flatMap(secretStringValues);
  }

  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(secretStringValues);
  }

  return [];
};

const normalizePreviewComparable = (value: string): string =>
  value.trim().toLowerCase();
