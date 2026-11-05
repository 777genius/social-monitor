import { readerValueLabels, validateReaderValueAnswers } from './reader-value-assessment';

function answers(): Record<string, unknown> {
  return Object.fromEntries(Object.entries(readerValueLabels).map(([criterion, labels]) => [criterion, {
    choice: labels[0], confidence: 0.7,
    probabilities: Object.fromEntries(labels.map((label, index) => [label, index === 0 ? 1 : 0])),
  }]));
}

describe('reader-value assessment', () => {
  it('keeps provider choice when it differs from argmax and confidence', () => {
    const input = answers();
    input.usefulness = {
      choice: 'useful', confidence: 0.9,
      probabilities: { noise: 0, context: 0.6, useful: 0.4, important: 0, insufficient_context: 0 },
    };
    const result = validateReaderValueAnswers(input);
    expect(result.ok && result.value.usefulness).toMatchObject({
      choice: 'useful', confidence: 0.9, choiceDiffersFromArgmax: true, probabilityTie: false,
    });
  });

  it('accepts a tie without replacing the choice', () => {
    const input = answers();
    input.usefulness = {
      choice: 'useful', confidence: 0.3,
      probabilities: { noise: 0, context: 0.5, useful: 0.5, important: 0, insufficient_context: 0 },
    };
    const result = validateReaderValueAnswers(input);
    expect(result.ok && result.value.usefulness).toMatchObject({ choice: 'useful', probabilityTie: true });
  });

  it('rejects persisted diagnostic flags that contradict the full distribution', () => {
    const input = answers();
    input.usefulness = { ...(input.usefulness as object),
      choiceDiffersFromArgmax: true, probabilityTie: true };
    expect(validateReaderValueAnswers(input)).toEqual({
      ok: false, error: 'invalid_answer',
    });
  });

  it.each([NaN, Infinity, -0.1, 1.1, '0.7', null])('rejects invalid confidence %s atomically', (confidence) => {
    const input = answers();
    input.relevance = { ...(input.relevance as object), confidence };
    expect(validateReaderValueAnswers(input)).toEqual({ ok: false, error: 'invalid_answer' });
  });

  it.each([
    { choice: 'unknown' },
    { probabilities: { noise: 1 } },
    { probabilities: { noise: NaN, context: 0, useful: 0, important: 0, insufficient_context: 0 } },
    { probabilities: { noise: 0.5, context: 0, useful: 0, important: 0, insufficient_context: 0 } },
    { probabilities: { noise: 1, context: 0, useful: 0, important: 0, insufficient_context: 0, extra: 0 } },
  ])('rejects invalid choice/distribution %j', (patch) => {
    const input = answers();
    input.usefulness = { ...(input.usefulness as object), ...patch };
    expect(validateReaderValueAnswers(input).ok).toBe(false);
  });

  it('requires exactly four questions but tolerates answer envelope additions', () => {
    expect(validateReaderValueAnswers({ ...answers(), fifth: {} }).ok).toBe(false);
    const input = answers();
    delete input.relevance;
    expect(validateReaderValueAnswers(input).ok).toBe(false);
    const extended = answers();
    extended.usefulness = { ...(extended.usefulness as object), providerDiagnostic: 'ignored' };
    expect(validateReaderValueAnswers(extended).ok).toBe(true);
  });

  it('accepts insufficient context as a successful category and copies the result', () => {
    const input = answers();
    const probabilities = { noise: 0, context: 0, useful: 0, important: 0, insufficient_context: 1 };
    input.usefulness = { choice: 'insufficient_context', confidence: 1, probabilities };
    const result = validateReaderValueAnswers(input);
    probabilities.insufficient_context = 0;
    expect(result.ok && result.value.usefulness.probabilities.insufficient_context).toBe(1);
  });
});
