import * as current from './redaction';

// Frozen parent-commit implementation: oracle for small synthetic inputs only.
const legacy = (() => {
  const REDACTED_VALUE = '[REDACTED]';

  type RedactableMetadataValue = string | number | boolean | readonly string[] | undefined;

  const sensitiveKeyPattern = /(?:secret|token|password|credential|authorization|api[_-]?key|refresh[_-]?token|access[_-]?token|private[_-]?key|cookie|session|signature)/i;
  const bearerPattern = /^bearer\s+(?!jwt\b)[A-Za-z0-9._~+/-]{8,}=*/i;
  const basicPattern = /^basic\s+(?!client\b)[A-Za-z0-9._~+/-]{8,}=*/i;
  const generatedSecretPattern = /^(?:smk|whsec)_[A-Za-z0-9_-]+/;
  const urlWithPasswordPattern = /^[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:[^@\s]+@/i;
  const inlineCredentialPattern =
    /\b((?:access|refresh|id)?[_-]?token|api[_-]?key|client[_-]?secret|secret|credential|authorization|password|session|cookie|signature|private[_-]?key)\s*[:=]\s*([^\s'",<>{}]+)/gi;
  const inlineJsonCredentialPattern =
    /"((?:access|refresh|id)?[_-]?token|api[_-]?key|client[_-]?secret|secret|credential|authorization|password|session|cookie|signature|private[_-]?key)"\s*:\s*"[^"]+"/gi;
  const inlineBearerPattern = /\b(?:bearer|basic)\s+(?!jwt\b|client\b)[A-Za-z0-9._~+/-]{8,}=*/gi;
  const inlineGeneratedSecretPattern = /\b(?:smk|whsec)_[A-Za-z0-9_-]+\b/g;
  const inlineUrlWithPasswordPattern =
    /\b([a-z][a-z0-9+.-]*:\/\/)([^:\s/@]+):([^@\s]+)@/gi;
  const sensitiveTextFragmentPatterns = [
    inlineJsonCredentialPattern,
    inlineCredentialPattern,
    inlineBearerPattern,
    inlineGeneratedSecretPattern,
    inlineUrlWithPasswordPattern,
  ] as const;

  const isSensitiveKey = (key: string): boolean => sensitiveKeyPattern.test(key);

  const isSensitiveString = (value: string): boolean =>
    bearerPattern.test(value) ||
    basicPattern.test(value) ||
    generatedSecretPattern.test(value) ||
    urlWithPasswordPattern.test(value);

  const redactSensitiveText = (value: string): string =>
    value
      .replace(inlineJsonCredentialPattern, (_match, key: string) => `"${key}":"${REDACTED_VALUE}"`)
      .replace(inlineBearerPattern, REDACTED_VALUE)
      .replace(inlineCredentialPattern, (_match, key: string) => `${key}=${REDACTED_VALUE}`)
      .replace(inlineGeneratedSecretPattern, REDACTED_VALUE)
      .replace(inlineUrlWithPasswordPattern, (_match, protocol: string) => `${protocol}${REDACTED_VALUE}@`);

  const countSensitiveTextFragments = (value: string): number =>
    sensitiveTextFragmentPatterns.reduce(
      (count, pattern) => count + [...value.matchAll(pattern)].length,
      0,
    );

  const redactSensitiveResponseText = (value: string, maxLength = 500): string =>
    redactSensitiveText(value
      .replace(/"access_token"\s*:\s*"[^"]+"/gi, `"access_token":"${REDACTED_VALUE}"`)
      .replace(/"refresh_token"\s*:\s*"[^"]+"/gi, `"refresh_token":"${REDACTED_VALUE}"`)
      .replace(/"client_secret"\s*:\s*"[^"]+"/gi, `"client_secret":"${REDACTED_VALUE}"`))
      .slice(0, maxLength);

  const redactSensitiveRecord = (
    record: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> =>
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, redactSensitiveValue(key, value)]),
    );

  const redactSensitiveValue = (key: string, value: unknown): unknown => {
    if (isSensitiveKey(key)) {
      return REDACTED_VALUE;
    }

    if (typeof value === 'string') {
      return redactSensitiveStringValue(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => redactSensitiveValue('', item));
    }

    if (typeof value === 'object' && value !== null) {
      return redactSensitiveRecord(value as Readonly<Record<string, unknown>>);
    }

    return value;
  };

  const redactSensitiveMetadataRecord = (
    metadata: Readonly<Record<string, RedactableMetadataValue>>,
  ): Readonly<Record<string, RedactableMetadataValue>> => {
    const redacted: Record<string, RedactableMetadataValue> = {};

    for (const [key, value] of Object.entries(metadata)) {
      redacted[key] = redactSensitiveMetadataValue(key, value);
    }

    return redacted;
  };

  const redactSensitiveMetadataValue = (
    key: string,
    value: RedactableMetadataValue,
  ): RedactableMetadataValue => {
    if (value === undefined) {
      return undefined;
    }

    if (isSensitiveKey(key)) {
      return REDACTED_VALUE;
    }

    if (typeof value === 'string') {
      return redactSensitiveStringValue(value);
    }

    if (Array.isArray(value)) {
      return value.map(redactSensitiveStringValue);
    }

    return value;
  };

  const redactSensitiveStringValue = (value: string): string =>
    isSensitiveString(value) ? REDACTED_VALUE : redactSensitiveText(value);
  return { redactSensitiveText, countSensitiveTextFragments, isSensitiveString,
    redactSensitiveResponseText, redactSensitiveRecord, redactSensitiveMetadataRecord };
})();

describe('linear URL credential redaction compatibility', () => {
  const cases = [
    'plain-text-with-hyphens', 'https://u:p@example.test/a',
    'X+9.-custom://u:p@example.test', '9abc://u:p@host',
    '9-abc://u:p@host', '_abc://u:p@host', 'éabc://u:p@host',
    'K://u:p@host', 'ſ://u:p@host', 'a_b://u:p@host',
    'http:/u:p@host', 'http:///u:p@host', 'http://:p@host',
    'http://u:@host', 'http://u:p', 'http://u:p q@host',
    'http://u:p/a:b@host', 'http://u:p@a://v:q@host',
    'http://u:abc://v:q@host', 'http://u:abc://v:q',
    'http://u:p\u00a0@host', 'http://用:密@host',
    'http://u:p\u200b@host', 'http://u:p\ufeff@host',
    'http://u:p\n@host', 'http://u:p\t@host',
    'see https://u:p@one.test and custom://v:q@two.test',
    'token=synthetic https://u:p@host Bearer abcdefgh',
    '{"client_secret":"synthetic"} whsec_synthetic Basic abcdefgh',
    'Bearer JWT Basic client authorization is required',
  ];

  const compare = (value: string): void => {
    expect(current.redactSensitiveText(value)).toBe(legacy.redactSensitiveText(value));
    expect(current.countSensitiveTextFragments(value)).toBe(legacy.countSensitiveTextFragments(value));
    expect(current.isSensitiveString(value)).toBe(legacy.isSensitiveString(value));
    expect(current.redactSensitiveResponseText(value, 37)).toBe(legacy.redactSensitiveResponseText(value, 37));
    expect(current.redactSensitiveRecord({ message: value, nested: [value], token: value }))
      .toEqual(legacy.redactSensitiveRecord({ message: value, nested: [value], token: value }));
    expect(current.redactSensitiveMetadataRecord({ message: value, values: [value] }))
      .toEqual(legacy.redactSensitiveMetadataRecord({ message: value, values: [value] }));
  };

  it.each(cases)('preserves grammar and surrounding rules (case %#)', compare);

  it('matches the frozen original on bounded deterministic synthetic combinations', () => {
    const prefixes = ['', ' ', '_', '9', '-', 'é', '\n'];
    const schemes = ['a', 'A+1.-z', '9a', '9-a', 'a_b', 'a--b', 'K'];
    const credentials = ['u:p@', ':p@', 'u:@', 'u:p', 'u:p q@', 'u:a://v:q@', 'u:a://v:q'];
    for (const prefix of prefixes) {
      for (const scheme of schemes) {
        for (const credential of credentials) {
          compare(`${prefix}${scheme}://${credential}host`);
        }
      }
    }
    let seed = 17;
    const atoms = ['a-', 'a', '9', '_', '://', ':', '/', '@', ' ', '\u00a0', 'é', 'u:p', '+', '.'];
    for (let sample = 0; sample < 1000; sample += 1) {
      let value = '';
      for (let part = 0; part < 12; part += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        value += atoms[seed % atoms.length];
      }
      compare(value);
    }
  });

  it('bounds actual scanner character inspections, including overlapping near misses', () => {
    for (const size of [1024, 8192, 131072]) {
      const inputs = [
        'a-'.repeat(size),
        `${'a-'.repeat(size)}://u:p@host`,
        'a://u:'.repeat(size),
        `${'a://u:'.repeat(size)}p@host`,
        'a://u:p@host '.repeat(size),
      ];
      for (const value of inputs) {
        for (const scan of [current.redactSensitiveText, current.countSensitiveTextFragments]) {
          let inspections = 0;
          const charAt = String.prototype.charAt;
          String.prototype.charAt = function (this: string, index: number): string {
            inspections += 1;
            if (inspections > 12 * value.length + 20) {
              throw new Error('URL scanner exceeded linear character inspection budget');
            }
            return charAt.call(this, index);
          };
          try {
            const result = scan(value);
            expect(result).toBeDefined();
          } finally {
            String.prototype.charAt = charAt;
          }
          // Also fails if the scanner is replaced with the original regex.
          expect(inspections).toBeGreaterThan(size);
          expect(inspections).toBeLessThanOrEqual(12 * value.length + 20);
        }
      }
    }
    expect(current.redactSensitiveText('a-'.repeat(131072))).toBe('a-'.repeat(131072));
    expect(current.countSensitiveTextFragments('a-'.repeat(131072))).toBe(0);
  });
});

