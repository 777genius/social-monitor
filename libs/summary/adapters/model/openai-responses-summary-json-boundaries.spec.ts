import {
  asRecord, normalizeStringArray, requiredArray, requiredNumber,
  requiredRecord, requiredString,
} from './openai-responses-summary-required-json';
import {
  normalizeOptionalStringArray, optionalNonNegativeInteger, optionalString,
} from './openai-responses-summary-optional-json';
import {
  requiredString as legacyRequiredString,
  optionalString as legacyOptionalString,
  normalizeOptionalStringArray as legacyOptionalArray,
  asRecord as legacyAsRecord,
} from './openai-responses-summary-json';

describe('OpenAI summary JSON trust-boundary ownership', () => {
  it('preserves legacy export function identity', () => {
    expect(legacyRequiredString).toBe(requiredString);
    expect(legacyOptionalString).toBe(optionalString);
    expect(legacyOptionalArray).toBe(normalizeOptionalStringArray);
    expect(legacyAsRecord).toBe(asRecord);
  });

  it('rejects malformed required fields with indexed diagnostics', () => {
    expect(requiredString('  title  ', 'headline')).toBe('title');
    expect(() => requiredString('  ', 'headline')).toThrow('headline must be a non-empty string');
    expect(() => requiredString(4, 'headline')).toThrow('headline must be a non-empty string');
    expect(() => requiredNumber(NaN, 'score')).toThrow('score must be a finite number');
    expect(() => requiredNumber(Infinity, 'score')).toThrow('score must be a finite number');
    expect(() => requiredArray({}, 'citations')).toThrow('citations must be an array');
    expect(() => requiredRecord([], 'citation')).toThrow('citation must be an object');
    expect(normalizeStringArray([' a ', 'b'], 'citations')).toEqual(['a', 'b']);
    expect(() => normalizeStringArray(['a', null], 'citations'))
      .toThrow('citations[1] must be a non-empty string');
  });

  it('preserves optional absence policy without accepting malformed supplied values', () => {
    expect(optionalString(undefined)).toBeUndefined();
    expect(optionalString(null)).toBeUndefined();
    expect(optionalString('   ')).toBeUndefined();
    expect(optionalString('  keep  ')).toBe('keep');
    expect(() => optionalString(0)).toThrow('Optional summary string value must be a string');
    expect(normalizeOptionalStringArray(undefined)).toBeUndefined();
    expect(normalizeOptionalStringArray(null)).toBeUndefined();
    expect(normalizeOptionalStringArray(['  one  '])).toEqual(['one']);
    expect(() => normalizeOptionalStringArray([false]))
      .toThrow('optionalStringArray[0] must be a non-empty string');
    expect(optionalNonNegativeInteger(0)).toBe(0);
    expect(optionalNonNegativeInteger(2)).toBe(2);
    for (const invalid of [-1, 1.5, NaN, Infinity, '2']) {
      expect(optionalNonNegativeInteger(invalid)).toBeUndefined();
    }
  });
});
