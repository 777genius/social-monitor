export const UNKNOWN_SAFE_LABEL = 'unknown';

const MAX_SAFE_LABEL_LENGTH = 64;
const safeLabelPattern = /^[A-Za-z0-9._:-]+$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const urlPattern = /^[a-z][a-z0-9+.-]*:\/\//i;

export const safeLabelValue = (value: string | undefined): string => {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.length === 0 || trimmed.length > MAX_SAFE_LABEL_LENGTH) {
    return UNKNOWN_SAFE_LABEL;
  }

  if (emailPattern.test(trimmed) || urlPattern.test(trimmed)) {
    return UNKNOWN_SAFE_LABEL;
  }

  return safeLabelPattern.test(trimmed) ? trimmed : UNKNOWN_SAFE_LABEL;
};
