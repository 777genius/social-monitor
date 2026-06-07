import { safeLabelValue } from './safe-label';

export type LogFields = Readonly<Record<string, string | number | boolean | undefined>>;

export interface StructuredLogger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export const formatLogMessage = (message: string, fields: LogFields = {}): string => {
  const entries = Object.entries(fields)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${formatLogValue(key, value)}`);

  return entries.length === 0 ? message : `${message} ${entries.join(' ')}`;
};

const REDACTED = '[REDACTED]';

const secretKeyPattern = /(?:secret|token|password|credential|authorization|api[_-]?key|refresh[_-]?token|access[_-]?token)/i;
const bearerPattern = /^bearer\s+\S+/i;
const generatedSecretPattern = /^(?:smk|whsec)_[A-Za-z0-9_-]+/;
const urlWithPasswordPattern = /^[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:[^@\s]+@/i;

const formatLogValue = (key: string, value: string | number | boolean): string => {
  if (secretKeyPattern.test(key)) {
    return REDACTED;
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  if (
    bearerPattern.test(value) ||
    generatedSecretPattern.test(value) ||
    urlWithPasswordPattern.test(value)
  ) {
    return REDACTED;
  }

  return safeLabelValue(value);
};
