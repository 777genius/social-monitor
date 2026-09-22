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

  it.each([
    [
      'https://example.test/#section=overview&edition&auth=fixture-secret',
      'https://example.test/#section=overview&edition',
    ],
    [
      'https://example.test/#section=overview&edition&%61uth=fixture-secret',
      'https://example.test/#section=overview&edition',
    ],
  ])('redacts credentials from mixed plain fragment parameters: %s', (url, sanitized) => {
    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({
      callbackUrl: sanitized,
    });
  });

  it.each([
    [
      'https://example.test/#section=overview&=ignored&%61uth=fixture-secret',
      'https://example.test/#section=overview&=ignored',
    ],
    [
      'https://example.test/#tag[]=one&auth=fixture-secret',
      'https://example.test/#tag[]=one',
    ],
    [
      'https://example.test/#édition=une&auth=fixture-secret',
      'https://example.test/#édition=une',
    ],
    [
      'https://example.test/#tag[/]=one&auth=fixture-secret',
      'https://example.test/#tag[/]=one',
    ],
    [
      'https://example.test/#tag[;]=one&auth=fixture-secret',
      'https://example.test/#tag[;]=one',
    ],
    [
      'https://example.test/#tag/name=one&auth=fixture-secret',
      'https://example.test/#tag/name=one',
    ],
  ])('redacts credentials after unrestricted fragment parameter names: %s', (
    url,
    sanitized,
  ) => {
    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({
      callbackUrl: sanitized,
    });
  });

  it('uses the complete plain fragment for companion-dependent credential context', () => {
    const cloudFront =
      'https://example.test/#policy=fixture-private-policy&state=/callback?panel=details&Key-Pair-Id=fixture-id';
    const azure =
      'https://example.test/#sip=192.0.2.0%2F24&state=/callback?panel=details&sig=fixture-azure';
    const sanitized = 'https://example.test/#state=/callback?panel=details';
    const cloudFrontWithBareComponent =
      'https://example.test/#policy=fixture-private-policy&edition&state=/callback?panel=details&Key-Pair-Id=fixture-id';
    const sanitizedWithBareComponent =
      'https://example.test/#edition&state=/callback?panel=details';

    for (const [url, expected] of [
      [cloudFront, sanitized],
      [azure, sanitized],
      [cloudFrontWithBareComponent, sanitizedWithBareComponent],
    ] as const) {
      expect(urlContainsCredentials(url)).toBe(true);
      expect(sanitizeUrlCredentials(url)).toBe(expected);
      expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${expected}`);
      expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({
        callbackUrl: expected,
      });
    }
  });

  it.each([
    'https://example.test/#section',
    'https://example.test/#section?',
  ])('preserves an anchor without inventing or discarding a query marker: %s', (url) => {
    expect(urlContainsCredentials(url)).toBe(false);
    expect(sanitizeUrlCredentials(url)).toBe(url);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${url}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: url });
  });

  it('removes a URL query credential before an anchor without adding a query marker', () => {
    const url = 'https://example.test/?auth=fixture-secret#section';
    const sanitized = 'https://example.test/#section';

    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({
      callbackUrl: sanitized,
    });
  });

  it.each([
    'https://example.test/#/sessions?panel=details',
    'https://example.test/#/password-reset?panel=details',
    'https://example.test/#sessions?panel=details',
    'https://example.test/#password-reset?panel=details',
    'https://example.test/#users/sessions?panel=details',
    'https://example.test/#users/password-reset?panel=details',
    'https://example.test/#user-sessions?panel=details',
    'https://example.test/#password-reset-confirm?panel=details',
  ])('preserves harmless routes whose names contain sensitive substrings: %s', (url) => {
    expect(urlContainsCredentials(url)).toBe(false);
    expect(sanitizeUrlCredentials(url)).toBe(url);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${url}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: url });
  });

  it.each([
    [
      'https://example.test/#callback?auth=fixture-secret&panel=details',
      'https://example.test/#callback?panel=details',
    ],
    [
      'https://example.test/#sessions?auth=fixture-secret',
      'https://example.test/#sessions',
    ],
    [
      'https://example.test/#session_id?=fixture-secret&panel=details',
      'https://example.test/#panel=details',
    ],
  ])('keeps non-leading route text when the sensitive key crosses its query boundary: %s', (
    url,
    sanitized,
  ) => {
    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({
      callbackUrl: sanitized,
    });
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

  it.each([
    [
      'https://example.test/#/callback;mode=compact?auth=fixture-secret&panel=details',
      'https://example.test/#/callback;mode=compact?panel=details',
    ],
    [
      'https://example.test/#callback;mode=compact?auth=fixture-secret&panel=details',
      'https://example.test/#callback;mode=compact?panel=details',
    ],
  ])('redacts route query credentials after matrix parameters: %s', (
    matrixRoute,
    sanitized,
  ) => {
    expect(urlContainsCredentials(matrixRoute)).toBe(true);
    expect(sanitizeUrlCredentials(matrixRoute)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${matrixRoute}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: matrixRoute })).toEqual({
      callbackUrl: sanitized,
    });
  });

  it.each([
    [
      'https://example.test/#/callback;access_%74oken=fixture-secret?panel=details',
      'https://example.test/#/callback?panel=details',
    ],
    [
      'https://example.test/#!/callback;mode=compact;access_token=fixture-secret?panel=details',
      'https://example.test/#!/callback;mode=compact?panel=details',
    ],
    [
      'https://example.test/#callback;access_token=fixture-secret?tag[]=one&tag[]=two',
      'https://example.test/#callback?tag[]=one&tag[]=two',
    ],
    [
      'https://example.test/#/callback;tag[?]=one;access_token%3F=fixture-secret?panel=details',
      'https://example.test/#/callback;tag[?]=one?panel=details',
    ],
    [
      'https://example.test/#/callback[view;access_token=fixture-secret?panel=details',
      'https://example.test/#/callback[view?panel=details',
    ],
  ])('removes a sensitive matrix field while retaining the route: %s', (url, sanitized) => {
    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: sanitized });
  });

  it.each([
    [
      'https://example.test/#/callback;tag%5B?auth=fixture-secret&panel=details',
      'https://example.test/#/callback;tag%5B?panel=details',
    ],
    [
      'https://example.test/#/callback;tag[?auth=fixture-secret&panel=details',
      'https://example.test/#/callback;tag[?panel=details',
    ],
    [
      'https://example.test/#/callback;mode=compact;access_token[?]=fixture-secret?panel=details',
      'https://example.test/#/callback;mode=compact?panel=details',
    ],
    [
      'https://example.test/#/callback;mode=compact;access_token?=fixture-secret&panel=details',
      'https://example.test/#/callback;mode=compact?panel=details',
    ],
    [
      'https://example.test/#/callback;access_token=fixture-secret/orders/123?panel=details',
      'https://example.test/#/callback/orders/123?panel=details',
    ],
    [
      'https://example.test/#/callback;access_token=fixture%2Fsecret/orders/123?panel=details',
      'https://example.test/#/callback/orders/123?panel=details',
    ],
    [
      'https://example.test/#/callback;mode=compact/orders;access_token=fixture-secret/123?panel=details',
      'https://example.test/#/callback;mode=compact/orders/123?panel=details',
    ],
    [
      'https://example.test/#/callback;mode=compact/orders;access_token[?]=fixture-secret?panel=details',
      'https://example.test/#/callback;mode=compact/orders?panel=details',
    ],
    [
      'https://example.test/#/callback;mode=compact/orders;tag[?]=one;access_token=fixture-secret?panel=details',
      'https://example.test/#/callback;mode=compact/orders;tag[?]=one?panel=details',
    ],
  ])('keeps route identity when redacting lexical route credentials: %s', (url, sanitized) => {
    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: sanitized });
  });

  it.each([
    ['access_token', ''],
    ['access_%74oken', ''],
    ['access_token[?]', ''],
    ['access_token%5B;%5D', ''],
    ['access_token', '?panel=details'],
    ['access_%74oken', '?panel=details'],
    ['access_token[?]', '?panel=details'],
    ['access_token%5B;%5D', '?panel=details'],
  ])('redacts a matrix credential after an unmatched encoded bracket: %s%s', (
    key,
    trailingQuery,
  ) => {
    const url = `https://example.test/#/callback;tag%5B?=one;${key}=fixture-secret${trailingQuery}`;
    const sanitized = 'https://example.test/#/callback;tag%5B?=one';

    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: sanitized });
  });

  it('keeps later harmless fields when an ambiguous matrix credential is removed', () => {
    const url = 'https://example.test/#/callback;tag%5B?=one;access_token=fixture-secret;edition=west&panel=details';
    const sanitized = 'https://example.test/#/callback;tag%5B?=one;edition=west&panel=details';

    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: sanitized });
  });

  it('closes unmatched bracket and matrix separator combinations across public APIs', () => {
    const routes = ['/callback', 'callback', '!/callback'];
    const brackets = ['tag%5B', 'tag['];
    const keys = ['access_token', 'access_%74oken', 'access_token[?]', 'access_token%5B;%5D'];
    const tails = ['', '?panel=details', '&panel=details'];

    for (const route of routes) {
      for (const bracket of brackets) {
        for (const key of keys) {
          for (const tail of tails) {
            const url = `https://example.test/#${route};${bracket}?=one;${key}=fixture-secret${tail}`;
            const sanitized = sanitizeUrlCredentials(url);

            expect(urlContainsCredentials(url)).toBe(true);
            expect(sanitized).not.toContain('fixture-secret');
            expect(sanitized).toContain(`#${route}`);
            expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
            expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: sanitized });
          }
        }
      }
    }
  });

  it.each([
    [
      'https://example.test/#/callback;access_token[/]=fixture-secret?panel=details',
      'https://example.test/#/callback?panel=details',
    ],
    [
      'https://example.test/#/callback[;access_token]=fixture-secret?panel=details',
      'https://example.test/#/callback[?panel=details',
    ],
    [
      'https://example.test/#/callback[tag/next;access_token]=fixture-secret;edition=west?panel=details',
      'https://example.test/#/callback[tag/next;edition=west?panel=details',
    ],
    [
      'https://example.test/#/callback%5Btag/next;accessToken%5D=fixture-secret;edition=west?panel=details',
      'https://example.test/#/callback%5Btag/next;edition=west?panel=details',
    ],
    [
      'https://example.test/#access_token[x]?tag=fixture-secret&panel=details',
      'https://example.test/#panel=details',
    ],
    [
      'https://example.test/#cookie;tag=fixture-secret&panel=details',
      'https://example.test/#panel=details',
    ],
    [
      'https://example.test/#clientSecret?tag=fixture-secret&panel=details',
      'https://example.test/#panel=details',
    ],
    [
      'https://example.test/#%61ccess_token%5Bx%5D?tag=fixture-secret&panel=details',
      'https://example.test/#panel=details',
    ],
  ])('redacts bracketed and disguised fragment credentials: %s', (url, sanitized) => {
    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: sanitized });
  });

  it.each([
    'https://example.test/#users/sessions',
    'https://example.test/#users/password-reset',
    'https://example.test/#user-sessions',
  ])('preserves queryless harmless routes: %s', (url) => {
    expect(urlContainsCredentials(url)).toBe(false);
    expect(sanitizeUrlCredentials(url)).toBe(url);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${url}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: url });
  });

  it.each([
    [
      'https://example.test/#/callback;access_token[;]=fixture-secret?panel=details',
      'https://example.test/#/callback?panel=details',
    ],
    [
      'https://example.test/#callback;tag[;]=one;access_token=fixture-secret',
      'https://example.test/#callback;tag[;]=one',
    ],
    [
      'https://example.test/#!/callback;;tag[;]=one;access_%74oken=fixture-secret;edition=&?panel=details',
      'https://example.test/#!/callback;;tag[;]=one;edition=&?panel=details',
    ],
    [
      'https://example.test/#callback;edition;access_token[;]=fixture-secret;edition=west;access_token=fixture-two',
      'https://example.test/#callback;edition;edition=west',
    ],
    [
      'https://example.test/#callback;se=1900000000;tag[;]=one;sig=fixture-signature?panel=details',
      'https://example.test/#callback;tag[;]=one?panel=details',
    ],
    [
      'https://example.test/#callback;tag[?]=one;access_token=fixture-secret?panel=one?two',
      'https://example.test/#callback;tag[?]=one?panel=one?two',
    ],
    [
      'https://example.test/#callback;access_token?=fixture-secret&panel=details',
      'https://example.test/#callback?panel=details',
    ],
    [
      'https://example.test/#/callback;access_token%5B;%5D=fixture-secret?panel=details',
      'https://example.test/#/callback?panel=details',
    ],
    [
      'https://example.test/#callback;tag%5B;%5D=one;access_token=fixture-secret',
      'https://example.test/#callback;tag%5B;%5D=one',
    ],
  ])('removes whole lexical matrix fields and keeps route state: %s', (url, sanitized) => {
    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: sanitized });
  });

  it.each([
    [
      'https://example.test/#access_token;tag=fixture-secret&panel=details',
      'https://example.test/#panel=details',
    ],
    [
      'https://example.test/#access_token;tag[;]=fixture-secret?panel=details',
      'https://example.test/',
    ],
    [
      'https://example.test/#%61ccess_token;tag=fixture-secret&panel=details',
      'https://example.test/#panel=details',
    ],
    [
      'https://example.test/#tag[;]=one;mode=compact&auth=fixture-secret',
      'https://example.test/#tag[;]=one;mode=compact',
    ],
    [
      'https://example.test/#tag=one;mode=compact&auth=fixture-secret',
      'https://example.test/#tag=one;mode=compact',
    ],
  ])('keeps plain fragment lists distinct from matrix routes: %s', (url, sanitized) => {
    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: sanitized });
  });

  it.each([
    [
      'https://example.test/#section=overview&access_token[?]=fixture-secret&panel=details',
      'https://example.test/#section=overview&panel=details',
    ],
    [
      'https://example.test/#section=overview&access_token%3F=fixture-secret&panel=details',
      'https://example.test/#section=overview&panel=details',
    ],
    [
      'https://example.test/#access_token[?]=fixture-secret&panel=details',
      'https://example.test/#panel=details',
    ],
    [
      'https://example.test/#access_token?=fixture-secret&panel=details',
      'https://example.test/#panel=details',
    ],
    [
      'https://example.test/#section=overview&access_token?panel=fixture-secret&edition=west',
      'https://example.test/#section=overview&edition=west',
    ],
    [
      'https://example.test/#access_token;tag=fixture-secret&panel=details',
      'https://example.test/#panel=details',
    ],
  ])('removes a sensitive full-fragment key with route-like punctuation: %s', (url, sanitized) => {
    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: sanitized });
  });

  it.each([
    [
      'https://example.test/#expires=1900000000&state=/callback?policy=fixture-private-policy&Key-Pair-Id=fixture-id',
      'https://example.test/#state=/callback',
    ],
    [
      'https://example.test/#Key-Pair-Id=fixture-id&state=/callback?policy=fixture-private-policy&panel=details',
      'https://example.test/#state=/callback?panel=details',
    ],
    [
      'https://example.test/#sip=192.0.2.0%2F24&state=/callback?sig=fixture-azure&panel=details',
      'https://example.test/#state=/callback?panel=details',
    ],
    [
      'https://example.test/#Expires=1900000000&state=/callback?GoogleAccessId=fixture-id&panel=details',
      'https://example.test/#state=/callback?panel=details',
    ],
  ])('uses original signed-fragment companions when removing nested suffix fields: %s', (
    url,
    sanitized,
  ) => {
    expect(urlContainsCredentials(url)).toBe(true);
    expect(sanitizeUrlCredentials(url)).toBe(sanitized);
    expect(redactSensitiveText(`redirect ${url}`)).toBe(`redirect ${sanitized}`);
    expect(redactSensitiveRecord({ callbackUrl: url })).toEqual({ callbackUrl: sanitized });
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
