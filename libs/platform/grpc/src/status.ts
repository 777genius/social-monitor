import { status, type ServiceError } from '@grpc/grpc-js';

export type GrpcStatusCode = number;

export const grpcStatusCodeOf = (error: unknown): GrpcStatusCode | undefined => {
  if (isServiceError(error)) {
    return error.code;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number'
  ) {
    return error.code;
  }

  return undefined;
};

export const isGrpcRetryableStatus = (code: GrpcStatusCode | undefined): boolean =>
  code === status.DEADLINE_EXCEEDED ||
  code === status.RESOURCE_EXHAUSTED ||
  code === status.UNAVAILABLE ||
  code === status.UNKNOWN ||
  code === status.INTERNAL;

const isServiceError = (error: unknown): error is ServiceError =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  'details' in error;
