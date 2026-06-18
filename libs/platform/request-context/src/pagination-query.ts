import { DomainError } from '@social-monitor/shared-kernel';

export type PaginationLimitOptions = {
  readonly defaultLimit: number;
  readonly maxLimit?: number;
  readonly fieldName?: string;
  readonly invalidMessage?: string;
};

export type OptionalPaginationLimitOptions = {
  readonly maxLimit?: number;
  readonly fieldName?: string;
  readonly invalidMessage?: string;
};

const DEFAULT_MAX_LIMIT = 100;

export const parsePaginationLimit = (
  value: string | undefined,
  options: PaginationLimitOptions,
): number => {
  const parsed = parseLimit(value, {
    defaultLimit: options.defaultLimit,
    maxLimit: options.maxLimit ?? DEFAULT_MAX_LIMIT,
    fieldName: options.fieldName ?? 'limit',
    invalidMessage: options.invalidMessage,
  });

  return parsed ?? options.defaultLimit;
};

export const parseOptionalPaginationLimit = (
  value: string | undefined,
  options: OptionalPaginationLimitOptions = {},
): number | undefined => parseLimit(value, {
    defaultLimit: undefined,
    maxLimit: options.maxLimit ?? DEFAULT_MAX_LIMIT,
    fieldName: options.fieldName ?? 'limit',
    invalidMessage: options.invalidMessage,
  });

const parseLimit = (
  value: string | undefined,
  options: {
    readonly defaultLimit: number | undefined;
    readonly maxLimit: number;
    readonly fieldName: string;
    readonly invalidMessage?: string;
  },
): number | undefined => {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0) {
    return options.defaultLimit;
  }

  if (!/^[0-9]+$/.test(normalized)) {
    throw invalidLimit(options);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > options.maxLimit) {
    throw invalidLimit(options);
  }

  return parsed;
};

const invalidLimit = (options: {
  readonly fieldName: string;
  readonly maxLimit: number;
  readonly invalidMessage?: string;
}): DomainError =>
  new DomainError(
    'validation.failed',
    options.invalidMessage ?? `${options.fieldName} must be an integer between 1 and ${options.maxLimit}`,
  );
