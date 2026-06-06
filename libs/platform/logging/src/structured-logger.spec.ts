import { formatLogMessage } from './structured-logger';

describe('formatLogMessage', () => {
  it('formats stable key value fields', () => {
    expect(
      formatLogMessage('worker started', {
        service: 'ingestion-worker',
        retry: 2,
        ready: true,
        omitted: undefined,
      }),
    ).toBe('worker started service=ingestion-worker retry=2 ready=true');
  });

  it('redacts secret-like field names', () => {
    expect(
      formatLogMessage('auth failed', {
        authorization: 'Bearer smk_secret',
        apiKey: 'smk_key',
        refreshToken: 'refresh-token',
        webhookSecret: 'whsec_secret',
      }),
    ).toBe('auth failed authorization=[REDACTED] apiKey=[REDACTED] refreshToken=[REDACTED] webhookSecret=[REDACTED]');
  });

  it('redacts secret-like string values even when field names are generic', () => {
    expect(
      formatLogMessage('request failed', {
        header: 'Bearer smk_secret',
        generatedApiKey: 'smk_abc123',
        webhookSigningKey: 'whsec_abc123',
        databaseUrl: 'postgresql://user:password@localhost:5432/app',
      }),
    ).toBe('request failed header=[REDACTED] generatedApiKey=[REDACTED] webhookSigningKey=[REDACTED] databaseUrl=[REDACTED]');
  });
});
