import { Metadata } from '@grpc/grpc-js';

export type GrpcRequestMetadataInput = {
  readonly correlationId: string;
  readonly serviceToken?: string;
};

export const createGrpcRequestMetadata = (
  input: GrpcRequestMetadataInput,
): Metadata => {
  const correlationId = input.correlationId.trim();
  if (correlationId.length === 0) {
    throw new Error('gRPC correlation id must be non-empty');
  }

  const metadata = new Metadata();
  metadata.set('x-correlation-id', correlationId);

  const serviceToken = input.serviceToken?.trim();
  if (serviceToken !== undefined && serviceToken.length > 0) {
    metadata.set('authorization', `Bearer ${serviceToken}`);
  }

  return metadata;
};
