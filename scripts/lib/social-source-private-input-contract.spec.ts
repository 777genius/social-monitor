import { parseRedditSep24Bindings } from '../export-reddit-sep24-public';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportRssSep24Selected } from '../export-rss-sep24-selected';
import { assertUnprotectedJson, materializedRequest, validateSnapshot } from './social-source-private-input-contract';
import { fakeScopedPool, freshOutput, syntheticSnapshots } from './social-source-private-input-fixtures.spec-support';
import { readScopedSnapshots } from './social-source-private-input-database';
import { admitSocialSep24PrivateInputs, materializeSocialSep24PrivateInputs } from './social-source-private-input-materializer';

describe('authentic unchanged Sep24 request validation', () => {
  it('preserves the original 44 passes, whitespace, array order and actual policy pins', () => {
    const row = syntheticSnapshots()[0]!;
    const result = materializedRequest(validateSnapshot(row));
    expect(result.passCount).toBe(44);
    const accepted = parseRedditSep24Bindings(JSON.parse(result.bytes.toString()) as unknown);
    expect(accepted).toEqual([{ sourceBindingId: '00000000-0000-7000-8000-000000007101', config: row.config }]);
    expect(result.bytes.toString()).toBe(`${JSON.stringify([{ sourceBindingId: row.scope.sourceBindingId, config: row.config }], null, 2)}\n`);
    expect(accepted[0]?.config.query).toBe('  synthetic original query  ');
    expect(row.policy).toEqual({ id: '00000000-0000-7000-8000-000000007102', intervalSeconds: 181,
      freshnessSeconds: 359, retryBudget: 2, nextRunAt: '2026-09-25 03:04:05.123456+00' });
    expect(validateSnapshot(row).capability.config.requiresCredentials).toBe(false);
  });
  it('is accepted by the real RSS consumer with only an injected synthetic client', async () => {
    const row = syntheticSnapshots()[1]!;
    const result = materializedRequest(validateSnapshot(row));
    expect(result).toMatchObject({ feedCount: 25, expandedFeedCount: 36, passCount: 0 });
    expect(result.bytes.length).toBeLessThanOrEqual(16_384);
    const request = JSON.parse(result.bytes.toString()) as Parameters<typeof exportRssSep24Selected>[0];
    const calls: string[] = [];
    const paths = await freshOutput();
    const exported = await exportRssSep24Selected({ ...request, outputRoot: paths.outputRoot }, {
      readFeed: async (url) => { calls.push(url); return { items: calls.length === 1 ? [{ guid: 'synthetic-guid',
        title: 'Synthetic article', content: 'Synthetic article content', link: 'https://example.test/posts/synthetic',
        publishedAt: new Date('2026-09-24T12:00:00.000Z') }] : [] }; },
    });
    expect(exported.selectedCount).toBe(1);
    expect(calls).toHaveLength(36);
    expect(calls[0]).toContain('q=a+after%3A2026-09-24+before%3A2026-09-25');
    expect(calls[11]).toContain('q=l+after%3A2026-09-24+before%3A2026-09-25');
    expect(calls.slice(12)).toEqual(Array.from({ length: 24 }, (_, index) => `https://example.test/feeds/${24 - index}.xml`));
    expect(request.scope).toEqual(row.scope);
    expect(result.bytes.toString()).toBe(`${JSON.stringify({ scope: row.scope,
      bindings: [{ bindingId: row.scope.sourceBindingId, status: 'ENABLED', config: row.config }] }, null, 2)}\n`);
  });
  it.each([0, 49])('refuses %i passes rather than trimming or filling', (length) => {
    const row = syntheticSnapshots()[0]!;
    expect(() => materializedRequest({ ...row, config: { scanPasses: Array.from({ length }, () => ({ mode: 'search', query: 'synthetic' })) } }))
      .toThrow('private_input_refused:configuration');
  });
  it.each([1, 48])('accepts the consumer pass bound %i', (length) => {
    const row = syntheticSnapshots()[0]!;
    const config = { scanPasses: Array.from({ length }, () => ({ mode: 'search', query: 'synthetic' })) };
    expect(materializedRequest({ ...row, config }).passCount).toBe(length);
  });
  it.each([
    { mode: 'unknown', query: 'synthetic' }, { mode: 'search', query: 'synthetic', unknown: true },
    { mode: 'search', query: 'synthetic', allowedSubreddits: [false] }, { query: 'synthetic' },
    { mode: 'search', query: 'synthetic', searchSort: 'unknown' },
    { mode: 'search', query: 'synthetic', searchSort: 5 },
    { mode: 'listing', subreddit: 'synthetic', listing: false },
    { mode: 'search', query: 'synthetic', commentDepth: '2' },
  ])('refuses unsupported passes safely', (pass) => {
    const row = syntheticSnapshots()[0]!;
    expect(() => materializedRequest({ ...row, config: { scanPasses: [pass] } })).toThrow('private_input_refused:configuration');
  });
  it.each([
    { accessToken: 'x' }, { authTag: 'synthetic-sensitive-value' },
    { protectedReference: 'synthetic-sensitive-value' }, { nested: { $ref: 'synthetic' } },
    { nested: 'authorization=synthetic-sensitive-value' },
    { nested: 'https://example.test/rss?token=synthetic-sensitive-value' },
    { nested: 'text https://synthetic:synthetic@example.test/rss text' },
    { nested: 'token%3Dsynthetic-sensitive-value' }, { nested: { constructor: 'synthetic' } },
    { nested: { kind: 'credential_ref', id: 'synthetic' } }, { nested: 'credential_ref:synthetic' },
    { nested: '{"encrypted":true,"value":"synthetic"}' }, { nested: { auth: 'synthetic' } },
    { nested: ['-----BEGIN', ' PRIVATE KEY-----', 'synthetic-invalid-pem'].join('') },
    { nested: Array.from({ length: 129 }, () => null) }, { nested: 'a'.repeat(16_385) },
    { nested: Number.POSITIVE_INFINITY }, { nested: -0 }, { nested: Number.MAX_SAFE_INTEGER + 1 },
  ].map((value) => ({ value: value as unknown })))('rejects sensitive or unbounded values without exposing a value', ({ value }) => {
    expect(() => assertUnprotectedJson(value)).toThrow(/^private_input_refused:configuration$/u);
  });
  it('bounds recursive depth, total nodes and total UTF8 size before serializing', () => {
    let deep: unknown = 'synthetic';
    for (let index = 0; index < 10; index++) deep = { nested: deep };
    expect(() => assertUnprotectedJson(deep)).toThrow('configuration');
    expect(() => assertUnprotectedJson(Array.from({ length: 128 }, () => Array.from({ length: 128 }, () => null))))
      .toThrow('configuration');
    expect(() => assertUnprotectedJson({ a: '😀'.repeat(4096), b: '😀'.repeat(4096) }, 32_768)).toThrow('configuration');
  });
  const protectedArrays = [
    JSON.stringify([{ kind: 'credential_ref', id: 'x' }]),
    JSON.stringify([{ encrypted: true, value: 'x' }]),
  ].flatMap((value) => [value, encodeURIComponent(value)]);
  it.each(protectedArrays)('refuses serialized protected arrays at validation and scoped publication boundaries: %s', async (value) => {
    const rows = syntheticSnapshots();
    rows[0]!.capability.config.note = value;
    const unchanged = JSON.stringify(rows);
    expect(() => materializedRequest(validateSnapshot(rows[0]))).toThrow(/^private_input_refused:configuration$/u);
    expect(() => assertUnprotectedJson(value)).toThrow(/^private_input_refused:configuration$/u);
    const fake = fakeScopedPool(rows.map((snapshot) => ({ eligible: true, snapshot })));
    await expect(readScopedSnapshots(fake.pool)).rejects.toThrow(/^private_input_refused:database$/u);
    expect(fake.calls.at(-1)?.text).toBe('ROLLBACK');
    expect(fake.calls.some((call) => call.text === 'COMMIT')).toBe(false);
    const paths = await freshOutput();
    await expect(materializeSocialSep24PrivateInputs({ ...paths, readSnapshots: async () => rows }))
      .rejects.toThrow(/^private_input_refused:filesystem$/u);
    await expect(readFile(join(paths.outputRoot, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.stringify(rows)).toBe(unchanged);
  });
  it('recurses through nested objects, arrays and separately percent-encoded structured strings', () => {
    for (const value of protectedArrays) {
      for (const nested of [JSON.stringify([{ nested: [[value]] }]),
        encodeURIComponent(JSON.stringify({ nested: [value] }))]) {
        expect(() => assertUnprotectedJson(nested)).toThrow(/^private_input_refused:configuration$/u);
        const row = syntheticSnapshots()[0]!;
        expect(() => validateSnapshot({ ...row, interestQuery: nested })).toThrow('configuration');
        expect(() => materializedRequest(validateSnapshot({ ...row, config: { mode: 'search', query: nested } })))
          .toThrow('configuration');
      }
    }
  });
  it('applies existing bounds and metadata exceptions inside serialized arrays', () => {
    let deep: unknown = 'x';
    for (let index = 0; index < 9; index++) deep = [deep];
    for (const value of [JSON.stringify(Array.from({ length: 129 }, () => null)), JSON.stringify(deep),
      JSON.stringify(Array.from({ length: 128 }, () => Array.from({ length: 32 }, () => null))),
      JSON.stringify([Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`a${index}`, null]))]),
      JSON.stringify([{ requiresCredentials: false }]), JSON.stringify([{ kind: 'protected', id: 'x' }])]) {
      expect(() => assertUnprotectedJson(value, 65_536, true)).toThrow('configuration');
    }
    const flags = { requiresCredentials: false, tenantCredentialOverrideSupported: true, tokenRecommended: false };
    expect(() => assertUnprotectedJson(flags, 32_768, true)).not.toThrow();
    expect(() => assertUnprotectedJson({ requiresCredentials: 'false' }, 32_768, true)).toThrow('configuration');
  });
  it('preserves benign arrays and prose through scoped reading, requests, publication and admission', async () => {
    const values = ['  ordinary prose [x] {y}  ', '[ordinary prose',
      ' ["x", {"nested": [null, true, 1.25, "%78"]}] ',
      encodeURIComponent('["x", {"nested": [false, 2]}]'),
      JSON.stringify([encodeURIComponent(JSON.stringify({ nested: ['x'] }))])];
    const rows = syntheticSnapshots();
    rows[0]!.capability.config.notes = values;
    rows[0]!.config.query = values[2];
    const original = JSON.stringify(rows);
    for (const value of values) {
      expect(() => assertUnprotectedJson(value)).not.toThrow();
      expect(validateSnapshot({ ...rows[0]!, interestQuery: value }).interestQuery).toBe(value);
    }
    const reader = () => readScopedSnapshots(fakeScopedPool(rows.map((snapshot) => ({ eligible: true, snapshot }))).pool);
    expect(await reader()).toEqual(rows);
    const expected = materializedRequest(validateSnapshot(rows[0])).bytes;
    const paths = await freshOutput();
    const published = await materializeSocialSep24PrivateInputs({ ...paths, readSnapshots: reader });
    expect((await admitSocialSep24PrivateInputs(published.commit, reader)).redditRequestBytes).toEqual(expected);
    const stored = JSON.parse(await readFile(join(paths.outputRoot, 'snapshot.json'), 'utf8')) as { snapshots: unknown };
    expect(stored.snapshots).toEqual(rows);
    expect(expected.toString()).toBe(`${JSON.stringify([{ sourceBindingId: rows[0]!.scope.sourceBindingId, config: rows[0]!.config }], null, 2)}\n`);
    expect(JSON.stringify(rows)).toBe(original);
    for (const value of protectedArrays) {
      const changed = structuredClone(rows);
      changed[0]!.capability.config.note = value;
      await expect(admitSocialSep24PrivateInputs(published.commit, async () => changed)).rejects.toThrow(/^private_input_refused:drift$/u);
    }
  });
  it.each([
    { extraFeedUrls: [] }, { maxItems: 101 }, { mode: 'query' }, { query: 'https://example.test/different.xml' },
    { maxItemAgeHours: 745 }, { unknown: true }, { feedUrl: 'https://127.0.0.1/rss', query: 'https://127.0.0.1/rss' },
  ])('refuses an RSS config the selected consumer does not support', (change) => {
    const row = syntheticSnapshots()[1]!;
    expect(() => materializedRequest({ ...row, config: { ...row.config, ...change } })).toThrow('configuration');
  });
  it('rejects duplicate originals, ambiguous/extra fanout and an oversized exact request', () => {
    const row = syntheticSnapshots()[1]!;
    const extras = row.config.extraFeedUrls as string[];
    for (const extraFeedUrls of [[extras[0], ...extras.slice(0, 23)],
      ['https://news.google.com/rss/search?q=a+OR+b', ...extras.slice(1)]]) {
      expect(() => materializedRequest({ ...row, config: { ...row.config, extraFeedUrls } })).toThrow('configuration');
    }
    const feedUrl = 'https://news.google.com/rss/search?q=a&q=b';
    expect(() => materializedRequest({ ...row, config: { ...row.config, feedUrl, query: feedUrl } })).toThrow('configuration');
    const large = Array.from({ length: 24 }, (_, index) => `https://example.test/${index}/${'a'.repeat(800)}`);
    expect(() => materializedRequest({ ...row, config: { ...row.config, extraFeedUrls: large } })).toThrow('configuration');
  });
});
