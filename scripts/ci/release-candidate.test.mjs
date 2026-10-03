import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { existsSync } from 'node:fs';

// Process-seam tests have synthetic identities even when the parent runs in CI.
const ciEnvironment = { sha: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID };
delete process.env.GITHUB_SHA;
delete process.env.GITHUB_RUN_ID;
after(() => {
  if (ciEnvironment.sha !== undefined) process.env.GITHUB_SHA = ciEnvironment.sha;
  if (ciEnvironment.run !== undefined) process.env.GITHUB_RUN_ID = ciEnvironment.run;
});
import { candidate, checksum, command, qualify, readJson, validateManifest } from './release-candidate.mjs';

const sha = 'c9dd4f5b903c777a6a378e3233b5353d08702424';
const digest = character => 'sha256:' + character.repeat(64);
const graph = () => ({ kind: 'oci-manifest', root_digest: digest('a'),
  descriptor: { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: digest('a'), size: 410 },
  config_digest: digest('b'),
  config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: digest('b'), size: 300 },
  layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: digest('c'), size: 10240 }],
  diff_ids: [digest('c')] });
const manifest = () => ({ sha, ci_run_id: '123', archive_sha256: digest('d'), image_id: digest('a'),
  archive_bytes: 20480, image_graph: graph(), migrations: [{ name: '20260101000000_initial', checksum: 'e'.repeat(64) }] });

test('strict finite native manifest and migration grammar', () => {
  // Red trigger: accept an index/config identity, unknown field, unsafe name,
  // duplicate SQL inventory or abbreviated source identity.
  assert.equal(validateManifest(manifest()).sha, sha);
  for (const mutate of [
    m => { m.sha = sha.slice(0, 12); },
    m => { m.ci_run_id = 123; },
    m => { m.archive_sha256 = '../candidate.tar'; },
    m => { m.archive_bytes = Number.POSITIVE_INFINITY; },
    m => { m.archive_bytes = 10_000_000_001; },
    m => { m.path = '/tmp/foreign'; },
    m => { m.image_graph.config_digest = m.image_id; },
    m => { m.image_graph.descriptor.mediaType = 'application/vnd.oci.image.index.v1+json'; },
    m => { m.image_graph.descriptor.platform = { os: 'linux', architecture: 'arm64' }; },
    m => { m.image_graph.descriptor.annotations = { 'org.opencontainers.image.ref.name': 'latest' }; },
    m => { m.migrations[0].name = '../20260101000000_initial'; },
    m => { m.migrations[0].checksum = 'e'.repeat(63); },
    m => { m.migrations.push({ ...m.migrations[0] }); },
  ]) {
    const value = manifest(); mutate(value);
    assert.throws(() => validateManifest(value));
  }
});

async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sm-candidate-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function processFixture(directory) {
  const calls = [];
  let wrongImage = false, failQualification = true, failExport = false, failArchive = false;
  const run = async (program, args, options = {}) => {
    calls.push([program, ...args]);
    if (program === 'git') {
      if (args[0] === 'archive') { if (failArchive) throw new Error('snapshot-failed'); await writeFile(options.output, 'synthetic committed Git snapshot'); return ''; }
      return args[0] === 'rev-parse' ? sha + '\n' : '';
    }
    if (program === 'python3') {
      if (failQualification) throw new Error('qualification-failed');
      return JSON.stringify({ migrations: manifest().migrations, image_graph: graph() });
    }
    if (args[0] === 'version') return JSON.stringify({ Version: '29.8.1' });
    if (args[0] === 'info') return JSON.stringify({ OSType: 'linux', Architecture: 'x86_64',
      DriverStatus: [['driver-type', 'io.containerd.snapshotter.v1']] });
    if (args[0] === 'build') { await writeFile(args[args.indexOf('--iidfile') + 1], digest('a')); return ''; }
    if (args[1] === 'inspect') return JSON.stringify([{ Id: wrongImage ? digest('f') : digest('a'),
      Os: 'linux', Architecture: 'amd64', Config: { Labels: {
        'org.opencontainers.image.revision': sha, 'social-monitor.ci-run-id': '123' } },
      Descriptor: graph().descriptor, RootFS: { Type: 'layers', Layers: graph().diff_ids } }]);
    if (args[1] === 'save') {
      if (failExport) throw new Error('export-failed');
      await writeFile(options.output, 'synthetic archive bytes: process seam only'); return '';
    }
    throw new Error('unexpected-command:' + program + ':' + args.join(' '));
  };
  return { run, calls, directory,
    set qualification(value) { failQualification = value; },
    set wrongImage(value) { wrongImage = value; },
    set failExport(value) { failExport = value; },
    set failArchive(value) { failArchive = value; } };
}

