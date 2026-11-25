import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { DomainError } from '@social-monitor/shared-kernel';

import {
  buildProblemRequestContext,
  publicProblemForException,
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

describe('publicProblemForException', () => {
  it('keeps DomainError responses in the stable problem-details contract', () => {
    const problem = publicProblemForException(new DomainError(
      'operation.rate_limited',
      'Provider rejected access_token=raw-token',
      { providerKey: 'reddit', authorization: 'Bearer smk_secret' },
    ));

    expect(problem).toEqual({
      type: 'https://social-monitor.local/problems/operation.rate_limited',
      title: 'Rate limit exceeded',
      status: 429,
      detail: 'Provider rejected access_token=[REDACTED]',
      code: 'operation.rate_limited',
      details: {
        providerKey: 'reddit',
        authorization: '[REDACTED]',
      },
    });
  });

  it('maps validation HttpException responses into redacted problem details', () => {
    const problem = publicProblemForException(new BadRequestException([
      'clientSecret should not exist',
      'Authorization: Bearer smk_secret',
    ]));

    const serialized = JSON.stringify(problem);

    expect(problem.code).toBe('validation.failed');
    expect(problem.status).toBe(400);
    expect(problem.type).toBe('https://social-monitor.local/problems/validation.failed');
    expect(problem.details).toEqual({
      messages: [
        'clientSecret should not exist',
        'Authorization=[REDACTED]',
      ],
    });
    expect(serialized).not.toContain('smk_secret');
    expect(serialized).not.toContain('Bearer');
  });

  it('hides unexpected server error messages from public responses', () => {
    const problem = publicProblemForException(new InternalServerErrorException(
      'databaseUrl=postgresql://user:password@localhost:5432/app',
    ));

    expect(problem).toEqual({
      type: 'https://social-monitor.local/problems/internal.unexpected',
      title: 'Internal server error',
      status: 500,
      detail: 'Unexpected server error',
      code: 'internal.unexpected',
      details: {},
    });
  });

  it('hides unknown error messages from public responses', () => {
    const problem = publicProblemForException(
      new Error('OPENAI_API_KEY=sk-secret should never be public'),
    );

    expect(problem).toEqual({
      type: 'https://social-monitor.local/problems/internal.unexpected',
      title: 'Internal server error',
      status: 500,
      detail: 'Unexpected server error',
      code: 'internal.unexpected',
      details: {},
    });
  });
});
