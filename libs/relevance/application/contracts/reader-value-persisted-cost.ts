/**
 * `reader_value_assessments.cost_usd` is DECIMAL(20,10). Keep the value in
 * attempt diagnostics and the aggregate at precisely that scale so a valid
 * provider amount cannot make the database accounting guard disagree with
 * the value PostgreSQL persists.
 */
export const READER_VALUE_PERSISTED_COST_SCALE = 10;
const largestPersistedCostUsd = 10_000_000_000;

export const normalizeReaderValuePersistedCostUsd = (
  costUsd: number | null,
): number | null => {
  if (costUsd === null || !Number.isFinite(costUsd) || costUsd < 0) return null;
  const rounded = Number(costUsd.toFixed(READER_VALUE_PERSISTED_COST_SCALE));
  return Number.isFinite(rounded) && rounded >= 0 && rounded < largestPersistedCostUsd
    ? rounded
    : null;
};
