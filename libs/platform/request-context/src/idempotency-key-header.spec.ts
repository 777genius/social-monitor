import { DomainError } from '@social-monitor/shared-kernel';

import { requireIdempotencyKeyHeader } from './idempotency-key-header';

describe('requireIdempotencyKeyHeader', () => {
  it('normalizes a present idempotency key', () => {
    expect(requireIdempotencyKeyHeader('  request-1  ')).toBe('request-1');
  });

  it.each([undefined, '', '   '])('rejects missing idempotency key %#', (value) => {
    expect(() => requireIdempotencyKeyHeader(value)).toThrow(DomainError);
  });
});
