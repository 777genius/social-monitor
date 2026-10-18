import { createHash, createPublicKey, verify } from 'node:crypto';
import { chmod, lstat, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  backendEnvironment,
  materializeLocalConfiguration,
  readPublicDefaults,
  rawEnvironment,
  type AiConnection,
} from './local-config';

const connection: AiConnection = { mode: 'codex', model: 'gpt-5.6-sol', address: '', serviceToken: '', scoringApiKey: 'fixture-only-scoring-key' };
const now = new Date('2026-10-18T12:00:00Z');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

describe('local self-host configuration', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'social-monitor-config-TEST-'));
    await chmod(directory, 0o700);
  });

  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it('preserves storage credentials and runtime keys across a second start', async () => {
    const defaults = await readPublicDefaults();
    const first = await materializeLocalConfiguration({ directory, defaults, connection, now });
    const firstEnvironmentHash = digest(await readFile(join(directory, 'backend.env'), 'utf8'));
    const second = await materializeLocalConfiguration({
      directory, defaults, now: new Date('2026-10-18T12:05:00Z'),
    });
    expect(digest(second.databasePassword)).toBe(digest(first.databasePassword));
    expect(digest(second.applicationPassword)).toBe(digest(first.applicationPassword));
    expect(digest(second.systemPassword)).toBe(digest(first.systemPassword));
    expect(digest(second.migratorPassword)).toBe(digest(first.migratorPassword));
    expect(digest(second.encryptionKey)).toBe(digest(first.encryptionKey));
    expect(digest(second.runtimeEncryptionKey)).toBe(digest(first.runtimeEncryptionKey));
    expect(digest(await readFile(join(directory, 'backend.env'), 'utf8'))).toBe(firstEnvironmentHash);
    for (const name of ['settings.json', 'backend.env', 'system.env', 'migration.env', 'scoring.env', 'owner.env', 'compose.env']) {
      expect((await lstat(join(directory, name))).mode & 0o077).toBe(0);
    }
  });

  it('uses a verifiable workspace-scoped owner session without trusting role headers', async () => {
    const defaults = await readPublicDefaults();
    const settings = await materializeLocalConfiguration({ directory, defaults, connection, now });
    const [header, payload, signature] = settings.ownerToken.split('.');
    const jwks = JSON.parse(settings.publicJwks) as { keys: Record<string, string>[] };
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
    expect(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`),
      createPublicKey({ key: jwks.keys[0] ?? {}, format: 'jwk' }),
      Buffer.from(signature ?? '', 'base64url'))).toBe(true);
    expect(claims.tenant_id).toBe(defaults.SOCIAL_MONITOR_TENANT_ID);
    expect(claims.workspace_id).toBe(defaults.SOCIAL_MONITOR_WORKSPACE_ID);
    expect(claims.sub).toBe(defaults.SOCIAL_MONITOR_USER_ID);
    expect(backendEnvironment(settings).TRUSTED_WORKSPACE_ROLE_HEADER).toBe('disabled');
    expect(backendEnvironment(settings).SOCIAL_MONITOR_USER_AUTH_MODE).toBe('oidc-jwt');
    expect(new URL(backendEnvironment(settings).DATABASE_URL ?? '').username).toBe('social_monitor_app');
  });

  it('rejects config injection and cannot overwrite a symlink target', async () => {
    expect(() => rawEnvironment({ TOKEN: 'fixture\nDATABASE_URL=injected' })).toThrow('environment_value_invalid');
    const defaults = await readPublicDefaults();
    await symlink(join(directory, 'do-not-create'), join(directory, 'settings.json'));
    await expect(materializeLocalConfiguration({ directory, defaults, connection, now })).rejects.toThrow();
    await expect(lstat(join(directory, 'do-not-create'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a publicly readable state directory before creating secrets', async () => {
    await chmod(directory, 0o755);
    await expect(materializeLocalConfiguration({
      directory, defaults: await readPublicDefaults(), connection, now,
    })).rejects.toThrow('state_directory_must_be_private_and_owned');
    await expect(lstat(join(directory, 'settings.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('changing the AI connection preserves the existing data-encryption key', async () => {
    const defaults = await readPublicDefaults();
    const first = await materializeLocalConfiguration({ directory, defaults, connection, now });
    const next = await materializeLocalConfiguration({
      directory, defaults, now,
      connection: { mode: 'external', model: 'test-model', address: 'runtime.example.test:50052', serviceToken: 'fixture-only-token', scoringApiKey: 'fixture-only-scoring-key' },
    });
    expect(digest(next.encryptionKey)).toBe(digest(first.encryptionKey));
    expect(backendEnvironment(next).AGENT_RUNTIME_GRPC_ADDRESS).toBe('runtime.example.test:50052');
  });

  it('allows collection before AI is connected and isolates the scoring credential', async () => {
    const defaults = await readPublicDefaults();
    await materializeLocalConfiguration({ directory, defaults, now,
      connection: { ...connection, scoringApiKey: '' } });
    expect(await readFile(join(directory, 'compose.env'), 'utf8')).toContain('SELFHOST_AI_ENABLED=false\n');
    await materializeLocalConfiguration({ directory, defaults, now, connection });
    expect(await readFile(join(directory, 'compose.env'), 'utf8')).toContain('SELFHOST_AI_ENABLED=true\n');
    expect(await readFile(join(directory, 'scoring.env'), 'utf8')).toBe('OPENROUTER_API_KEY=fixture-only-scoring-key\n');
    expect(await readFile(join(directory, 'backend.env'), 'utf8')).not.toContain('OPENROUTER_API_KEY');
  });
});
