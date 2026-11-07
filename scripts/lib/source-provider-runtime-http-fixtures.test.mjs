import assert from 'node:assert/strict';
import test from 'node:test';
import {
  githubTrendingPageHtmlFixture,
  jsonResponse,
  readHeader,
} from './source-provider-runtime-http-fixtures.ts';

test('JSON fixture response keeps its status, body and default content type', async () => {
  const body = { ok: true, items: [1, 2] };
  const response = jsonResponse(body);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.deepEqual(await response.json(), body);
});

test('JSON fixture response preserves caller header overrides', () => {
  const response = jsonResponse(null, { 'content-type': 'application/problem+json', 'x-request-id': 'fixture-1' });
  assert.equal(response.headers.get('content-type'), 'application/problem+json');
  assert.equal(response.headers.get('x-request-id'), 'fixture-1');
});

test('trending fixture is stable and includes parsing markers', () => {
  const html = githubTrendingPageHtmlFixture();
  assert.equal(githubTrendingPageHtmlFixture(), html);
  for (const fragment of ['/openai/codex', 'programmingLanguage', 'TypeScript', '54,000', '5,100', '210 stars today']) {
    assert.ok(html.includes(fragment), fragment);
  }
});

test('header reader handles undefined and Headers with case-insensitive names', () => {
  assert.equal(readHeader(undefined, 'x-token'), undefined);
  const headers = new Headers({ 'X-Request-Id': 'test-request' });
  assert.equal(readHeader(headers, 'x-request-id'), 'test-request');
  assert.equal(readHeader(headers, 'not-present'), undefined);
});

test('header reader handles tuples and plain object lookups without rewriting names', () => {
  assert.equal(readHeader([['X-Request-Id', 'from-tuple']], 'x-request-id'), 'from-tuple');
  assert.equal(readHeader([['X-Request-Id', 'first'], ['x-request-id', 'second']], 'X-REQUEST-ID'), 'first');
  assert.equal(readHeader({ 'x-request-id': 'lowercase' }, 'X-Request-Id'), 'lowercase');
  assert.equal(readHeader({ 'x-request-id': 'lowercase' }, 'x-request-id'), 'lowercase');
  assert.equal(readHeader({ 'X-Request-Id': 'exact' }, 'X-Request-Id'), 'exact');
  assert.equal(readHeader({ 'X-Request-Id': 'exact' }, 'x-request-id'), undefined);
});