test('qualification/upload retry retains exact build and export and rereads identity', async t => {
  // Red trigger: a failed proof causes another build/save, or resume trusts the
  // phase file without observing current checkout and exact image again.
  const directory = await temporary(t);
  const fixture = processFixture(directory);
  const options = { directory, sha, runId: '123', controllerDir: '/synthetic/controller' };
  const emitted = [];
  await assert.rejects(candidate(options, fixture.run, state => emitted.push(state)), /qualification-failed/);
  assert.equal((await readJson(path.join(directory, 'phases.json'))).phase, 'exported');
  assert.equal(emitted.find(state => state.phase === 'built').image_id, digest('a'));
  fixture.qualification = false;
  await candidate(options, fixture.run, () => {});
  await candidate(options, fixture.run, () => {}); // upload-only retry
  assert.equal(fixture.calls.filter(c => c[1] === 'build').length, 1);
  assert.equal(fixture.calls.filter(c => c[2] === 'save').length, 1);
  assert.equal(fixture.calls.filter(c => c[0] === 'python3').length, 2); // failed proof plus one success
  assert.ok(fixture.calls.filter(c => c[1] === 'rev-parse').length >= 3);
  assert.ok(fixture.calls.filter(c => c[2] === 'inspect').length >= 3);
  const build = fixture.calls.find(c => c[1] === 'build');
  assert.ok(build.includes('--provenance=false'));
  assert.ok(build.includes('linux/amd64'));
  assert.ok(!build.includes('--tag'));
  assert.equal(build.at(-1), '-');
  assert.deepEqual(fixture.calls.find(c => c[1] === 'archive'), ['git', 'archive', '--format=tar', sha]);
  assert.deepEqual(fixture.calls.find(c => c[2] === 'save'), ['docker', 'image', 'save', digest('a')]);
  const final = await readJson(path.join(directory, 'manifest.json'));
  assert.equal(final.archive_sha256, (await checksum(path.join(directory, 'candidate.tar'))).sha256);
  const manifestFile = path.join(directory, 'manifest.json');
  const provedManifest = await readFile(manifestFile);
  await writeFile(manifestFile, JSON.stringify({ ...final, archive_bytes: final.archive_bytes + 1 }));
  await assert.rejects(candidate(options, fixture.run, () => {}), /qualified-manifest-changed/);
  await writeFile(manifestFile, provedManifest);
  fixture.wrongImage = true;
  await assert.rejects(candidate(options, fixture.run, () => {}), /image-identity-mismatch/);
  await assert.rejects(candidate({ ...options, runId: '124' }, fixture.run, () => {}), /resume-identity-mismatch/);
  await writeFile(path.join(directory, 'candidate.tar'), 'mutated archive bytes');
  fixture.wrongImage = false;
  await assert.rejects(candidate(options, fixture.run, () => {}), /export-identity-mismatch/);
});

