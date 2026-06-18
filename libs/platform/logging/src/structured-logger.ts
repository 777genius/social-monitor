import { REDACTED_VALUE, isSensitiveKey, isSensitiveString } from '@social-monitor/shared-kernel';

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

const formatLogValue = (key: string, value: string | number | boolean): string => {
  if (isSensitiveKey(key)) {
    return REDACTED_VALUE;
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  if (isSensitiveString(value)) {
    return REDACTED_VALUE;
  }

  return safeLabelValue(value);
};
