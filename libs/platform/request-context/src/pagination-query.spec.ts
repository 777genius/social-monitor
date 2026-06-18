import { DomainError } from '@social-monitor/shared-kernel';

import { parseOptionalPaginationLimit, parsePaginationLimit } from './pagination-query';

describe('parsePaginationLimit', () => {
  it('uses the configured default for missing or blank values', () => {
    expect(parsePaginationLimit(undefined, { defaultLimit: 20 })).toBe(20);
    expect(parsePaginationLimit('   ', { defaultLimit: 50 })).toBe(50);
  });

  it('parses bounded integer values', () => {
    expect(parsePaginationLimit('1', { defaultLimit: 20 })).toBe(1);
    expect(parsePaginationLimit('100', { defaultLimit: 20 })).toBe(100);
  });

  it('rejects unsafe values at the transport boundary', () => {
    for (const value of ['0', '101', '1.5', '-1', 'abc', 'Infinity']) {
      expect(() => parsePaginationLimit(value, { defaultLimit: 20 })).toThrow(DomainError);
    }
  });

  it('uses explicit public validation messages when provided', () => {
    expect(() => parsePaginationLimit('0', {
      defaultLimit: 20,
      invalidMessage: 'Feed page limit must be between 1 and 100',
    })).toThrow('Feed page limit must be between 1 and 100');
  });
});

describe('parseOptionalPaginationLimit', () => {
  it('keeps missing optional limits undefined', () => {
    expect(parseOptionalPaginationLimit(undefined)).toBeUndefined();
    expect(parseOptionalPaginationLimit(' ')).toBeUndefined();
  });

  it('uses custom field names in validation errors', () => {
    expect(() => parseOptionalPaginationLimit('200', { fieldName: 'pageLimit' })).toThrow(
      'pageLimit must be an integer between 1 and 100',
    );
  });
});