test('failed export resumes only export; ambiguous interrupted build never rebuilds', async t => {
  // Red trigger: treating an unproved build intent as permission to build again.
  const directory = await temporary(t);
  const fixture = processFixture(directory);
  fixture.failExport = true;
  const options = { directory, sha, runId: '123', controllerDir: '/synthetic/controller' };
  await assert.rejects(candidate(options, fixture.run, () => {}), /export-failed/);
  fixture.failExport = false; fixture.qualification = false;
  await candidate(options, fixture.run, () => {});
  assert.equal(fixture.calls.filter(c => c[1] === 'build').length, 1);
  const other = await temporary(t);
  await writeFile(path.join(other, 'phases.json'), JSON.stringify({ version: 1, sha, ci_run_id: '123',
    phase: 'building', image_id: null, archive_sha256: null, archive_bytes: null, manifest_sha256: null }));
  const second = processFixture(other);
  await assert.rejects(candidate({ ...options, directory: other }, second.run, () => {}), /ENOENT/);
  assert.equal(second.calls.filter(c => c[1] === 'build').length, 0);
});

test('candidate path and archive symlinks fail closed', async t => {
  // Red trigger: export/cleanup follows an alias into a foreign directory.
  const directory = await temporary(t);
  const alias = directory + '-alias';
  await symlink(directory, alias); t.after(() => rm(alias, { force: true }));
  const fixture = processFixture(directory);
  await assert.rejects(candidate({ directory: alias, sha, runId: '123', controllerDir: '/none' },
    fixture.run, () => {}), /candidate-symlink/);
  await writeFile(path.join(directory, 'foreign.txt'), 'another task');
  await assert.rejects(candidate({ directory, sha, runId: '123', controllerDir: '/none' },
    fixture.run, () => {}), /candidate-directory-not-owned/);
  const file = path.join(directory, 'real.tar'); await writeFile(file, 'bytes');
  await symlink(file, path.join(directory, 'candidate.tar'));
  await assert.rejects(checksum(path.join(directory, 'candidate.tar')), /regular-file-size/);
});

// A separate stdlib fixture writer, rather than mocking the archive verifier.
// Image IDs/config IDs and SQL hashes are calculated from actual tar bytes.
const createOci = String.raw`
import hashlib, io, json, pathlib, sys, tarfile
directory, mode, sha = sys.argv[1:]
H=lambda b:'sha256:'+hashlib.sha256(b).hexdigest()
J=lambda o:json.dumps(o,sort_keys=True,separators=(',',':')).encode()
sql=b'CREATE TABLE synthetic_probe(id integer);\n'
layer=io.BytesIO()
with tarfile.open(fileobj=layer,mode='w') as t:
    name='app/prisma/migrations/20260101000000_initial/migration.sql'
    if mode=='path': name='../outside.sql'
    i=tarfile.TarInfo(name); i.size=len(sql); t.addfile(i,io.BytesIO(sql))
    if mode=='link':
        i=tarfile.TarInfo('app/prisma/migrations/20260102000000_link'); i.type=tarfile.SYMTYPE; i.linkname='/outside'; t.addfile(i)
raw=layer.getvalue()
config=J({'os':'linux','architecture':'amd64','config':{'Labels':{'org.opencontainers.image.revision':sha,'social-monitor.ci-run-id':'123'}},'rootfs':{'type':'layers','diff_ids':[H(raw)]}})
desc=lambda b,media:{'digest':H(b),'size':len(b),'mediaType':'application/vnd.oci.image.'+media}
cd=desc(config,'config.v1+json'); ld=desc(raw,'layer.v1.tar')
manifest=J({'schemaVersion':2,'mediaType':'application/vnd.oci.image.manifest.v1+json','config':cd,'layers':[ld]})
md=desc(manifest,'manifest.v1+json')
if mode=='index': md['mediaType']='application/vnd.oci.image.index.v1+json'
if mode=='attestation': md['annotations']={'vnd.docker.reference.type':'attestation-manifest'}
files={'oci-layout':J({'imageLayoutVersion':'1.0.0'}),'index.json':J({'schemaVersion':2,'manifests':[md]}),'manifest.json':J([{'Config':'blobs/sha256/'+H(config)[7:],'RepoTags':[] if mode!='tag' else ['foreign:latest'],'Layers':['blobs/sha256/'+H(raw)[7:]]}]),'blobs/sha256/'+H(config)[7:]:config,'blobs/sha256/'+H(raw)[7:]:raw,'blobs/sha256/'+H(manifest)[7:]:manifest}
if mode=='corrupt': files['blobs/sha256/'+H(raw)[7:]]=raw[:-1]+b'x'
with tarfile.open(pathlib.Path(directory)/'candidate.tar','w') as t:
    for name,data in files.items():
        i=tarfile.TarInfo(name); i.size=len(data); t.addfile(i,io.BytesIO(data))
print(json.dumps({'image_id':H(manifest),'sql_checksum':H(sql)[7:]}))
`;
const controllerDir = path.resolve(process.env.RELEASE_CANDIDATE_CONTROLLER_DIR
  || (existsSync('node_modules/.cicd-evidence/controller/archive.py')
    ? 'node_modules/.cicd-evidence/controller' : 'ops/release/hetzner'));

