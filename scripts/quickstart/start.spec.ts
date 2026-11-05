import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const launcher = resolve(__dirname, '../../start.sh');

describe('self-host scoring activation command', () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'social-monitor-launcher-TEST-')); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it.each([
    ['openrouter-systemone', '--openrouter-key-file'],
    ['openai-decisions', '--openai-key-file'],
  ] as const)('passes explicit %s selection and its key through the existing setup input', async (provider, keyOption) => {
    const bin = join(directory, 'bin');
    await mkdir(bin);
    const docker = join(bin, 'docker');
    // No container or runtime is started: only the launcher/setup wire format runs.
    await writeFile(docker, `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == 'compose version --short' ]]; then printf '2.30.0\n'; fi
if [[ "$*" == *'dist/scripts/quickstart/setup.js'* ]]; then
  cat > "$SELFHOST_STATE_DIR/setup-input"
  printf '{}\n' > "$SELFHOST_STATE_DIR/settings.json"
  printf 'SELFHOST_AI_MODE=external\nSELFHOST_AI_ENABLED=true\n' > "$SELFHOST_STATE_DIR/compose.env"
fi
`);
    await chmod(docker, 0o700);
    const keyFile = join(directory, 'fixture-key');
    const tokenFile = join(directory, 'fixture-token');
    await writeFile(keyFile, 'fixture-private-scoring-key\n');
    await writeFile(tokenFile, 'fixture-runtime-token\n');
    const state = join(directory, 'state');
    const args = [launcher, '--no-open', '--local-images', '--state-dir', state,
      '--ai', 'external', '--runtime-address', 'runtime.example.test:50052',
      '--runtime-token-file', tokenFile, keyOption, keyFile];
    if (provider === 'openai-decisions') args.push('--scoring-provider', provider);
    const result = spawnSync('bash', args, { encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` } });
    expect(result.status).toBe(0);
    const input = (await readFile(join(state, 'setup-input'), 'utf8')).split('\n');
    expect(input).toEqual(['external', '', 'runtime.example.test:50052',
      'fixture-runtime-token', 'fixture-private-scoring-key',
      ...(provider === 'openai-decisions' ? [provider] : []), '']);
    expect(result.stdout + result.stderr).not.toContain('fixture-private-scoring-key');
  });

  it('rejects unsupported providers, mismatched keys and ambiguous key files before Docker', async () => {
    const keyFile = join(directory, 'fixture-key');
    await writeFile(keyFile, 'fixture-key\n');
    for (const args of [
      ['--scoring-provider', 'unknown'],
      ['--ai', 'codex', '--openai-key-file', keyFile],
      ['--ai', 'codex', '--openrouter-key-file', keyFile, '--openai-key-file', keyFile],
      ['--scoring-provider', 'openai-decisions'],
    ]) {
      const result = spawnSync('bash', [launcher, ...args], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Scoring provider|Scoring key|only one|Scoring options/u);
      expect(result.stderr).not.toContain('fixture-key');
    }
  });
});
