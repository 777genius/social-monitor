// Reconstruct reviewed source; build in a disposable directory using a private
// copy of an explicitly supplied toolchain. Never resolve the host runtime.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [toolchain, output] = process.argv.slice(2);
assert.ok(toolchain && output, 'Usage: node scripts/rebuild-vioxen-subscription-runtime-quota-wire.mjs TOOLCHAIN_NODE_MODULES OUTPUT_TGZ');
const root = await mkdtemp(join(tmpdir(), 'sm-quota-wire-build-'));
const source = join(root, 'source');
const pack = join(root, 'pack');
const parent = JSON.parse(await readFile(join(repo, 'vendor/vioxen-subscription-runtime-0.1.0-main.42.provenance.json')));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function run(command, args, cwd = source, input) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  process.stdout.write(result.stdout);
}
await mkdir(source); await mkdir(pack);
for (const artifact of [parent.baseSource, parent.reviewedSourcePatch]) {
  assert.equal(hash(await readFile(join(repo, artifact.path))), artifact.sha256);
}
const parentArchive = join(repo, 'vendor/vioxen-subscription-runtime-0.1.0-main.42.tgz');
assert.equal(hash(await readFile(parentArchive)), parent.sha256);
run('tar', ['-xzf', join(repo, parent.baseSource.path), '-C', source]);
run('git', ['apply', join(repo, parent.reviewedSourcePatch.path)]);
run('git', ['apply', join(repo, 'vendor/patches/vioxen-subscription-runtime-0.1.0-main.42-sm.1.patch')]);
await cp(resolve(toolchain), join(source, 'node_modules'), { recursive: true });
for (const [name, version] of Object.entries({ typescript: '6.0.3', vitest: '4.1.8', '@types/node': '22.20.0' })) {
  assert.equal(JSON.parse(await readFile(join(source, 'node_modules', name, 'package.json'))).version, version);
}
run('npm', ['run', 'build']);
run('tar', ['-xzf', parentArchive, '-C', pack]);
const packageRoot = join(pack, 'package');
// Overlay only built outputs. Every other archive member remains the reviewed bytes.
await cp(join(source, 'dist'), join(packageRoot, 'dist'), { recursive: true });
await cp(join(source, 'packages/agent-account-observability/dist'),
  join(packageRoot, 'node_modules/@vioxen/agent-account-observability/dist'), { recursive: true });
const manifestPath = join(packageRoot, 'package.json');
const manifest = JSON.parse(await readFile(manifestPath));
manifest.version = '0.1.0-main.42-sm.1';
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
async function files(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(join(dir, entry.name), name + '/'));
    else { assert.ok(entry.isFile(), name); result.push(name); }
  }
  return result.sort();
}
// Fixed metadata and sorted regular members keep the thin profile reproducible.
run('tar', ['--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--no-recursion',
  '-czf', resolve(output), '-T', '-'], pack, (await files(pack)).join('\n') + '\n');
process.stdout.write(JSON.stringify({ source, archive: resolve(output), sha256: hash(await readFile(resolve(output))) }) + '\n');