test('actual independent controller verifies OCI graph and SQL bytes, refuses unsafe artifacts', async t => {
  // Red trigger: producer accepts a Docker index/attestation/tag, traversal,
  // migration symlink or corrupt blob without rebuilding the test oracle.
  for (const mode of ['valid', 'index', 'attestation', 'tag', 'path', 'link', 'corrupt']) {
    const directory = await temporary(t);
    const written = JSON.parse(await command('python3', ['-I', '-B', '-c', createOci, directory, mode, sha]));
    const actual = await checksum(path.join(directory, 'candidate.tar'));
    const binding = { image_id: written.image_id, archive_sha256: actual.sha256, archive_bytes: actual.bytes };
    const options = { directory, sha, runId: '123', controllerDir };
    if (mode === 'valid') {
      const proof = await qualify(options, binding);
      assert.equal(proof.migrations[0].checksum,
        createHash('sha256').update('CREATE TABLE synthetic_probe(id integer);\n').digest('hex'));
      assert.equal(proof.migrations[0].checksum, written.sql_checksum);
      assert.notEqual(proof.image_graph.config_digest, proof.image_id);
      // Actual controller database policy rejects unknown history/checksums.
      const code = "import sys,json; sys.path.insert(0,sys.argv[1]); import evidence; evidence.database(json.loads(sys.argv[2]),json.loads(sys.argv[3]))";
      const applied = proof.migrations.map(m => ({ ...m, finished_at: 'synthetic-finished', rolled_back_at: null }));
      const database = rows => ({ server_major: 18, read_only_role: true, transaction_read_only: true,
        failed_migrations: [], applied_migrations: rows });
      const policy = rows => command('python3', ['-I', '-B', '-c', code, controllerDir,
        JSON.stringify(database(rows)), JSON.stringify(proof.migrations)]);
      await policy(applied);
      await assert.rejects(policy([{ ...applied[0], checksum: '0'.repeat(64) }]), /command-failed/);
      await assert.rejects(policy([...applied, { name: '20260102000000_unknown', checksum: '0'.repeat(64),
        finished_at: 'synthetic-finished', rolled_back_at: null }]), /command-failed/);
      await assert.rejects(qualify({ ...options, sha: 'f'.repeat(40) }, binding), /command-failed/);
      await assert.rejects(qualify(options, { ...binding, image_id: digest('f') }), /command-failed/);
      const bytes = await readFile(path.join(directory, 'candidate.tar'));
      bytes[1024] ^= 1; await writeFile(path.join(directory, 'candidate.tar'), bytes);
      await assert.rejects(qualify(options, binding), /export-identity-mismatch/);
    } else await assert.rejects(qualify(options, binding), /command-failed/);
  }
});

