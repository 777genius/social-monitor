import { status } from '@grpc/grpc-js';

import {
  createGrpcDeadline,
  createGrpcRequestMetadata,
  grpcStatusCodeOf,
  isGrpcRetryableStatus,
} from './index';

describe('platform grpc helpers', () => {
  it('creates deadlines from injected clock', () => {
    const deadline = createGrpcDeadline({
      now: () => new Date('2026-06-27T00:00:00.000Z'),
    }, 1_500);

    expect(deadline.toISOString()).toBe('2026-06-27T00:00:01.500Z');
  });

  it('creates request metadata without leaking empty authorization headers', () => {
    const metadata = createGrpcRequestMetadata({
      correlationId: 'corr-1',
      serviceToken: '   ',
    });

    expect(metadata.get('x-correlation-id')).toEqual(['corr-1']);
    expect(metadata.get('authorization')).toEqual([]);
  });

  it('classifies retryable gRPC status codes', () => {
    expect(isGrpcRetryableStatus(status.UNAVAILABLE)).toBe(true);
    expect(isGrpcRetryableStatus(status.UNAUTHENTICATED)).toBe(false);
    expect(grpcStatusCodeOf({
      code: status.RESOURCE_EXHAUSTED,
      details: 'limited',
    })).toBe(status.RESOURCE_EXHAUSTED);
  });
});
