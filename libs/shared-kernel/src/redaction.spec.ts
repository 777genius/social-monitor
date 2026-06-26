import {
  REDACTED_VALUE,
  isSensitiveKey,
  isSensitiveString,
  redactSensitiveMetadataRecord,
  redactSensitiveRecord,
  redactSensitiveText,
} from './redaction';

describe('redaction helpers', () => {
  it('detects sensitive keys and credential-looking strings', () => {
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('sessionCookie')).toBe(true);
    expect(isSensitiveKey('displayName')).toBe(false);

    expect(isSensitiveString('Bearer token-value')).toBe(true);
    expect(isSensitiveString('Basic token-value')).toBe(true);
    expect(isSensitiveString('postgres://user:password@example.test/db')).toBe(true);
    expect(isSensitiveString('ordinary value')).toBe(false);
  });

  it('redacts nested problem detail records without dropping safe context', () => {
    expect(redactSensitiveRecord({
      provider: 'reddit',
      accessToken: 'plain-token',
      nested: {
        url: 'https://user:pass@example.test/path',
        count: 3,
      },
      values: ['safe', 'smk_generated_secret'],
    })).toEqual({
      provider: 'reddit',
      accessToken: REDACTED_VALUE,
      nested: {
        url: REDACTED_VALUE,
        count: 3,
      },
      values: ['safe', REDACTED_VALUE],
    });
  });

  it('redacts audit metadata while preserving scalar metadata shape', () => {
    expect(redactSensitiveMetadataRecord({
      action: 'api_key.created',
      authorization: 'Bearer token-value',
      attempts: 2,
      evidence: ['safe', 'whsec_generated_secret'],
    })).toEqual({
      action: 'api_key.created',
      authorization: REDACTED_VALUE,
      attempts: 2,
      evidence: ['safe', REDACTED_VALUE],
    });
  });

  it('redacts inline credentials before text leaves the trust boundary', () => {
    expect(redactSensitiveText(
      'See token=memory-leak, secret=another-leak, private_key=key-leak and https://user:pass@example.test/feed.',
    )).toBe(
      `See token=${REDACTED_VALUE}, secret=${REDACTED_VALUE}, private_key=${REDACTED_VALUE} and https://${REDACTED_VALUE}@example.test/feed.`,
    );
  });
});
