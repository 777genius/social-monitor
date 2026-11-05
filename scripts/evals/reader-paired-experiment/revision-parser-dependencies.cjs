'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Eval-only proof for the standard gRPC Status code enum (including its reverse
// mapping), not semver or runtime compatibility. These are the ONLY admitted
// lock artifacts; the installed implementation must be the secure 1.14.5 bytes.
// No historical package-byte equality is asserted or historical lock rewritten.
const grpcIntegrities = new Map([
  ['1.14.4', 'sha512-k9Dj3DV/itK9D06Y8f190Qgop7/Ui+D0njFV3LHMPwPT75DpXLQohE9Wmz0QElrJnzsjB7KPWiKJbOl7IPDArQ=='],
  ['1.14.5', 'sha512-7VZM+SVdEcUUqSQeNI3zM8Qs/BhQKZndPo2h5VkYkAM8Iz0wJIa8mKV5ekQGqG8UUsnkQ0NMxIxwkIHYvj0qOw=='],
]);
const grpcBytes = {
  'package.json': '901cce55ec87cd1e633f2fa4a4b1d41131cc35d6a76ab328c92a1d76b117e2b8',
  'build/src/constants.js': '24e18395d722626f978df87d9b3e24174cca482bd5369ce89cd414b7aa27971c',
};
const statusNames = [
  'OK', 'CANCELLED', 'UNKNOWN', 'INVALID_ARGUMENT', 'DEADLINE_EXCEEDED',
  'NOT_FOUND', 'ALREADY_EXISTS', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED',
  'FAILED_PRECONDITION', 'ABORTED', 'OUT_OF_RANGE', 'UNIMPLEMENTED', 'INTERNAL',
  'UNAVAILABLE', 'DATA_LOSS', 'UNAUTHENTICATED',
];
const statusContract = Object.fromEntries(statusNames.flatMap((name, code) => [[name, code], [String(code), name]]));
const canonicalStatus = status => JSON.stringify(Object.entries(status).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
// Only the schema interpreter and gRPC's pure status enum are exposed. Loading
// the grpc entrypoint would expose network clients and is intentionally avoided.
function parserDependencies(lockBytes) {
  const lock = JSON.parse(lockBytes), closure = {};
  function pin(name, filename) {
    const packageFile = require.resolve(`${name}/package.json`);
    const root = path.dirname(packageFile);
    const metadata = JSON.parse(fs.readFileSync(packageFile));
    if (lock.packages[`node_modules/${name}`]?.version !== metadata.version) throw Error(`parser_dependency_version_mismatch:${name}`);
    for (const file of [packageFile, filename]) closure[`${name}/${path.relative(root, file)}`] = hash(fs.readFileSync(file));
    return root;
  }
  function load(name) {
    if (name === '@grpc/grpc-js') {
      const historical = lock.packages[`node_modules/${name}`];
      const packageFile = require.resolve(`${name}/package.json`);
      const packageBytes = fs.readFileSync(packageFile), metadata = JSON.parse(packageBytes);
      if (!grpcIntegrities.has(historical?.version) || metadata.version !== '1.14.5') {
        throw Error(`parser_dependency_version_mismatch:${name}`);
      }
      if (historical.integrity !== grpcIntegrities.get(historical.version) ||
          historical.resolved !== `https://registry.npmjs.org/@grpc/grpc-js/-/grpc-js-${historical.version}.tgz`) {
        throw Error(`parser_dependency_lock_mismatch:${name}`);
      }
      const filename = require.resolve('@grpc/grpc-js/build/src/constants.js');
      const bytes = fs.readFileSync(filename);
      if (hash(packageBytes) !== grpcBytes['package.json'] || hash(bytes) !== grpcBytes['build/src/constants.js']) {
        throw Error(`parser_dependency_digest_mismatch:${name}`);
      }
      // Execute the verified bytes themselves: neither a network entrypoint nor
      // a possibly stale/mutated require.cache value is part of this capability.
      const context = vm.createContext({ exports: {} }, { codeGeneration: { strings: false, wasm: false } });
      new vm.Script(bytes.toString(), { filename }).runInContext(context, { timeout: 1000 });
      const status = Object.freeze({ ...context.exports.Status });
      if (canonicalStatus(status) !== canonicalStatus(statusContract)) throw Error('grpc_status_contract_mismatch');
      closure[`${name}/package.json`] = hash(packageBytes);
      closure[`${name}/build/src/constants.js`] = hash(bytes);
      // This identity separates historical evidence from the installed bytes.
      // revisionSource includes it unchanged in its deterministic source identity.
      closure[`${name}/pure-status-contract.v1`] = Object.freeze({
        mode: historical.version === metadata.version ? 'exact-pure-status' : 'bounded-pure-status',
        historical: Object.freeze({ version: historical.version, resolved: historical.resolved, integrity: historical.integrity }),
        historicalLockSha256: hash(lockBytes), installedVersion: metadata.version,
        statusSha256: hash(canonicalStatus(status)),
      });
      return new Proxy(Object.freeze({ status }), { get(target, key) {
        if (key === 'status') return target.status;
        throw Error(`grpc_capability_forbidden:${String(key)}`);
      } });
    }
    if (name !== 'zod') throw Error(`parser_dependency_forbidden:${name}`);
    const filename = require.resolve('zod'), root = pin(name, filename);
    const zod = require(filename);
    const visit = (module, seen = new Set()) => {
      if (seen.has(module.id)) return; seen.add(module.id);
      if (!module.filename.startsWith(root + path.sep)) throw Error('zod_external_dependency_forbidden');
      closure[`zod/${path.relative(root, module.filename)}`] = hash(fs.readFileSync(module.filename));
      module.children.forEach(child => visit(child, seen));
    };
    visit(require.cache[filename]);
    return Object.freeze({ fromJSONSchema: zod.fromJSONSchema });
  }
  return { load, closure };
}
module.exports = { parserDependencies };
