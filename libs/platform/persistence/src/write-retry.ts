export type PrismaWriteRetryOptions = {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
};

const defaultMaxAttempts = 3;
const defaultBaseDelayMs = 25;
const retryablePrismaCodes = new Set(['P2034']);
const retryablePostgresSqlStates = new Set(['40001', '40P01']);

export const withPrismaWriteRetry = async <TValue>(
  operation: () => Promise<TValue>,
  options: PrismaWriteRetryOptions = {},
): Promise<TValue> => {
  const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;
  const baseDelayMs = options.baseDelayMs ?? defaultBaseDelayMs;
  const sleep = options.sleep ?? delay;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('Prisma write retry maxAttempts must be a positive integer');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryablePrismaWriteConflict(error) || attempt === maxAttempts) {
        throw error;
      }

      await sleep(baseDelayMs * attempt);
    }
  }

  throw new Error('Prisma write retry exhausted unexpectedly');
};

export const isRetryablePrismaWriteConflict = (error: unknown): boolean =>
  hasRetryableWriteConflictCode(error);

const hasRetryableWriteConflictCode = (error: unknown, depth = 0): boolean => {
  if (depth > 2 || typeof error !== 'object' || error === null) {
    return false;
  }

  const code = String((error as { readonly code?: unknown }).code ?? '');
  if (retryablePrismaCodes.has(code) || retryablePostgresSqlStates.has(code)) {
    return true;
  }

  return hasRetryableWriteConflictCode((error as { readonly cause?: unknown }).cause, depth + 1);
};

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
