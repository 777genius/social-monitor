import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateArtifactRedaction,
  validateArtifactSourceExports,
  validateArtifactSurfaces,
  validateRequiredSourceExports,
  validateArtifactReview,
} from './security-final-sweep-surface-policy.mjs';

const evidencePath = 'ops/security/security-final-sweep-evidence.json';
const requiredSurfaceIds = new Set(['logs', 'metrics', 'public-errors', 'audit-metadata']);
const requiredLeakClasses = new Set(['secret-values', 'raw-provider-payloads', 'raw-prompt-or-source-text']);
const requiredSourceExportEnvBySurface = new Map([
  ['logs', 'LOG_EXPORT_PATH'],
  ['metrics', 'METRICS_EXPORT_PATH'],
  ['public-errors', 'PUBLIC_ERROR_EXPORT_PATH'],
  ['audit-metadata', 'AUDIT_EVENT_EXPORT_PATH'],
]);
const requiredArtifactRedactionFlags = {
  secretValuesIncluded: false,
  credentialUrlsIncluded: false,
  rawProviderPayloadsIncluded: false,
  rawPromptTextIncluded: false,
  rawSourceTextIncluded: false,
  piiIncluded: false,
};
const validAt = '2026-11-08T12:00:00Z';
function context(violations = [], calls = []) {
  return {
    violations, evidencePath, requiredSurfaceIds, requiredLeakClasses,
    requiredSourceExportEnvBySurface, requiredArtifactRedactionFlags,
    forbiddenArtifactKeys: new Set(['accesstoken', 'rawsource']),
    isIsoDateString: (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)),
    validateSourceExportPath: (...args) => calls.push(args),
  };
}
function exports() {
  return [...requiredSourceExportEnvBySurface].map(([surfaceId, envVar]) => ({
    surfaceId, envVar, sampleCount: 1, redactedOnly: true,
    sanitized: true, collectedAt: validAt,
  }));
}
function surfaces() {
  return [...requiredSurfaceIds].map((surfaceId) => ({
    surfaceId, sampleCount: 1, scanStatus: 'passed', redactedOnly: true,
    safeDiagnosticFields: ['status'],
    leakClassResults: [...requiredLeakClasses].map((leakClass) => ({
      leakClass, found: false, sampleCount: 1,
    })),
  }));
}
const exportMap = () => new Map(exports().map((e) => [e.surfaceId, e]));

test('valid security redaction stays unchanged and appends no diagnostics', () => {
  const flags = { ...requiredArtifactRedactionFlags, method: 'Sanitized staging exports with verified private export files.' };
  const before = globalThis.structuredClone(flags);
  const c = context();
  validateArtifactRedaction(flags, 'artifact', c);
  assert.deepEqual(c.violations, []);
  assert.deepEqual(flags, before);
});

test('invalid redaction preserves the original field-specific diagnostics', () => {
  const c = context();
  validateArtifactRedaction(null, 'artifact', c);
  validateArtifactRedaction({ ...requiredArtifactRedactionFlags, rawProviderPayloadsIncluded: true, method: 'short' }, 'artifact', c);
  assert.deepEqual(c.violations, [
    'artifact: redaction must be an object',
    'artifact: redaction.rawProviderPayloadsIncluded must be false',
    'artifact: redaction.method must explain how staging samples were sanitized',
  ]);
});

test('valid source exports retain ordered map and caller-owned file checks', () => {
  const calls = [], c = context([], calls);
  const rows = exports(), original = globalThis.structuredClone(rows);
  const result = validateArtifactSourceExports(rows, 'artifact', { allowExample: true }, c);
  assert.deepEqual([...result.keys()], [...requiredSurfaceIds]);
  assert.deepEqual(calls.map((args) => args[2]), [...requiredSourceExportEnvBySurface.values()]);
  assert.equal(calls.length, 4);
  assert.deepEqual(c.violations, []);
  assert.deepEqual(rows, original);
});

test('non-array source exports fail closed with empty result map', () => {
  const c = context();
  assert.deepEqual([...validateArtifactSourceExports(null, 'artifact', {}, c)], []);
  assert.deepEqual(c.violations, ['artifact: sourceExports must be an array']);
});

