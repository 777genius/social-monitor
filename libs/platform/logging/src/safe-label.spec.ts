import { safeLabelValue, UNKNOWN_SAFE_LABEL } from './safe-label';

describe('safeLabelValue', () => {
  it('keeps low-cardinality safe label values', () => {
    expect(safeLabelValue('fake-source')).toBe('fake-source');
    expect(safeLabelValue('scan_request.manual')).toBe('scan_request.manual');
    expect(safeLabelValue('tenant:internal-1')).toBe('tenant:internal-1');
  });

  it('drops unsafe or high-cardinality label values', () => {
    expect(safeLabelValue('user@example.com')).toBe(UNKNOWN_SAFE_LABEL);
    expect(safeLabelValue('https://example.com/path?token=secret')).toBe(UNKNOWN_SAFE_LABEL);
    expect(safeLabelValue('prompt text with spaces')).toBe(UNKNOWN_SAFE_LABEL);
    expect(safeLabelValue('x'.repeat(65))).toBe(UNKNOWN_SAFE_LABEL);
    expect(safeLabelValue(undefined)).toBe(UNKNOWN_SAFE_LABEL);
  });
});
