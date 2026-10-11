import { chmod, link, lstat, mkdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { admitSocialSep24PrivateInputs, materializeSocialSep24PrivateInputs, type PrivateInputCommit } from './social-source-private-input-materializer';
import { PrivateDirectory, type FileFault } from './social-source-private-input-files';
import { freshOutput, syntheticSnapshots } from './social-source-private-input-fixtures.spec-support';
import { parsePrivateInputCli, runPrivateInputCli } from '../materialize-social-sep24-private-inputs';

const materialize = async (fault?: FileFault) => {
  const paths = await freshOutput();
  const rows = syntheticSnapshots();
  const result = await materializeSocialSep24PrivateInputs({ ...paths, readSnapshots: async () => rows, fault });
  return { paths, rows, ...result };
};
describe('exclusive anchored immutable publication and admission', () => {
  it('issues only an opaque safe receipt and reopens exact immutable private bytes', async () => {
    const input = await materialize();
    const admitted = await admitSocialSep24PrivateInputs(input.commit, async () => input.rows);
    expect(input.receipt).toEqual({ identity: expect.stringMatching(/^[a-f0-9-]{36}$/u), materialized: true, collected: false, imported: false,
      providers: [{ provider: 'reddit', passCount: 44, feedCount: 0, expandedFeedCount: 0 },
        { provider: 'rss', passCount: 0, feedCount: 25, expandedFeedCount: 36 }] });
    const publicText = JSON.stringify(input.receipt);
    for (const forbidden of ['synthetic', 'https:', 'query', 'sha256', input.rows[0]!.scope.sourceBindingId]) expect(publicText).not.toContain(forbidden);
    expect((await lstat(input.paths.outputRoot)).mode & 0o7777).toBe(0o700);
    for (const name of ['snapshot.json', 'reddit-request.json', 'rss-request.json', 'manifest.json']) {
      const state = await lstat(join(input.paths.outputRoot, name));
      expect(state.mode & 0o7777).toBe(0o400); expect(state.nlink).toBe(1); expect(state.uid).toBe(process.getuid?.());
    }
    expect(admitted.redditRequestBytes).toEqual(await readFile(join(input.paths.outputRoot, 'reddit-request.json')));
    expect(admitted.rssRequestBytes).toEqual(await readFile(join(input.paths.outputRoot, 'rss-request.json')));
    const snapshot = JSON.parse((await readFile(join(input.paths.outputRoot, 'snapshot.json'))).toString()) as { snapshots: unknown };
    expect(snapshot.snapshots).toEqual(input.rows);
    const manifest = JSON.parse((await readFile(join(input.paths.outputRoot, 'manifest.json'))).toString()) as { files: Record<string, { sha256: string }> };
    const { createHash } = await import('node:crypto');
    expect(manifest.files['rss-request.json']?.sha256).toBe(createHash('sha256').update(admitted.rssRequestBytes).digest('hex'));
    // Caller buffer changes cannot change persisted bytes or the next admission.
    admitted.redditRequestBytes.fill(0);
    expect((await admitSocialSep24PrivateInputs(input.commit, async () => input.rows)).redditRequestBytes[0]).toBe(91);
    await expect(materializeSocialSep24PrivateInputs({ ...input.paths, readSnapshots: async () => input.rows })).rejects.toThrow('filesystem');
  });
  it('refuses a receipt, forged capability, or copied commit after process-local publication authority is lost', async () => {
    const input = await materialize();
    for (const fake of [input.receipt, { ...input.commit }, { kind: 'trusted-private-input-commit' }]) {
      await expect(admitSocialSep24PrivateInputs(fake as PrivateInputCommit, async () => input.rows)).rejects.toThrow('filesystem');
    }
  });
  it.each(['config', 'query', 'interval', 'freshness', 'retry', 'nextRunAt', 'capability', 'capabilityVersion', 'scope', 'provider', 'missing', 'arrayOrder'])(
    'refuses %s drift before admission and again after a synthetic capture', async (kind) => {
      const input = await materialize();
      await admitSocialSep24PrivateInputs(input.commit, async () => input.rows);
      const current = structuredClone(input.rows);
      const row = current[0]!;
      switch (kind) {
        case 'config': row.config.minScore = 1; break;
        case 'query': current[0] = { ...row, interestQuery: `${row.interestQuery}x` }; break;
        case 'interval': current[0] = { ...row, policy: { ...row.policy, intervalSeconds: 182 } }; break;
        case 'freshness': current[0] = { ...row, policy: { ...row.policy, freshnessSeconds: 360 } }; break;
        case 'retry': current[0] = { ...row, policy: { ...row.policy, retryBudget: 3 } }; break;
        case 'nextRunAt': current[0] = { ...row, policy: { ...row.policy, nextRunAt: '2026-09-25 03:04:05.123457+00' } }; break;
        case 'capability': row.capability.config.supportsCursor = false; break;
        case 'capabilityVersion': current[0] = { ...row, capability: { ...row.capability, version: 4 } }; break;
        case 'scope': current[0] = { ...row, scope: { ...row.scope, workspaceId: '00000000-0000-7000-8000-000000007999' } }; break;
        case 'provider': current[0] = { ...row, provider: 'rss' }; break;
        case 'missing': current.pop(); break;
        case 'arrayOrder': (row.config.scanPasses as unknown[]).reverse(); break;
      }
      await expect(admitSocialSep24PrivateInputs(input.commit, async () => current)).rejects.toThrow(/^private_input_refused:drift$/u);
      expect((await lstat(join(input.paths.outputRoot, 'manifest.json'))).size).toBeGreaterThan(0);
    });
  it.each(['symlink', 'hardlink', 'bytes', 'mode', 'inode', 'directory'])('refuses %s tampering through verified descriptors', async (kind) => {
    const input = await materialize();
    const path = join(input.paths.outputRoot, 'reddit-request.json');
    if (kind === 'symlink' || kind === 'inode') {
      await rename(path, `${path}.retained`);
      if (kind === 'symlink') await symlink(`${path}.retained`, path);
      else await writeFile(path, await readFile(`${path}.retained`), { mode: 0o400, flag: 'wx' });
    } else if (kind === 'hardlink') await link(path, `${path}.linked`);
    else if (kind === 'mode') await chmod(path, 0o600);
    else if (kind === 'bytes') { await chmod(path, 0o600); await writeFile(path, '[ ]\n'); await chmod(path, 0o400); }
    else { await rename(input.paths.outputRoot, `${input.paths.outputRoot}-retained`); await mkdir(input.paths.outputRoot, { mode: 0o700 }); }
    await expect(admitSocialSep24PrivateInputs(input.commit, async () => input.rows)).rejects.toThrow('drift');
  });
  it('refuses worktree output, reusable/unsafe directories and symlink ancestry', async () => {
    const paths = await freshOutput();
    const rows = syntheticSnapshots();
    const reader = jest.fn(async () => rows);
    await expect(materializeSocialSep24PrivateInputs({ ...paths, outputRoot: join(paths.worktree, 'forbidden'), readSnapshots: reader })).rejects.toThrow('filesystem');
    expect(reader).not.toHaveBeenCalled();
    await mkdir(paths.outputRoot, { mode: 0o700 });
    await expect(materializeSocialSep24PrivateInputs({ ...paths, readSnapshots: async () => rows })).rejects.toThrow('filesystem');
    await chmod(dirname(paths.outputRoot), 0o777);
    await expect(PrivateDirectory.acquire(join(dirname(paths.outputRoot), 'unsafe'), paths.worktree, true)).rejects.toThrow('filesystem');
    const other = await freshOutput();
    await symlink(dirname(other.outputRoot), join(dirname(other.outputRoot), 'alias'));
    await expect(PrivateDirectory.acquire(join(dirname(other.outputRoot), 'alias', 'inputs'), other.worktree, true)).rejects.toThrow('filesystem');
  });
  it('uses exclusive nofollow writes even for a precreated private filename', async () => {
    const paths = await freshOutput();
    const directory = await PrivateDirectory.acquire(paths.outputRoot, paths.worktree, true);
    try {
      const path = join(paths.outputRoot, 'synthetic.json');
      await writeFile(path, 'retained', { mode: 0o400, flag: 'wx' });
      await expect(directory.write('synthetic.json', Buffer.from('replacement'))).rejects.toThrow('filesystem');
      expect(await readFile(path, 'utf8')).toBe('retained');
      await symlink(path, join(paths.outputRoot, 'alias.json'));
      await expect(directory.write('alias.json', Buffer.from('replacement'))).rejects.toThrow('filesystem');
    } finally { await directory.close(); }
  });
  it.each(['write', 'sync', 'close'] as const)('retains partial data and no manifest on %s failure without raw error logs', async (phase) => {
    const paths = await freshOutput();
    const fault: FileFault = async (event, name, handle) => {
      if (event === phase && name === 'reddit-request.json') {
        if (phase === 'write') await handle.writeFile('[synthetic partial');
        throw new Error('synthetic raw error with https://example.test/private-query');
      }
    };
    const logs = [jest.spyOn(console, 'log'), jest.spyOn(console, 'error')];
    try {
      await expect(materializeSocialSep24PrivateInputs({ ...paths, readSnapshots: async () => syntheticSnapshots(), fault })).rejects.toThrow(/^private_input_refused:filesystem$/u);
      expect((await lstat(join(paths.outputRoot, 'reddit-request.json'))).size).toBeGreaterThan(0);
      await expect(lstat(join(paths.outputRoot, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    } finally { logs.forEach((log) => log.mockRestore()); }
  });
  it.each(['manifest-write', 'manifest-sync', 'manifest-close', 'directory-sync', 'parent-sync', 'directory-close'])(
    'never issues authority and invalidates the retained marker on %s failure', async (kind) => {
      const paths = await freshOutput();
      let afterManifest = false;
      const fault: FileFault = async (phase, name, handle) => {
        if (name === 'manifest.json' && phase === 'opened') afterManifest = true;
        const fail = (kind === 'manifest-write' && name === 'manifest.json' && phase === 'write') ||
          (kind === 'manifest-sync' && name === 'manifest.json' && phase === 'sync') ||
          (kind === 'manifest-close' && name === 'manifest.json' && phase === 'close') ||
          (kind === 'directory-sync' && afterManifest && name === 'directory' && phase === 'directory-sync') ||
          (kind === 'parent-sync' && afterManifest && name === 'parent' && phase === 'directory-sync') ||
          (kind === 'directory-close' && afterManifest && name === 'directory' && phase === 'close');
        if (fail) { if (kind === 'manifest-write') await handle.writeFile('{"synthetic":'); throw new Error('synthetic failure'); }
      };
      await expect(materializeSocialSep24PrivateInputs({ ...paths, readSnapshots: async () => syntheticSnapshots(), fault })).rejects.toThrow('filesystem');
      expect((await lstat(join(paths.outputRoot, 'snapshot.json'))).size).toBeGreaterThan(0);
      expect(await readFile(join(paths.outputRoot, 'manifest.json'), 'utf8')).toBe('');
    });
  it('detects a parent directory rebound during writing while retaining bytes in the descriptor-anchored original', async () => {
    const paths = await freshOutput();
    const parent = dirname(paths.outputRoot);
    let rebound = false;
    const fault: FileFault = async (phase, name) => {
      if (phase === 'sync' && name === 'reddit-request.json' && !rebound) {
        rebound = true; await rename(parent, `${parent}-retained`); await mkdir(parent, { mode: 0o700 });
      }
    };
    await expect(materializeSocialSep24PrivateInputs({ ...paths, readSnapshots: async () => syntheticSnapshots(), fault })).rejects.toThrow('filesystem');
    expect((await lstat(join(`${parent}-retained`, 'inputs', 'reddit-request.json'))).size).toBeGreaterThan(0);
    await expect(lstat(join(`${parent}-retained`, 'inputs', 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('validates CLI before invoking the injected reader and writes only the safe receipt', async () => {
    const reader = jest.fn(async () => syntheticSnapshots()); const writeReceipt = jest.fn();
    const paths = await freshOutput();
    for (const args of [[], ['--output-root', 'relative'], ['--output-root', paths.outputRoot, '--provider', 'rss'], ['--tenant', 'synthetic']]) {
      expect(() => parsePrivateInputCli(args)).toThrow('arguments');
      await expect(runPrivateInputCli(args, { readSnapshots: reader, worktree: paths.worktree, writeReceipt })).rejects.toThrow('arguments');
    }
    expect(reader).not.toHaveBeenCalled(); expect(writeReceipt).not.toHaveBeenCalled();
    await runPrivateInputCli(['--output-root', paths.outputRoot], { readSnapshots: reader, worktree: paths.worktree, writeReceipt });
    expect(writeReceipt).toHaveBeenCalledTimes(1);
    expect(JSON.parse(writeReceipt.mock.calls[0]![0] as string)).toMatchObject({ materialized: true, collected: false, imported: false });
  });
});
