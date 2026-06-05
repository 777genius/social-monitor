export type LogFields = Readonly<Record<string, string | number | boolean | undefined>>;

export interface StructuredLogger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export const formatLogMessage = (message: string, fields: LogFields = {}): string => {
  const entries = Object.entries(fields)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);

  return entries.length === 0 ? message : `${message} ${entries.join(' ')}`;
};