test('source preparation retry does not consume the single build attempt', async t => {
  // Red trigger: a failed Git snapshot prevents safe preparation-only retry,
  // or starts Docker before the committed context is complete.
  const directory = await temporary(t);
  const fixture = processFixture(directory);
  const options = { directory, sha, runId: '123', controllerDir: '/synthetic/controller' };
  fixture.failArchive = true;
  await assert.rejects(candidate(options, fixture.run, () => {}), /snapshot-failed/);
  assert.equal((await readJson(path.join(directory, 'phases.json'))).phase, 'preparing');
  assert.equal(fixture.calls.filter(c => c[1] === 'build').length, 0);
  fixture.failArchive = false;
  fixture.qualification = false;
  await candidate(options, fixture.run, () => {});
  assert.equal(fixture.calls.filter(c => c[1] === 'build').length, 1);
});

test('actual CI checkout/run mismatch fails before building', async t => {
  // Red trigger: PR-head metadata substitutes for the observed CI merge HEAD.
  const directory = await temporary(t);
  const fixture = processFixture(directory);
  const options = { directory, sha, runId: '123', controllerDir: '/synthetic/controller' };
  try {
    process.env.GITHUB_SHA = 'f'.repeat(40);
    await assert.rejects(candidate(options, fixture.run, () => {}), /ci-checkout-mismatch/);
    process.env.GITHUB_SHA = sha;
    process.env.GITHUB_RUN_ID = '124';
    await assert.rejects(candidate(options, fixture.run, () => {}), /ci-run-mismatch/);
    assert.equal(fixture.calls.filter(c => c[1] === 'build').length, 0);
  } finally { delete process.env.GITHUB_SHA; delete process.env.GITHUB_RUN_ID; }
});

test('real argv process receives exact binary source context and bounds stdout', async t => {
  // Red trigger: stdin context is truncated/serialized, or nonzero policy
  // stdout is lost and a generic transport failure is accepted as a denial.
  const directory = await temporary(t);
  const input = path.join(directory, 'source.tar');
  const bytes = Buffer.alloc(262_144);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  await writeFile(input, bytes);
  const code = 'import sys,json,hashlib; b=sys.stdin.buffer.read(); print(json.dumps({"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()}))';
  const proof = JSON.parse(await command('python3', ['-I', '-B', '-c', code], { input }));
  assert.equal(proof.bytes, bytes.length);
  assert.equal(proof.sha256, createHash('sha256').update(bytes).digest('hex'));
  await assert.rejects(command('python3', ['-I', '-B', '-c',
    'import sys; print(\'{"denied":"archive-digest"}\'); sys.exit(1)']), error => {
    assert.equal(error.exitCode, 1);
    assert.deepEqual(JSON.parse(error.stdout), { denied: 'archive-digest' });
    return true;
  });
  await assert.rejects(command('python3', ['-I', '-B', '-c', 'print("x"*65)'], { limit: 64 }), /command-output-limit/);
});


