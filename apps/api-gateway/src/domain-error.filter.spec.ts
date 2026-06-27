import {
  buildProblemRequestContext,
  redactProblemDetail,
  redactProblemDetails,
} from './domain-error.filter';

describe('redactProblemDetail', () => {
  it('redacts inline credentials from public problem messages', () => {
    const detail = redactProblemDetail(
      'Provider rejected access_token=raw-token and Authorization: Bearer smk_secret',
    );

    expect(detail).toContain('[REDACTED]');
    expect(detail).not.toContain('raw-token');
    expect(detail).not.toContain('smk_secret');
    expect(detail).not.toContain('Bearer');
  });
});

describe('redactProblemDetails', () => {
  it('redacts secret-like keys and values recursively before returning problem details', () => {
    const details = redactProblemDetails({
      sourceBindingId: 'source-binding-1',
      authorization: 'Bearer smk_secret',
      nested: {
        apiToken: 'raw-token',
        safe: 'visible',
      },
      attempts: [
        {
          webhookSecret: 'whsec_secret',
        },
      ],
      databaseUrl: 'postgresql://user:password@localhost:5432/app',
    });

    expect(details).toEqual({
      sourceBindingId: 'source-binding-1',
      authorization: '[REDACTED]',
      nested: {
        apiToken: '[REDACTED]',
        safe: 'visible',
      },
      attempts: [
        {
          webhookSecret: '[REDACTED]',
        },
      ],
      databaseUrl: '[REDACTED]',
    });
  });
});

describe('buildProblemRequestContext', () => {
  it('prefers already-normalized response headers from request context middleware', () => {
    const context = buildProblemRequestContext({
      header: jest.fn(() => 'unsafe request fallback'),
    }, {
      getHeader: jest.fn((name: string) => ({
        'x-request-id': 'request-1',
        'x-correlation-id': 'correlation-1',
        'x-causation-id': 'causation-1',
      })[name]),
    });

    expect(context).toEqual({
      requestId: 'request-1',
      correlationId: 'correlation-1',
      causationId: 'causation-1',
    });
  });

  it('normalizes request headers and ignores unsafe values before public errors expose trace ids', () => {
    const context = buildProblemRequestContext({
      header: jest.fn((name: string) => ({
        'x-request-id': 'request-from-client',
        'x-correlation-id': 'contains spaces',
        'x-causation-id': 'x'.repeat(129),
      })[name]),
    }, {
      getHeader: jest.fn(() => undefined),
    });

    expect(context.requestId).toBe('request-from-client');
    expect(context.correlationId).toBe('request-from-client');
    expect(context.causationId).toBeUndefined();
  });
});
