import {
  REDACTED_VALUE,
  countSensitiveTextFragments,
  isSensitiveKey,
  isSensitiveString,
  isSensitiveUrlCredentialKey,
  redactSensitiveMetadataRecord,
  redactSensitiveRecord,
  redactSensitiveResponseText,
  redactSensitiveText,
  sanitizeUrlCredentials,
  urlContainsCredentials,
} from './redaction';

describe('redaction helpers', () => {
  it('detects sensitive keys and credential-looking strings', () => {
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('sessionCookie')).toBe(true);
    expect(isSensitiveKey('displayName')).toBe(false);

    expect(isSensitiveString('Bearer token-value')).toBe(true);
    expect(isSensitiveString('Basic token-value')).toBe(true);
    expect(isSensitiveString('Bearer JWT authorization is required')).toBe(false);
    expect(isSensitiveString('postgres://user:password@example.test/db')).toBe(true);
    expect(isSensitiveString('ordinary value')).toBe(false);
  });

  it('redacts nested problem detail records without dropping safe context', () => {
    expect(redactSensitiveRecord({
      provider: 'reddit',
      accessToken: 'plain-token',
      nested: {
        url: 'https://user:pass@example.test/path',
        message: 'provider rejected access_token=raw-token',
        count: 3,
      },
      values: ['safe', 'smk_generated_secret', 'Authorization: Bearer token-value'],
    })).toEqual({
      provider: 'reddit',
      accessToken: REDACTED_VALUE,
      nested: {
        url: REDACTED_VALUE,
        message: `provider rejected access_token=${REDACTED_VALUE}`,
        count: 3,
      },
      values: ['safe', REDACTED_VALUE, `Authorization=${REDACTED_VALUE}`],
    });
  });

  it('redacts audit metadata while preserving scalar metadata shape', () => {
    expect(redactSensitiveMetadataRecord({
      action: 'api_key.created',
      authorization: 'Bearer token-value',
      attempts: 2,
      errorMessage: 'credential exchange failed client_secret=raw-client-secret',
      evidence: ['safe', 'whsec_generated_secret', 'Authorization: Bearer token-value'],
    })).toEqual({
      action: 'api_key.created',
      authorization: REDACTED_VALUE,
      attempts: 2,
      errorMessage: `credential exchange failed client_secret=${REDACTED_VALUE}`,
      evidence: ['safe', REDACTED_VALUE, `Authorization=${REDACTED_VALUE}`],
    });
  });

  it('redacts inline credentials before text leaves the trust boundary', () => {
    expect(redactSensitiveText(
      'See token=memory-leak, secret=another-leak, private_key=key-leak, {"access_token":"json-leak"} and https://user:pass@example.test/feed.',
    )).toBe(
      `See token=${REDACTED_VALUE}, secret=${REDACTED_VALUE}, private_key=${REDACTED_VALUE}, {"access_token":"${REDACTED_VALUE}"} and https://${REDACTED_VALUE}@example.test/feed.`,
    );
  });

  it('removes signed URL credentials individually while preserving semantic query identity', () => {
    const azure = 'https://blob.example.test/report?sv=2025-01-05&se=2030-01-01&sp=r&sig=fixture-azure&edition=west';
    const aws = 'https://object.example.test/report?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=fixture&part=2&X-Amz-Signature=fixture-signature';
    const google = 'https://storage.example.test/report?X-Goog-Algorithm=GOOG4-RSA-SHA256&chapter=7&X-Goog-Signature=fixture-signature';
    const legacyGoogle = 'https://storage.example.test/report?GoogleAccessId=fixture-id&Expires=1900000000&Signature=fixture-signature&chapter=8';

    expect(sanitizeUrlCredentials(azure)).toBe('https://blob.example.test/report?edition=west');
    expect(sanitizeUrlCredentials(aws)).toBe('https://object.example.test/report?part=2');
    expect(sanitizeUrlCredentials(google)).toBe('https://storage.example.test/report?chapter=7');
    expect(sanitizeUrlCredentials(legacyGoogle)).toBe('https://storage.example.test/report?chapter=8');
    expect(redactSensitiveText(`download ${azure}`)).toBe(
      'download https://blob.example.test/report?edition=west',
    );
    expect(redactSensitiveRecord({ downloadUrl: azure })).toEqual({
      downloadUrl: 'https://blob.example.test/report?edition=west',
    });
    expect(urlContainsCredentials(azure)).toBe(true);
  });

  it.each(['cookie', 'session_id', 'private_key', 'password_reset_token'])(
    'keeps generic sensitive-key protection for URL query key %s',
    (key) => {
      const url = `https://example.test/report?edition=west&${key}=fixture-secret#section`;

      expect(isSensitiveUrlCredentialKey(key)).toBe(true);
      expect(urlContainsCredentials(url)).toBe(true);
      expect(sanitizeUrlCredentials(url)).toBe(
        'https://example.test/report?edition=west#section',
      );
    },
  );

  it('preserves retained raw query components and fragments byte-for-byte', () => {
    const url = 'https://example.test/report?tag=one&token=fixture-one&tag=two&cook%69e=fixture-two&edition&empty=&plus=a+b&space=a%20b&escape=%2f%2F&&tail=#part%202';

    expect(sanitizeUrlCredentials(url)).toBe(
      'https://example.test/report?tag=one&tag=two&edition&empty=&plus=a+b&space=a%20b&escape=%2f%2F&&tail=#part%202',
    );
    expect(sanitizeUrlCredentials('https://example.test/report#')).toBe(
      'https://example.test/report#',
    );
  });

  it('removes sensitive fragment parameters while preserving harmless fragments', () => {
    expect(urlContainsCredentials(
      'https://example.test/callback#access_token=fixture-secret',
    )).toBe(true);
    expect(sanitizeUrlCredentials(
      'https://example.test/callback#access_token=fixture-secret',
    )).toBe('https://example.test/callback');
    expect(sanitizeUrlCredentials(
      'https://example.test/report#section=overview&access_token=fixture-secret&panel=details',
    )).toBe('https://example.test/report#section=overview&panel=details');
    expect(redactSensitiveRecord({
      url: 'https://example.test/report#section=overview&refresh_token=fixture-secret',
    })).toEqual({
      url: 'https://example.test/report#section=overview',
    });
    expect(sanitizeUrlCredentials(
      'https://example.test/report#section%202',
    )).toBe('https://example.test/report#section%202');
  });

  it('treats question marks inside plain fragment values as parameter data', () => {
    const credentialWithRouteState =
      'https://example.test/#auth=fixture-secret&state=/callback?panel=details';
    const mixedParameters =
      'https://example.test/#section=overview&auth=fixture-secret&state=/callback?panel=details&next=/done?tab=summary';

    expect(urlContainsCredentials(credentialWithRouteState)).toBe(true);
    expect(sanitizeUrlCredentials(credentialWithRouteState)).toBe(
      'https://example.test/#state=/callback?panel=details',
    );
    expect(urlContainsCredentials(mixedParameters)).toBe(true);
    expect(sanitizeUrlCredentials(mixedParameters)).toBe(
      'https://example.test/#section=overview&state=/callback?panel=details&next=/done?tab=summary',
    );
    expect(redactSensitiveText(`redirect ${mixedParameters}`)).toBe(
      'redirect https://example.test/#section=overview&state=/callback?panel=details&next=/done?tab=summary',
    );
  });

  it('removes credentials from route fragment query suffixes without discarding route state', () => {
    const routeOnly = 'https://example.test/#/callback';
    const routeWithState = 'https://example.test/#/callback?state=fixture-state';
    const routeWithCredential = 'https://example.test/#/callback?auth=fixture-secret';
    const routeWithMixedSuffix =
      'https://example.test/#/callback?state=fixture-state&auth=fixture-secret&panel=details';

    expect(urlContainsCredentials(routeOnly)).toBe(false);
    expect(sanitizeUrlCredentials(routeOnly)).toBe(routeOnly);
    expect(urlContainsCredentials(routeWithState)).toBe(false);
    expect(sanitizeUrlCredentials(routeWithState)).toBe(routeWithState);
    expect(urlContainsCredentials(routeWithCredential)).toBe(true);
    expect(sanitizeUrlCredentials(routeWithCredential)).toBe(
      'https://example.test/#/callback',
    );
    expect(urlContainsCredentials(routeWithMixedSuffix)).toBe(true);
    expect(sanitizeUrlCredentials(routeWithMixedSuffix)).toBe(
      'https://example.test/#/callback?state=fixture-state&panel=details',
    );
    expect(redactSensitiveText(`redirect ${routeWithMixedSuffix}`)).toBe(
      'redirect https://example.test/#/callback?state=fixture-state&panel=details',
    );
    expect(redactSensitiveRecord({ callbackUrl: routeWithCredential })).toEqual({
      callbackUrl: 'https://example.test/#/callback',
    });
  });

  it('redacts route query credentials after matrix parameters', () => {
    const matrixRoute =
      'https://example.test/#/callback;mode=compact?auth=fixture-secret&panel=details';
    const sanitized =
      'https://example.test/#/callback;mode=compact?panel=details';

    expect(urlContainsCredentials(matrixRoute)).toBe(true);
    expect(sanitizeUrlCredentials(matrixRoute)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${matrixRoute}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: matrixRoute })).toEqual({
      callbackUrl: sanitized,
    });
  });

  it('normalizes WHATWG-discarded ASCII before removing URL credentials', () => {
    expect(sanitizeUrlCredentials(
      ' \thttps://user:pass@example.test/report?edition=west',
    )).toBe('https://example.test/report?edition=west');
    expect(sanitizeUrlCredentials(
      'https://example.test/report?to\tken=fixture-secret&edition=west#section',
    )).toBe('https://example.test/report?edition=west#section');
    expect(sanitizeUrlCredentials(
      'https://example.test/re\nport?edition=we\rst#sec\ttion',
    )).toBe('https://example.test/report?edition=west#section');
  });

  it('does not collapse distinct retained query identities', () => {
    const fixtures = [
      ['https://example.test/report?token=fixture&edition#part', 'https://example.test/report?edition#part'],
      ['https://example.test/report?token=fixture&edition=#part', 'https://example.test/report?edition=#part'],
      ['https://example.test/report?token=fixture&q=west%20coast#part', 'https://example.test/report?q=west%20coast#part'],
      ['https://example.test/report?token=fixture&q=west+coast#part', 'https://example.test/report?q=west+coast#part'],
    ] as const;

    const sanitized = fixtures.map(([input, expected]) => {
      expect(sanitizeUrlCredentials(input)).toBe(expected);
      return sanitizeUrlCredentials(input);
    });
    expect(new Set(sanitized).size).toBe(fixtures.length);
  });

  it('does not classify short semantic parameters as Azure credentials without a signature', () => {
    expect(sanitizeUrlCredentials(
      'https://example.test/search?sv=semantic-version&se=southeast&key=topic&x-amz-meta-label=report',
    )).toBe('https://example.test/search?sv=semantic-version&se=southeast&key=topic&x-amz-meta-label=report');
  });

  it('does not let a credential value consume following ordinary parameters', () => {
    expect(redactSensitiveText('https://example.test/article?token=fixture&edition=north')).toBe(
      'https://example.test/article?edition=north',
    );
    expect(redactSensitiveText('failed token=fixture&edition=north')).toBe(
      `failed token=${REDACTED_VALUE}&edition=north`,
    );
  });

  it('does not redact public auth scheme wording as bearer credentials', () => {
    expect(redactSensitiveText('Bearer JWT tenant or workspace does not match request scope')).toBe(
      'Bearer JWT tenant or workspace does not match request scope',
    );
    expect(redactSensitiveText('Reddit refresh-token provider must use Basic client auth')).toBe(
      'Reddit refresh-token provider must use Basic client auth',
    );
  });

  it('counts sensitive text fragments with the shared redaction policy', () => {
    expect(countSensitiveTextFragments(
      'token=plain-token Bearer token-value {"client_secret":"json-secret"} https://user:pass@example.test/feed safe text',
    )).toBe(4);
  });

  it('redacts JSON and plain response credentials before error text leaves the trust boundary', () => {
    const redacted = redactSensitiveResponseText(
      '{"access_token":"json-access","refresh_token":"json-refresh","client_secret":"json-secret"} refresh_token=plain-refresh Bearer token-value',
    );

    expect(redacted).toContain(`"access_token":"${REDACTED_VALUE}"`);
    expect(redacted).not.toContain('json-access');
    expect(redacted).not.toContain('json-refresh');
    expect(redacted).not.toContain('json-secret');
    expect(redacted).not.toContain('plain-refresh');
    expect(redacted).not.toContain('token-value');
  });
});