test('malformed source export fields fail closed without disabling path validation', () => {
  const calls = [], c = context([], calls), rows = exports();
  rows[0] = { ...rows[0], envVar: 'WRONG', sampleCount: 0, redactedOnly: false, sanitized: false, collectedAt: 'bad' };
  validateArtifactSourceExports(rows, 'artifact', { allowExample: false }, c);
  assert.deepEqual(c.violations, [
    'artifact: sourceExports[0]: envVar must be LOG_EXPORT_PATH',
    'artifact: sourceExports[0]: sampleCount must be a positive integer',
    'artifact: sourceExports[0]: redactedOnly must be true',
    'artifact: sourceExports[0]: sanitized must be true',
    'artifact: sourceExports[0]: collectedAt must be an ISO timestamp',
  ]);
  assert.equal(calls.length, 4);
});

test('duplicate and unsupported source exports keep the diagnostic order', () => {
  const [logs] = exports(), c = context();
  validateArtifactSourceExports([logs, { ...logs }, { ...logs, surfaceId: 'unknown' }, null], 'artifact', {}, c);
  assert.deepEqual(c.violations, [
    'artifact: sourceExports[1]: duplicate source export for surfaceId "logs"',
    'artifact: sourceExports[2]: unsupported surfaceId "unknown"',
    'artifact: sourceExports[3]: source export must be an object',
    'artifact: sourceExports must include metrics from METRICS_EXPORT_PATH',
    'artifact: sourceExports must include public-errors from PUBLIC_ERROR_EXPORT_PATH',
    'artifact: sourceExports must include audit-metadata from AUDIT_EVENT_EXPORT_PATH',
  ]);
});

test('valid surface records retain source-export counts and redaction proof', () => {
  const data = surfaces(), before = globalThis.structuredClone(data), c = context();
  validateArtifactSurfaces(data, 'artifact', exportMap(), c);
  assert.deepEqual(c.violations, []);
  assert.deepEqual(data, before);
});

test('non-array surfaces fail closed', () => {
  const c = context();
  validateArtifactSurfaces(null, 'artifact', exportMap(), c);
  assert.deepEqual(c.violations, ['artifact: surfaces must be an array']);
});

test('duplicate and missing surfaces keep the required order', () => {
  const [logs] = surfaces(), c = context();
  validateArtifactSurfaces([logs, { ...logs }], 'artifact', exportMap(), c);
  assert.deepEqual(c.violations, [
    'artifact: surfaces[1]: duplicate surfaceId "logs"',
    'artifact: surfaces must include metrics',
    'artifact: surfaces must include public-errors',
    'artifact: surfaces must include audit-metadata',
  ]);
});

test('unsafe diagnostic field and non-redacted surface are rejected', () => {
  const data = surfaces(), c = context();
  data[0].sampleCount = 0; data[0].scanStatus = 'failed'; data[0].redactedOnly = false;
  data[0].safeDiagnosticFields = ['access-token', ''];
  validateArtifactSurfaces(data, 'artifact', exportMap(), c);
  assert.deepEqual(c.violations, [
    'artifact: surfaces[0]: sampleCount must be a positive integer',
    'artifact: surfaces[0]: scanStatus must be passed',
    'artifact: surfaces[0]: redactedOnly must be true',
    'artifact: surfaces[0]: sampleCount must match sourceExports sampleCount',
    'artifact: surfaces[0]: unsafe diagnostic field "access-token"',
    'artifact: surfaces[0]: safeDiagnosticFields must contain non-empty strings',
  ]);
});

test('missing leak class results are rejected', () => {
  const data = surfaces(), c = context();
  data[0].leakClassResults = null;
  validateArtifactSurfaces(data, 'artifact', exportMap(), c);
  assert.deepEqual(c.violations, ['artifact: surfaces[0]: leakClassResults must be an array']);
});

