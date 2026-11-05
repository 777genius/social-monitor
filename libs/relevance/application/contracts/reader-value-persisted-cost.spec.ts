import { normalizeReaderValuePersistedCostUsd } from './reader-value-persisted-cost';

describe('normalizeReaderValuePersistedCostUsd', () => {
  it('uses the DECIMAL(20,10) precision for fractional provider cost', () => {
    expect(normalizeReaderValuePersistedCostUsd(0.0000123456789)).toBe(0.0000123457);
  });

  it('does not produce a value outside the database decimal range', () => {
    expect(normalizeReaderValuePersistedCostUsd(10_000_000_000)).toBeNull();
  });
});
