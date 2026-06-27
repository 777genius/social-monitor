import type { Clock } from '@social-monitor/shared-kernel';

export const createGrpcDeadline = (
  clock: Clock,
  timeoutMs: number,
): Date => {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('gRPC timeout must be a positive integer in milliseconds');
  }

  return new Date(clock.now().getTime() + timeoutMs);
};
