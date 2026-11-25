'use strict';
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const path = require('node:path').posix;
const ts = require('typescript');
const OLD = 'a88f6161197b7bf96315ae83969e49e51a833c2b';
const FINAL = 'e8b867268744c0047a42d813e6024b1cf4463096';
const sha = value => createHash('sha256').update(value).digest('hex');
const digest = value => sha(JSON.stringify(value));
function check(condition, message) { if (!condition) throw new Error(message); }
const blobCache = new Map(), compileCache = new Map();
const admissionFiles = new Set([
  'apps/agent-runtime/src/subscription-runtime-purpose-model-policy.ts',
  'apps/agent-runtime/src/reader-promotion-v2-canary-contract.ts',
  'apps/agent-runtime/bin/reader-promotion-v2-canary-contract.cjs',
]);
const canaryBridge = 'apps/agent-runtime/src/reader-promotion-v2-canary-contract.ts';
const canaryContract = 'apps/agent-runtime/bin/reader-promotion-v2-canary-contract.cjs';
function revisionSource(repo, revision, clock, host) {
  check([OLD, FINAL].includes(revision), 'unapproved revision');
  const git = args => execFileSync('git', ['-C', repo, ...args], { maxBuffer: 32 * 1024 * 1024 });
  check(git(['rev-parse', `${revision}^{commit}`]).toString().trim() === revision, 'revision mismatch');
  const tree = new Map(git(['ls-tree', '-r', revision]).toString().trim().split('\n').map(line => {
    const [meta, name] = line.split('\t'); return [name, meta.split(' ')];
  }));
  const source = name => { check(tree.has(name), `missing revision file: ${name}`);
    check(tree.get(name)[0] === '100644' || tree.get(name)[0] === '100755', 'source symlink forbidden');
    const blob = tree.get(name)[2];
    if (!blobCache.has(blob)) blobCache.set(blob, git(['cat-file', 'blob', blob]));
    return blobCache.get(blob);  };
  const configBytes = source('tsconfig.json');
  const config = ts.parseConfigFileTextToJson('tsconfig.json', configBytes.toString());
  check(!config.error && !config.config.extends, 'unsupported revision tsconfig');
  const options = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, '.').options;
  const lockBytes = source('package-lock.json');
  const compilerLock = JSON.parse(lockBytes).packages['node_modules/typescript'];
  check(compilerLock?.version === ts.version, 'local compiler version does not match revision lock');
  const modules = new Map(), closure = {};
  const dependencies = host ? require('./revision-parser-dependencies.cjs').parserDependencies(lockBytes) : undefined;
  const context = vm.createContext({ ...host?.globals, URL, TextEncoder, TextDecoder, __isDate: require('node:util').types.isDate }, { codeGeneration: { strings: false, wasm: false } });
  new vm.Script(`const NativeDate = Date; Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [${JSON.stringify(clock)}])); }
    static [Symbol.hasInstance](value) { return __isDate(value); }
    static now() { return new NativeDate(${JSON.stringify(clock)}).getTime(); }
  }; Math.random = () => { throw Error('randomness forbidden'); };`).runInContext(context);
  function resolve(specifier, parent) {
    let base = specifier.startsWith('.') ? path.join(path.dirname(parent), specifier) : undefined;
    if (!base) for (const [alias, targets] of Object.entries(options.paths || {})) {
      const [prefix, suffix = ''] = alias.split('*');
      if (alias === specifier || (alias.includes('*') && specifier.startsWith(prefix) && specifier.endsWith(suffix))) {
        check(targets.length === 1, 'ambiguous revision alias');
        base = targets[0].replace('*', specifier.slice(prefix.length, suffix ? -suffix.length : undefined)); break;
      }
    }
    check(base && !base.startsWith('../'), `external dependency forbidden: ${specifier}`);
    const name = [base, `${base}.ts`, `${base}/index.ts`].find(p => tree.has(p));
    check(name && ((name.startsWith('libs/') && name.endsWith('.ts')) || (host && admissionFiles.has(name))), `outside source closure: ${specifier}`);
    return name;
  }
  function load(name) {
    check((name.startsWith('libs/') && name.endsWith('.ts')) || (host && admissionFiles.has(name)), 'entry_outside_source_closure');
    if (modules.has(name)) return modules.get(name).exports;
    const bytes = source(name); closure[name] = { gitBlob: tree.get(name)[2], sha256: sha(bytes) };
    const cacheKey = `${sha(configBytes)}:${tree.get(name)[2]}:${name}`;
    if (!compileCache.has(cacheKey)) compileCache.set(cacheKey, name.endsWith('.cjs') ? { outputText: bytes.toString() } : ts.transpileModule(bytes.toString(), { compilerOptions: { ...options,
      declaration: false, sourceMap: false, incremental: false }, fileName: name }));
    const output = compileCache.get(cacheKey);
    const module = { exports: {} }; modules.set(name, module);
    const bridgeRequire = specifier => {
      // The sole virtual filesystem/module capability serves the immutable
      // canary contract imported by admission. It cannot access the host FS.
      if (specifier === 'node:path') return Object.freeze({ join: path.join });
      if (specifier === 'node:fs') return Object.freeze({ existsSync: filename => {
        check(filename === `/revision/${canaryContract}`, 'virtual_file_forbidden');
        return tree.has(canaryContract);
      } });
      if (specifier === 'node:module') return Object.freeze({ createRequire: filename => {
        check(filename === `/revision/${canaryBridge}`, 'virtual_require_origin_forbidden');
        return target => {
          check(target === `/revision/${canaryContract}`, 'virtual_require_target_forbidden');
          return load(canaryContract);
        };
      } });
      throw Error('virtual_builtin_forbidden');
    };
    const localRequire = specifier => host && name === canaryBridge && ['node:fs', 'node:path', 'node:module'].includes(specifier)
      ? bridgeRequire(specifier) : host && ['zod', '@grpc/grpc-js'].includes(specifier)
      ? dependencies.load(specifier) : ['crypto', 'node:crypto'].includes(specifier)
      ? Object.freeze({ createHash }) : specifier === 'node:util'
        ? Object.freeze({ types: require('node:util').types }) : load(resolve(specifier, name));
    context.__module = module; context.__require = localRequire;
    new vm.Script(`(function(require,module,exports,__filename,__dirname){${output.outputText}\n})(__require,__module,__module.exports,${JSON.stringify(`/revision/${name}`)},${JSON.stringify(`/revision/${path.dirname(name)}`)})`,
      // Cold module initialization includes nested Git reads/transpilation.
      // Keep actual selector invocation at 10s; initialization has a separate cap.
      { filename: `${revision}/${name}` }).runInContext(context, { timeout: 60000 });
    return module.exports;
  }
  return { load, invoke(fn, args) { context.__fn = fn; context.__args = args;
    return new vm.Script('__fn(...__args)').runInContext(context, { timeout: 10000 }); },
  identity: () => ({ revision, tree: git(['rev-parse', `${revision}^{tree}`]).toString().trim(),
    tsconfigSha256: sha(configBytes), lockSha256: sha(lockBytes), compilerVersion: ts.version,
    compilerSha256: sha(require('node:fs').readFileSync(require.resolve('typescript'))),
    nodeVersion: process.version, closure: { ...closure }, closureSha256: digest(closure),
    parserDependencies: { ...dependencies?.closure } }) };
}
module.exports = { OLD, FINAL, sha, digest, check, revisionSource };
