export function requiredSummaryFeedbackEnv(name: string, value = process.env[name]): string {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0) {
    throw new Error(`${name} is required.${summaryFeedbackDatabaseHint(name)}`);
  }
  return normalized;
}

export function formatSummaryFeedbackRuntimeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!isDatabaseAccessFailure(message)) {
    return message;
  }

  return [
    message,
    '',
    'Summary feedback export could not access DATABASE_URL.',
    'Check that DATABASE_URL points at the intended Postgres instance.',
    'For local Docker, use the mapped port from: docker compose port postgres 5432',
    'If host Postgres also listens on 5432, start compose with a free port, for example: POSTGRES_PORT=55432 docker compose up -d postgres rabbitmq',
  ].join('\n');
}

function summaryFeedbackDatabaseHint(name: string): string {
  if (name !== 'DATABASE_URL') {
    return '';
  }

  return [
    '',
    ' Provide a Postgres URL through the runtime secret/env boundary.',
    ' For local Docker, use the mapped port from: docker compose port postgres 5432.',
    ' If host Postgres also listens on 5432, start compose with a free port, for example: POSTGRES_PORT=55432 docker compose up -d postgres rabbitmq.',
  ].join('');
}

function isDatabaseAccessFailure(message: string): boolean {
  return (
    message.includes('DatabaseAccessDenied')
    || message.includes('User was denied access on the database')
    || /role ".+" does not exist/.test(message)
  );
}