test('unsafe leak-class findings and duplicate classes retain original diagnostics', () => {
  const data = surfaces(), c = context();
  data[0].leakClassResults = [
    { leakClass: 'secret-values', found: true, sampleCount: 0 },
    { leakClass: 'secret-values', found: false, sampleCount: 1 },
    { leakClass: 'unknown', found: false, sampleCount: 1 }, null,
  ];
  validateArtifactSurfaces(data, 'artifact', exportMap(), c);
  assert.deepEqual(c.violations, [
    'artifact: surfaces[0].leakClassResults[0]: found must be false',
    'artifact: surfaces[0].leakClassResults[0]: sampleCount must be a positive integer',
    'artifact: surfaces[0].leakClassResults[1]: duplicate leakClass "secret-values"',
    'artifact: surfaces[0].leakClassResults[2]: unsupported leakClass "unknown"',
    'artifact: surfaces[0].leakClassResults[3]: result must be an object',
    'artifact: surfaces[0]: leakClassResults must include raw-provider-payloads',
    'artifact: surfaces[0]: leakClassResults must include raw-prompt-or-source-text',
  ]);
});

test('complete required source export schema passes', () => {
  const c = context();
  const required = exports().map((x) => ({
    surfaceId: x.surfaceId, envVar: x.envVar, pathRequired: true, sha256Required: true, redactedOnly: true,
  }));
  validateRequiredSourceExports(required, c);
  assert.deepEqual(c.violations, []);
});

test('invalid required exports retain field errors, duplicates and missing coverage', () => {
  const c = context();
  validateRequiredSourceExports([
    { surfaceId: 'logs', envVar: 'WRONG', pathRequired: false, sha256Required: false, redactedOnly: false },
    { surfaceId: 'logs', envVar: 'LOG_EXPORT_PATH', pathRequired: true, sha256Required: true, redactedOnly: true },
  ], c);
  assert.deepEqual(c.violations, [
    evidencePath + ': deploySampleContentSchema.requiredSourceExports[0].envVar must be LOG_EXPORT_PATH',
    evidencePath + ': deploySampleContentSchema.requiredSourceExports[0].pathRequired must be true',
    evidencePath + ': deploySampleContentSchema.requiredSourceExports[0].sha256Required must be true',
    evidencePath + ': deploySampleContentSchema.requiredSourceExports[0].redactedOnly must be true',
    evidencePath + ': duplicate required source export for "logs"',
    evidencePath + ': deploySampleContentSchema.requiredSourceExports must include metrics',
    evidencePath + ': deploySampleContentSchema.requiredSourceExports must include public-errors',
    evidencePath + ': deploySampleContentSchema.requiredSourceExports must include audit-metadata',
  ]);
});

test('review policy keeps prior diagnostics and accepts complete review', () => {
  const c = context(['prior']);
  validateArtifactReview({ reviewer: 'security-owner', decision: 'passed',
    notes: 'Redacted staging evidence was independently reviewed.' }, 'artifact', c);
  assert.deepEqual(c.violations, ['prior']);
});

test('missing and invalid review records fail closed', () => {
  const c = context();
  validateArtifactReview(null, 'artifact', c);
  validateArtifactReview({ reviewer: '', decision: 'pending', notes: 'short' }, 'artifact', c);
  assert.deepEqual(c.violations, [
    'artifact: review must be an object',
    'artifact: review.reviewer must be a non-empty string',
    'artifact: review.decision must be passed',
    'artifact: review.notes must explain the staging redaction review',
  ]);
});

test('malformed non-iterable diagnostic field object fails closed without short-circuiting later surfaces', () => {
  const rows = surfaces();
  rows[0].safeDiagnosticFields = { unexpected: 'not-an-array' };
  rows[0].leakClassResults = [];
  rows[1].scanStatus = 'failed';
  const ctx = context();
  validateArtifactSurfaces(rows, 'artifact', exportMap(), ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: surfaces[0]: safeDiagnosticFields must be a non-empty array',
    'artifact: surfaces[0]: leakClassResults must include secret-values',
    'artifact: surfaces[0]: leakClassResults must include raw-provider-payloads',
    'artifact: surfaces[0]: leakClassResults must include raw-prompt-or-source-text',
    'artifact: surfaces[1]: scanStatus must be passed',
  ]);
});

test('numeric and string diagnostic field values are rejected without reading individual characters', () => {
  const rows = surfaces();
  rows[0].safeDiagnosticFields = 7;
  rows[1].safeDiagnosticFields = 'access-token';
  const ctx = context();
  validateArtifactSurfaces(rows, 'artifact', exportMap(), ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: surfaces[0]: safeDiagnosticFields must be a non-empty array',
    'artifact: surfaces[1]: safeDiagnosticFields must be a non-empty array',
  ]);
});
