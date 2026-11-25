export type DomainErrorCode =
  | 'validation.failed'
  | 'authorization.denied'
  | 'tenant.scope_missing'
  | 'resource.not_found'
  | 'operation.conflict'
  | 'operation.backpressure'
  | 'operation.quota_exceeded'
  | 'operation.rate_limited'
  | 'external.dependency_unavailable';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
