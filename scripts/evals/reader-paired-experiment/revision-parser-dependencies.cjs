'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
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
      const filename = require.resolve('@grpc/grpc-js/build/src/constants.js');
      pin(name, filename);
      const status = Object.freeze({ ...require(filename).Status });
      return new Proxy({ status }, { get(target, key) {
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
