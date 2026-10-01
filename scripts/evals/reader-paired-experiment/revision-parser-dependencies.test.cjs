'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const { parserDependencies } = require('./revision-parser-dependencies.cjs');
const { OLD, FINAL, revisionSource, sha } = require('./revision-source.cjs');
const { replayHost } = require('./replay-host.cjs');
const name = '@grpc/grpc-js';
const packageFile = require.resolve(`${name}/package.json`);
const constantsFile = require.resolve(`${name}/build/src/constants.js`);
const identityKey = `${name}/pure-status-contract.v1`;
const lockAt = revision => execFileSync('git', ['show', `${revision}:package-lock.json`]);
const historicalBytes = lockAt(FINAL);
const historical = JSON.parse(historicalBytes);
const current = JSON.parse(lockAt('e527491e0f102512a7936fb73a76d59ec2bfe4d5'));
const load = lock => parserDependencies(JSON.stringify(lock)).load(name);
const clone = value => JSON.parse(JSON.stringify(value));

// Independent oracle: the supplied package's TypeScript declaration, not the
// loader's proof constants or the grpc network entrypoint.
function declaredStatus() {
  const file = constantsFile.replace(/\.js$/, '.d.ts');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  const declaration = source.statements.find(s => ts.isEnumDeclaration(s) && s.name.text === 'Status');
  assert.ok(declaration);
  const status = {};
  for (const member of declaration.members) {
    assert.ok(ts.isNumericLiteral(member.initializer));
    const code = Number(member.initializer.text), label = member.name.text;
    status[label] = code; status[code] = label;
  }
  return status;
}

test('both immutable historical locks replay only Status using secure installed grpc', () => {
  const original = Buffer.from(historicalBytes);
  assert.equal(historical.packages[`node_modules/${name}`].version, '1.14.4');
  assert.equal(JSON.parse(fs.readFileSync(packageFile)).version, '1.14.5');
  for (const revision of [OLD, FINAL]) {
    const dependencies = parserDependencies(lockAt(revision));
    assert.deepEqual(dependencies.load(name).status, declaredStatus());
    const evidence = clone(dependencies.closure[identityKey]);
    const pin = JSON.parse(lockAt(revision)).packages[`node_modules/${name}`];
    assert.equal(evidence.mode, 'bounded-pure-status');
    assert.deepEqual(evidence.historical, { version: pin.version, resolved: pin.resolved, integrity: pin.integrity });
    assert.equal(evidence.installedVersion, '1.14.5');
    assert.equal(evidence.historicalLockSha256, sha(lockAt(revision)));
    assert.equal(evidence.statusSha256, sha(JSON.stringify(Object.entries(declaredStatus()).sort())));
    assert.equal(dependencies.closure[`${name}/package.json`], sha(fs.readFileSync(packageFile)));
    assert.equal(dependencies.closure[`${name}/build/src/constants.js`], sha(fs.readFileSync(constantsFile)));
    const repeated = parserDependencies(lockAt(revision)); repeated.load(name);
    assert.deepEqual(repeated.closure, dependencies.closure);
  }
  assert.deepEqual(historicalBytes, original);
});

test('exact secure lock remains exact and has a distinct deterministic identity', () => {
  const exact = parserDependencies(JSON.stringify(current)); exact.load(name);
  const replay = parserDependencies(historicalBytes); replay.load(name);
  assert.equal(exact.closure[identityKey].mode, 'exact-pure-status');
  assert.equal(exact.closure[identityKey].historical.version, '1.14.5');
  assert.notDeepEqual(exact.closure, replay.closure);
  assert.deepEqual(load(current).status, declaredStatus());
});

test('polluted Node module cache cannot replace the verified pure Status contract', () => {
  const cached = require.cache[constantsFile];
  try {
    require.cache[constantsFile] = { exports: { Status: { RESOURCE_EXHAUSTED: 99 }, Client: () => {} } };
    const grpc = load(historical);
    assert.deepEqual(grpc.status, declaredStatus());
    assert.throws(() => grpc.Client, /grpc_capability_forbidden:Client/);
  } finally {
    if (cached) require.cache[constantsFile] = cached;
    else delete require.cache[constantsFile];
  }
});

test('actual historical error classification and retry policy retain every status outcome', () => {
  const host = replayHost();
  try {
    for (const revision of [OLD, FINAL]) {
      const source = revisionSource(process.cwd(), revision, '2026-09-09T03:34:50.293Z', host);
      const { classifyAgentRuntimeError } = source.load('libs/summary/adapters/model/agent-runtime-model-support.ts');
      for (let code = 0; code <= 16; code++) {
        const outcome = source.invoke(classifyAgentRuntimeError, [{ code }, 'synthetic offline error']);
        assert.equal(outcome.kind, code === 8 ? 'provider_rate_limited' : 'provider_unavailable');
        assert.equal(outcome.retryable, [2, 4, 8, 13, 14].includes(code));
      }
      const identity = source.identity();
      assert.equal(identity.lockSha256, sha(lockAt(revision)));
      assert.equal(identity.parserDependencies[identityKey].historical.version, '1.14.4');
    }
  } finally { host.close(); }
});

