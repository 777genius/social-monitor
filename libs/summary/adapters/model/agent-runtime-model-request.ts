export const buildAgentRuntimeRequestId = (
  purpose: string,
  tenantId: unknown,
  workspaceId: unknown,
  scope: string,
  requestedAt: Date,
): string =>
  [purpose, tenantId, workspaceId, scope, requestedAt.toISOString()]
    .map((part) => String(part).replace(/[^a-zA-Z0-9:._-]+/gu, "_"))
    .join(":")
    .slice(0, 240);

export const nonEmptyOrFallback = (
  value: string | undefined,
  fallback: string,
): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

export const positiveIntegerOrFallback = (
  value: number | undefined,
  fallback: number,
): number =>
  Number.isInteger(value) && value !== undefined && value > 0
    ? value
    : fallback;

export const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
