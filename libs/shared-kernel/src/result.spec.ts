import { err, isErr, isOk, ok } from './result';

describe('Result', () => {
  it('represents successful values explicitly', () => {
    const result = ok({ id: 'topic-1' });

    expect(isOk(result)).toBe(true);
    expect(result.value.id).toBe('topic-1');
  });

  it('represents errors explicitly', () => {
    const result = err('validation.failed');

    expect(isErr(result)).toBe(true);
    expect(result.error).toBe('validation.failed');
  });
});