test('unsupported or missing historical versions fail closed even when installed version matches', () => {
  for (const version of ['1.14.3', '1.14.6', '1.15.0', undefined]) {
    const lock = clone(historical); lock.packages[`node_modules/${name}`].version = version;
    assert.throws(() => load(lock), /parser_dependency_version_mismatch:@grpc\/grpc-js/);
  }
  const missing = clone(historical); delete missing.packages[`node_modules/${name}`];
  assert.throws(() => load(missing), /parser_dependency_version_mismatch:@grpc\/grpc-js/);
});

test('historical and exact lock integrity or resolved artifact changes are refused', () => {
  for (const baseline of [historical, current]) for (const field of ['integrity', 'resolved']) {
    const lock = clone(baseline); lock.packages[`node_modules/${name}`][field] += '-synthetic-change';
    assert.throws(() => load(lock), /parser_dependency_lock_mismatch:@grpc\/grpc-js/);
  }
});

function replaceRead(t, filename, change) {
  const read = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (file, ...args) => String(file) === filename
    ? change(read(file, ...args)) : read(file, ...args));
}

test('old, future and falsely matching installed versions are refused', t => {
  for (const version of ['1.14.4', '1.14.6', '1.15.0']) {
    replaceRead(t, packageFile, bytes => Buffer.from(JSON.stringify({ ...JSON.parse(bytes), version })));
    const lock = clone(historical); lock.packages[`node_modules/${name}`].version = version;
    assert.throws(() => load(lock), /parser_dependency_version_mismatch:@grpc\/grpc-js/);
    assert.throws(() => load(historical), /parser_dependency_version_mismatch:@grpc\/grpc-js/);
    t.mock.restoreAll();
  }
});

test('unexpected metadata and changed or augmented Status bytes fail before execution', t => {
  replaceRead(t, packageFile, bytes => Buffer.concat([bytes, Buffer.from('\n')]));
  assert.throws(() => load(historical), /parser_dependency_digest_mismatch:@grpc\/grpc-js/);
  t.mock.restoreAll();
  for (const change of [
    bytes => Buffer.from(bytes.toString().replace('"RESOURCE_EXHAUSTED"] = 8', '"RESOURCE_EXHAUSTED"] = 9')),
    bytes => Buffer.concat([bytes, Buffer.from('\nexports.Status.EXTRA = 17;')]),
    bytes => Buffer.concat([bytes, Buffer.from('\nthrow Error("untrusted bytes executed");')]),
  ]) {
    const original = fs.readFileSync(constantsFile), changed = change(original);
    assert.notDeepEqual(changed, original);
    replaceRead(t, constantsFile, () => changed);
    assert.throws(() => load(historical), /parser_dependency_digest_mismatch:@grpc\/grpc-js/);
    assert.throws(() => load(current), /parser_dependency_digest_mismatch:@grpc\/grpc-js/);
    t.mock.restoreAll();
  }
});

test('zod still requires its historical version and records the full installed closure', () => {
  const lock = clone(historical); lock.packages['node_modules/zod'].version = '4.4.2';
  assert.throws(() => parserDependencies(JSON.stringify(lock)).load('zod'), /parser_dependency_version_mismatch:zod/);
  const dependencies = parserDependencies(historicalBytes);
  const schema = dependencies.load('zod').fromJSONSchema({ type: 'object', properties: { count: { type: 'integer' } }, required: ['count'] });
  assert.deepEqual(schema.parse({ count: 3 }), { count: 3 });
  assert.throws(() => schema.parse({ count: 'synthetic-invalid' }));
  const root = path.dirname(require.resolve('zod/package.json'));
  assert.ok(Object.keys(dependencies.closure).length > 2);
  for (const [key, digest] of Object.entries(dependencies.closure)) {
    assert.ok(key.startsWith('zod/'));
    assert.equal(digest, sha(fs.readFileSync(path.join(root, key.slice(4)))));
  }
});

test('grpc capabilities and direct module imports remain forbidden; exposed enum is immutable', () => {
  const dependencies = parserDependencies(historicalBytes), grpc = dependencies.load(name);
  assert.deepEqual(Object.keys(grpc), ['status']);
  for (const capability of ['Client', 'Server', 'Channel', 'Metadata', 'credentials', 'makeGenericClientConstructor', 'loadPackageDefinition', 'constructor']) {
    assert.throws(() => grpc[capability], /grpc_capability_forbidden/);
  }
  assert.throws(() => { grpc.status.OK = 99; }, TypeError);
  assert.throws(() => { grpc.status = {}; }, TypeError);
  assert.throws(() => Object.defineProperty(grpc, 'Client', { value: () => {} }), TypeError);
  for (const specifier of ['node:fs', 'node:net', 'node:http2', `${name}/build/src/index.js`, `${name}/build/src/constants.js`]) {
    assert.throws(() => dependencies.load(specifier), /parser_dependency_forbidden/);
  }
  assert.equal(require.cache[require.resolve(name)], undefined);
  assert.equal(require.cache[constantsFile], undefined);
});
