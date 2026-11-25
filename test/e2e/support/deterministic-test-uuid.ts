import { createHash } from 'node:crypto';

/**
 * Keeps readable fixture seeds while exercising the same UUID boundary used by
 * PostgreSQL tenant isolation.
 */
export const deterministicTestUuid = (seed: string): string => {
  const hex = createHash('sha256').update(seed).digest('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
};
