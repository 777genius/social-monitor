import {
  nonEmptyOrFallback,
  nonNegativeNumberOrFallback,
  parseNonNegativeNumber,
  parsePositiveInteger,
  positiveIntegerOrFallback,
} from './openai-responses-summary-option-values';
import {
  nonEmptyOrFallback as legacyNonEmpty,
  parsePositiveInteger as legacyPositiveInteger,
  parseNonNegativeNumber as legacyNonNegativeNumber,
} from './openai-responses-summary-json';

describe('OpenAI summary configuration value boundary', () => {
  it('preserves legacy export identity for existing consumers', () => {
    expect(legacyNonEmpty).toBe(nonEmptyOrFallback);
    expect(legacyPositiveInteger).toBe(parsePositiveInteger);
    expect(legacyNonNegativeNumber).toBe(parseNonNegativeNumber);
  });

  it('uses the same trimmed-string fallback policy for model options', () => {
    expect(nonEmptyOrFallback('  model-id  ', 'default')).toBe('model-id');
    expect(nonEmptyOrFallback('   ', 'default')).toBe('default');
    expect(nonEmptyOrFallback(undefined, 'default')).toBe('default');
  });

  it('retains strict positive integer and nonnegative finite constructor bounds', () => {
    expect(positiveIntegerOrFallback(3, 7)).toBe(3);
    for (const invalid of [undefined, 0, -1, 1.5, Infinity, NaN]) {
      expect(positiveIntegerOrFallback(invalid, 7)).toBe(7);
    }
    expect(nonNegativeNumberOrFallback(0, 7)).toBe(0);
    expect(nonNegativeNumberOrFallback(2.5, 7)).toBe(2.5);
    for (const invalid of [undefined, -1, NaN, Infinity]) {
      expect(nonNegativeNumberOrFallback(invalid, 7)).toBe(7);
    }
  });

  it('preserves environment-string parsing without silently clamping zero', () => {
    expect(parsePositiveInteger('9')).toBe(9);
    expect(parsePositiveInteger('0')).toBeUndefined();
    expect(parsePositiveInteger('2.5')).toBeUndefined();
    expect(parsePositiveInteger(undefined)).toBeUndefined();
    expect(parseNonNegativeNumber('0')).toBe(0);
    expect(parseNonNegativeNumber('0.25')).toBe(0.25);
    expect(parseNonNegativeNumber(' ')).toBe(0);
    expect(parseNonNegativeNumber('-1')).toBeUndefined();
    expect(parseNonNegativeNumber(undefined)).toBeUndefined();
  });
});
