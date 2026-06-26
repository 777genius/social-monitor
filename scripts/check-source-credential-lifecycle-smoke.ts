import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Buffer } from 'node:buffer';

import {
  type Clock,
  FixedClock,
  type IdGenerator,
  tenantId,
  type Result,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { MonitoringSourceConfigReaderAdapter } from '../apps/ingestion-worker/src/adapters/source/monitoring-source-config-reader.adapter';
import { OAuth2SourceCredentialRefresher } from '../libs/monitoring/adapters/credentials/oauth2-source-credential-refresher';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemorySourceCredentialRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-credential.repository';
import { InMemorySourceCredentialSecretVault } from '../libs/monitoring/adapters/secrets/in-memory-source-credential.vault';
import { AesGcmSourceBindingConfigProtector } from '../libs/monitoring/adapters/security/aes-gcm-source-binding-config-protector';
import { SourceBinding } from '../libs/monitoring/domain';
import { CreateSourceCredentialUseCase } from '../libs/monitoring/features/create-source-credential/create-source-credential.use-case';
import { ListSourceCredentialsUseCase } from '../libs/monitoring/features/list-source-credentials/list-source-credentials.use-case';
import { ResolveSourceCredentialUseCase } from '../libs/monitoring/features/resolve-source-credential/resolve-source-credential.use-case';
import { RevokeSourceCredentialUseCase } from '../libs/monitoring/features/revoke-source-credential/revoke-source-credential.use-case';
import { RotateSourceCredentialUseCase } from '../libs/monitoring/features/rotate-source-credential/rotate-source-credential.use-case';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `source-credential-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

async function main(): Promise<void> {
  const tokenEndpoint = await startTokenEndpoint();

  try {
    const fixedNow = new Date('2026-06-21T12:00:00.000Z');
    const clock: Clock = new FixedClock(fixedNow);
    const tenant = tenantId('tenant-source-credential-lifecycle-smoke');
    const workspace = workspaceId('workspace-source-credential-lifecycle-smoke');
    const wrongTenant = tenantId('tenant-source-credential-lifecycle-smoke-wrong');
    const wrongWorkspace = workspaceId('workspace-source-credential-lifecycle-smoke-wrong');
    const credentials = new InMemorySourceCredentialRepository();
    const vault = new InMemorySourceCredentialSecretVault();
    const ids = new SequenceIdGenerator();
    const createCredential = new CreateSourceCredentialUseCase(credentials, vault, ids, clock);
    const rotateCredential = new RotateSourceCredentialUseCase(credentials, vault, ids, clock);
    const revokeCredential = new RevokeSourceCredentialUseCase(credentials, vault, clock);
    const listCredentials = new ListSourceCredentialsUseCase(credentials);
    const resolver = new ResolveSourceCredentialUseCase(
      credentials,
      vault,
      new OAuth2SourceCredentialRefresher({ refreshSkewMs: 60_000, timeoutMs: 10_000 }),
      clock,
    );

    const created = unwrap(await createCredential.execute({
      tenantId: tenant,
      workspaceId: workspace,
      providerKey: 'reddit',
      kind: 'oauth2',
      secret: {
        accessToken: 'expired-access-token',
        accessTokenExpiresAt: '2026-06-21T11:59:00.000Z',
        refreshToken: 'permanent-refresh-token',
        tokenUrl: tokenEndpoint.url,
        clientId: 'reddit-client-id',
        clientSecret: 'reddit-client-secret',
        tokenType: 'bearer',
      },
      secretPreview: 'reddit-client',
      scopes: ['read', 'identity'],
      expiresAt: new Date('2026-06-21T11:59:00.000Z'),
    }), 'create source credential');

    assertPublicCredentialViewIsRedacted(created.sourceCredential, 'create source credential response');

    const listed = unwrap(await listCredentials.execute({ tenantId: tenant, workspaceId: workspace, limit: 10 }),
      'list source credentials');
    assert(listed.sourceCredentials.length === 1, 'source credential list must include created credential');
    assertPublicCredentialViewIsRedacted(listed.sourceCredentials[0], 'list source credentials response');

    const wrongTenantList = unwrap(await listCredentials.execute({
      tenantId: wrongTenant,
      workspaceId: workspace,
      limit: 10,
    }), 'list source credentials with wrong tenant');
    assert(wrongTenantList.sourceCredentials.length === 0, 'wrong tenant must not list source credentials');

    const wrongWorkspaceList = unwrap(await listCredentials.execute({
      tenantId: tenant,
      workspaceId: wrongWorkspace,
      limit: 10,
    }), 'list source credentials with wrong workspace');
    assert(wrongWorkspaceList.sourceCredentials.length === 0, 'wrong workspace must not list source credentials');

    const sourceBindings = new InMemorySourceBindingRepository();
    const protector = new AesGcmSourceBindingConfigProtector(Buffer.alloc(32, 2), 'source-credential-smoke-key');
    const protectedConfig = await protector.protect({
      query: 'agentic coding',
      subreddit: 'LocalLLaMA',
      credentialRef: { sourceCredentialId: created.sourceCredential.id },
    });

    await sourceBindings.save(SourceBinding.create({
      id: 'source-binding-source-credential-lifecycle-smoke',
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-source-credential-lifecycle-smoke',
      providerKey: 'reddit',
      capabilityProfileVersion: 1,
      config: protectedConfig,
      createdAt: fixedNow,
    }));

    const configReader = new MonitoringSourceConfigReaderAdapter(sourceBindings, protector, resolver);
    const runtimeConfig = await configReader.readConfig({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: 'source-binding-source-credential-lifecycle-smoke',
    });

    assert(runtimeConfig !== null, 'source config reader must resolve credentialRef binding');
    assert(runtimeConfig.accessToken === 'refreshed-access-token', 'runtime config must contain refreshed access token');
    assert(runtimeConfig.refreshToken === 'rotated-refresh-token', 'runtime config must contain rotated refresh token');
    assert(runtimeConfig.subreddit === 'LocalLLaMA', 'runtime config must preserve non-secret provider options');
    assert(runtimeConfig.credentialRef === undefined, 'runtime config must remove credentialRef before provider execution');
    assert(tokenEndpoint.requests === 1, 'expired credential must refresh exactly once');

    const wrongTenantConfig = await configReader.readConfig({
      tenantId: wrongTenant,
      workspaceId: workspace,
      sourceBindingId: 'source-binding-source-credential-lifecycle-smoke',
    });
    assert(wrongTenantConfig === null, 'wrong tenant must not read credentialRef source binding config');

    const wrongWorkspaceConfig = await configReader.readConfig({
      tenantId: tenant,
      workspaceId: wrongWorkspace,
      sourceBindingId: 'source-binding-source-credential-lifecycle-smoke',
    });
    assert(wrongWorkspaceConfig === null, 'wrong workspace must not read credentialRef source binding config');

    const wrongTenantResolve = await resolver.resolve({
      tenantId: wrongTenant,
      workspaceId: workspace,
      sourceCredentialId: created.sourceCredential.id,
      providerKey: 'reddit',
    });
    assert(!wrongTenantResolve.ok, 'wrong tenant must not resolve source credential secret');

    const wrongWorkspaceResolve = await resolver.resolve({
      tenantId: tenant,
      workspaceId: wrongWorkspace,
      sourceCredentialId: created.sourceCredential.id,
      providerKey: 'reddit',
    });
    assert(!wrongWorkspaceResolve.ok, 'wrong workspace must not resolve source credential secret');

    const refreshedCredential = await credentials.findById({
      tenantId: tenant,
      workspaceId: workspace,
      sourceCredentialId: created.sourceCredential.id,
    });
    assert(refreshedCredential !== null, 'refreshed credential metadata must persist');
    assert(
      refreshedCredential.toSnapshot().expiresAt?.toISOString() === '2026-06-21T13:00:00.000Z',
      'refreshed credential expiration must persist for scheduler reuse',
    );

    await sourceBindings.save(SourceBinding.create({
      id: 'source-binding-with-inline-token',
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-source-credential-lifecycle-smoke',
      providerKey: 'reddit',
      capabilityProfileVersion: 1,
      config: await protector.protect({
        credentialRef: { sourceCredentialId: created.sourceCredential.id },
        accessToken: 'inline-access-token',
      }),
      createdAt: fixedNow,
    }));

    await assertRejects(
      () => configReader.readConfig({
        tenantId: tenant,
        workspaceId: workspace,
        sourceBindingId: 'source-binding-with-inline-token',
      }),
      'credentialRef config must reject inline sensitive fields',
    );

    const rotated = unwrap(await rotateCredential.execute({
      tenantId: tenant,
      workspaceId: workspace,
      sourceCredentialId: created.sourceCredential.id,
      secret: {
        accessToken: 'manually-rotated-access-token',
        accessTokenExpiresAt: '2026-06-21T14:00:00.000Z',
        refreshToken: 'manually-rotated-refresh-token',
        tokenUrl: tokenEndpoint.url,
        clientId: 'reddit-client-id',
        clientSecret: 'reddit-client-secret',
      },
      secretPreview: 'manual-rotation',
      scopes: ['read'],
      expiresAt: new Date('2026-06-21T14:00:00.000Z'),
    }), 'rotate source credential');
    assert(rotated.sourceCredential.secretPreview === 'manual-rotation', 'rotation preview must persist');
    assertPublicCredentialViewIsRedacted(rotated.sourceCredential, 'rotate source credential response');

    const rotatedSecret = unwrap(await resolver.resolve({
      tenantId: tenant,
      workspaceId: workspace,
      sourceCredentialId: created.sourceCredential.id,
      providerKey: 'reddit',
    }), 'resolve rotated source credential');
    assert(rotatedSecret.accessToken === 'manually-rotated-access-token', 'resolver must use rotated secret');
    assert(tokenEndpoint.requests === 1, 'fresh rotated credential must not refresh');

    const wrongTenantRevoke = await revokeCredential.execute({
      tenantId: wrongTenant,
      workspaceId: workspace,
      sourceCredentialId: created.sourceCredential.id,
    });
    assert(!wrongTenantRevoke.ok, 'wrong tenant must not revoke source credential');

    const wrongWorkspaceRevoke = await revokeCredential.execute({
      tenantId: tenant,
      workspaceId: wrongWorkspace,
      sourceCredentialId: created.sourceCredential.id,
    });
    assert(!wrongWorkspaceRevoke.ok, 'wrong workspace must not revoke source credential');

    const revoked = unwrap(await revokeCredential.execute({
      tenantId: tenant,
      workspaceId: workspace,
      sourceCredentialId: created.sourceCredential.id,
    }), 'revoke source credential');
    assert(revoked.sourceCredential.status === 'revoked', 'revoked credential status must persist');
    assertPublicCredentialViewIsRedacted(revoked.sourceCredential, 'revoke source credential response');

    await assertRejects(
      async () => {
        const result = await resolver.resolve({
          tenantId: tenant,
          workspaceId: workspace,
          sourceCredentialId: created.sourceCredential.id,
          providerKey: 'reddit',
        });
        if (!result.ok) {
          throw result.error;
        }
      },
      'revoked source credential must fail closed',
    );

    console.log('Source credential lifecycle smoke OK');
  } finally {
    await tokenEndpoint.close();
  }
}

const startTokenEndpoint = async (): Promise<{
  readonly url: string;
  readonly close: () => Promise<void>;
  readonly requests: number;
}> => {
  let requests = 0;
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void handleTokenRequest({ request, response, incrementRequests: () => { requests += 1; } }).catch((error) => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'token_endpoint_error' }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address !== null && typeof address === 'object', 'token endpoint must bind a TCP address');

  return {
    url: `http://127.0.0.1:${address.port}/token`,
    get requests() {
      return requests;
    },
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) {
          resolve();
          return;
        }

        reject(error);
      });
    }),
  };
};

