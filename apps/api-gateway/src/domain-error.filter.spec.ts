import { redactProblemDetails } from './domain-error.filter';

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
