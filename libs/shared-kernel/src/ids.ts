type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export type TenantId = Brand<string, 'TenantId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type UserId = Brand<string, 'UserId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;
export type CausationId = Brand<string, 'CausationId'>;
export type EventId = Brand<string, 'EventId'>;

const nonEmpty = (value: string, label: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must be non-empty`);
  }

  return trimmed;
};

export const tenantId = (value: string): TenantId => nonEmpty(value, 'TenantId') as TenantId;
export const workspaceId = (value: string): WorkspaceId => nonEmpty(value, 'WorkspaceId') as WorkspaceId;
export const userId = (value: string): UserId => nonEmpty(value, 'UserId') as UserId;
export const correlationId = (value: string): CorrelationId =>
  nonEmpty(value, 'CorrelationId') as CorrelationId;
export const causationId = (value: string): CausationId => nonEmpty(value, 'CausationId') as CausationId;
export const eventId = (value: string): EventId => nonEmpty(value, 'EventId') as EventId;