const handleTokenRequest = async (params: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly incrementRequests: () => void;
}): Promise<void> => {
  const { request, response } = params;
  params.incrementRequests();
  const body = await readBody(request);
  const auth = request.headers.authorization;
  const expectedAuth = `Basic ${Buffer.from('reddit-client-id:reddit-client-secret').toString('base64')}`;

  if (request.method !== 'POST' || request.url !== '/token' || auth !== expectedAuth) {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'invalid_client' }));
    return;
  }

  const form = new URLSearchParams(body);
  if (form.get('grant_type') !== 'refresh_token' || form.get('refresh_token') !== 'permanent-refresh-token') {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'invalid_request' }));
    return;
  }

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({
    access_token: 'refreshed-access-token',
    refresh_token: 'rotated-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    scope: 'identity read',
  }));
};

const readBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('error', reject);
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

const assertPublicCredentialViewIsRedacted = (value: unknown, label: string): void => {
  const serialized = JSON.stringify(value);

  assert(!serialized.includes('expired-access-token'), `${label} must not include raw expired access token`);
  assert(!serialized.includes('refreshed-access-token'), `${label} must not include raw refreshed access token`);
  assert(!serialized.includes('permanent-refresh-token'), `${label} must not include raw refresh token`);
  assert(!serialized.includes('reddit-client-secret'), `${label} must not include OAuth client secret`);
  assert(!serialized.includes('secretKeyId'), `${label} must not include vault secret key id`);
};

const assertRejects = async (fn: () => Promise<unknown>, message: string): Promise<void> => {
  try {
    await fn();
  } catch {
    return;
  }

  throw new Error(message);
};

const unwrap = <TValue, TError>(result: Result<TValue, TError>, label: string): TValue => {
  if (result.ok) {
    return result.value;
  }

  throw new Error(`${label} failed: ${result.error instanceof Error ? result.error.message : String(result.error)}`);
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