test('journal rename EIO reconciles verified retained export without another build/save', async t => {
  // Red trigger: successful save + archive rename + failed exported journal
  // rename leaves phase built; retry used to overwrite it with a second save.
  const support = await temporary(t);
  const directory = await temporary(t);
  const written = JSON.parse(await command('python3', ['-I', '-B', '-c', createOci, support, 'valid', sha]));
  const archive = path.join(support, 'candidate.tar');
  const sum = await checksum(archive);
  const proof = await qualify({ directory: support, sha, runId: '123', controllerDir },
    { image_id: written.image_id, archive_sha256: sum.sha256, archive_bytes: sum.bytes });
  const log = path.join(support, 'calls.jsonl');
  const preload = path.join(support, 'journal-fault.mjs');
  await writeFile(preload, `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const rename = fs.rename;
let failed = false;
fs.rename = async (from, to) => {
  if (!failed && to.endsWith('/phases.json')
      && JSON.parse(await fs.readFile(from, 'utf8')).phase === 'exported') {
    failed = true;
    throw Object.assign(new Error('journal-rename-EIO'), { code: 'EIO' });
  }
  return rename(from, to);
};
syncBuiltinESMExports();
`);
  const runner = path.join(support, 'producer-fixture.mjs');
  await writeFile(runner, `
import { appendFile, copyFile, writeFile } from 'node:fs/promises';
import { candidate, command } from ${JSON.stringify(path.resolve('scripts/ci/release-candidate.mjs'))};
const proof = ${JSON.stringify(proof)};
const run = async (program, args, options = {}) => {
  await appendFile(${JSON.stringify(log)}, JSON.stringify([program, ...args]) + '\\n');
  if (program === 'python3') return command(program, args, options);
  if (program === 'git') {
    if (args[0] === 'archive') { await writeFile(options.output, 'synthetic committed snapshot'); return ''; }
    return args[0] === 'rev-parse' ? proof.sha : '';
  }
  if (program !== 'docker') throw new Error('unexpected-program');
  if (args[0] === 'version') return JSON.stringify({ Version: '29.8.1' });
  if (args[0] === 'info') return JSON.stringify({ OSType: 'linux', Architecture: 'amd64',
    DriverStatus: [['driver-type', 'io.containerd.snapshotter.v1']] });
  if (args[0] === 'build') { await writeFile(args[args.indexOf('--iidfile') + 1], proof.image_id); return ''; }
  if (args[1] === 'save') { await copyFile(${JSON.stringify(archive)}, options.output); return ''; }
  if (args[1] === 'inspect') return JSON.stringify([{ Id: proof.image_id, Os: 'linux', Architecture: 'amd64',
    Config: { Labels: { 'org.opencontainers.image.revision': proof.sha, 'social-monitor.ci-run-id': '123' } },
    Descriptor: proof.image_graph.descriptor, RootFS: { Type: 'layers',
      Layers: process.argv[3] === 'graph' ? ['sha256:' + '0'.repeat(64)] : proof.image_graph.diff_ids } }]);
  throw new Error('unexpected-command');
};
try {
  const result = await candidate({ directory: process.argv[2], sha: proof.sha, runId: '123',
    controllerDir: ${JSON.stringify(controllerDir)} }, run, () => {});
  process.stdout.write(JSON.stringify({ manifest: result }));
} catch (error) { process.stdout.write(JSON.stringify({ error: error.code || error.message })); }
`);
  const execute = async (target, fault = false, mode = '') => JSON.parse(await command(process.execPath,
    [...(fault ? ['--import', preload] : []), runner, target, mode]));
  assert.deepEqual(await execute(directory, true), { error: 'EIO' });
  const built = await readJson(path.join(directory, 'phases.json'));
  assert.equal(built.phase, 'built');
  const retained = await readFile(path.join(directory, 'candidate.tar'));
  assert.deepEqual(retained, await readFile(archive));
  const retried = await execute(directory);
  assert.deepEqual(retried.manifest, proof);
  const resumedCalls = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(resumedCalls.filter(c => c[0] === 'docker' && c[1] === 'build').length, 1);
  assert.equal(resumedCalls.filter(c => c[0] === 'docker' && c[2] === 'save').length, 1);
  assert.deepEqual(await checksum(path.join(directory, 'candidate.tar')), sum);
  assert.equal((await readJson(path.join(directory, 'phases.json'))).phase, 'qualified');
  await execute(directory); // qualified retry still skips the completed proof
  for (const mode of ['corrupt', 'partial', 'graph']) {
    const other = await temporary(t);
    await writeFile(path.join(other, 'phases.json'), JSON.stringify(built));
    const file = path.join(other, mode === 'partial' ? 'candidate.tar.pending' : 'candidate.tar');
    if (mode === 'graph') await copyFile(archive, file);
    else await writeFile(file, mode === 'partial' ? retained.subarray(0, 100) : 'bad retained archive');
    const before = await readFile(file);
    const refusal = await execute(other, false, mode);
    assert.match(refusal.error, /command-failed|ambiguous-export|daemon-archive-graph-mismatch/);
    assert.equal((await readJson(path.join(other, 'phases.json'))).phase, 'built');
    assert.deepEqual(await readFile(file), before);
  }
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(calls.filter(c => c[0] === 'docker' && c[1] === 'build').length, 1);
  assert.equal(calls.filter(c => c[0] === 'docker' && c[2] === 'save').length, 1);
  // Retained-export reconciliation and corrupt/graph cases use the real
  // verifier; qualified upload-only retry adds no proof.
  assert.equal(calls.filter(c => c[0] === 'python3').length, 3);

  await t.test('lock close EIO still removes lock and qualified resume never rebuilds or saves', async () => {
    const target = await temporary(t);
    const closePreload = path.join(support, 'close-fault.mjs');
    await writeFile(closePreload, `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const open = fs.open;
fs.open = async (...args) => {
  const handle = await open(...args);
  if (args[0].endsWith('/producer.lock')) {
    const close = handle.close.bind(handle);
    handle.close = async () => {
      await close();
      throw Object.assign(new Error('lock-close-EIO'), { code: 'EIO' });
    };
  }
  return handle;
};
syncBuiltinESMExports();
`);
    const before = await readFile(log, 'utf8');
    const failed = JSON.parse(await command(process.execPath, ['--import', closePreload, runner, target]));
    assert.deepEqual(failed, { error: 'EIO' });
    assert.equal((await readJson(path.join(target, 'phases.json'))).phase, 'qualified');
    await assert.rejects(readFile(path.join(target, 'producer.lock')), { code: 'ENOENT' });
    assert.deepEqual(await checksum(path.join(target, 'candidate.tar')), sum);
    assert.deepEqual((await execute(target)).manifest, proof);
    const delta = (await readFile(log, 'utf8')).slice(before.length).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(delta.filter(c => c[0] === 'docker' && c[1] === 'build').length, 1);
    assert.equal(delta.filter(c => c[0] === 'docker' && c[2] === 'save').length, 1);
    assert.equal(delta.filter(c => c[0] === 'python3').length, 1);
  });

  await t.test('SIGKILL retains ambiguous lock and refuses resume even with a valid final archive', async () => {
    const target = await temporary(t);
    const deathPreload = path.join(support, 'death-fault.mjs');
    await writeFile(deathPreload, `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const rename = fs.rename;
fs.rename = async (from, to) => {
  if (to.endsWith('/phases.json')
      && JSON.parse(await fs.readFile(from, 'utf8')).phase === 'exported') {
    process.kill(process.pid, 'SIGKILL');
    await new Promise(() => {});
  }
  return rename(from, to);
};
syncBuiltinESMExports();
`);
    const before = await readFile(log, 'utf8');
    await assert.rejects(command(process.execPath, ['--import', deathPreload, runner, target]), error => {
      assert.equal(error.exitCode, null);
      return /command-failed/.test(error.message);
    });
    const lockBytes = await readFile(path.join(target, 'producer.lock'));
    assert.equal((await readJson(path.join(target, 'phases.json'))).phase, 'built');
    assert.deepEqual(await checksum(path.join(target, 'candidate.tar')), sum);
    assert.deepEqual(await qualify({ directory: target, sha, runId: '123', controllerDir },
      { image_id: proof.image_id, archive_sha256: sum.sha256, archive_bytes: sum.bytes }), proof);
    const stoppedCalls = await readFile(log, 'utf8');
    assert.deepEqual(await execute(target), { error: 'EEXIST' });
    assert.equal(await readFile(log, 'utf8'), stoppedCalls);
    assert.deepEqual(await readFile(path.join(target, 'producer.lock')), lockBytes);
    const delta = stoppedCalls.slice(before.length).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(delta.filter(c => c[0] === 'docker' && c[1] === 'build').length, 1);
    assert.equal(delta.filter(c => c[0] === 'docker' && c[2] === 'save').length, 1);
    assert.deepEqual(await checksum(path.join(target, 'candidate.tar')), sum);
  });
});
