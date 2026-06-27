import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertNoSecretMaterial = (value: unknown, message: string): void => {
  const serialized = JSON.stringify(value);

  for (const secret of [
    'fixture-access-token',
    'fixture-refresh-token',
    'fixture-client-secret',
    'rotated-access-token',
    'rotated-refresh-token',
    'rotated-client-secret',
    'api-key-access-token',
    'api-key-refresh-token',
    'api-key-client-secret',
    'unsafe-preview-access-token',
    'secretKeyId',
    'source_cred_',
    'smk_',
  ]) {
    assert(!serialized.includes(secret), `${message}: leaked ${secret}`);
  }
};

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [MonitoringRestModule],
    providers: [
      {
        provide: APP_FILTER,
        useClass: DomainErrorFilter,
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  try {
    const tenant = tenantId('tenant-source-credential-rest-smoke');
    const workspace = workspaceId('workspace-source-credential-rest-smoke');
    const adminHeaders = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
      'x-workspace-role': 'admin',
    };
    const viewerHeaders = {
      ...adminHeaders,
      'x-workspace-role': 'viewer',
    };
    const otherWorkspaceHeaders = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspaceId('workspace-source-credential-rest-smoke-other'),
      'x-workspace-role': 'admin',
    };
    const server = app.getHttpServer();
    const readApiKeySecret = await createApiKey({
      server,
      tenant,
      workspace,
      name: 'Source credential reader',
      scopes: ['read:topics'],
    });
    const writeApiKeySecret = await createApiKey({
      server,
      tenant,
      workspace,
      name: 'Source credential writer',
      scopes: ['write:source_bindings'],
    });
    const otherWorkspaceReadApiKeySecret = await createApiKey({
      server,
      tenant,
      workspace: workspaceId('workspace-source-credential-rest-smoke-api-key-other'),
      name: 'Other workspace source credential reader',
      scopes: ['read:topics'],
    });

    await request(app.getHttpServer())
      .post('/source-credentials')
      .set(viewerHeaders)
      .send({
        providerKey: 'reddit',
        kind: 'oauth2',
        secret: {
          accessToken: 'fixture-access-token',
          refreshToken: 'fixture-refresh-token',
          clientId: 'fixture-client-id',
          clientSecret: 'fixture-client-secret',
        },
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/source-credentials')
      .set({
        'x-tenant-id': tenant,
        'x-workspace-id': workspace,
        Authorization: `Bearer ${readApiKeySecret}`,
      })
      .send({
        providerKey: 'reddit',
        kind: 'oauth2',
        secret: {
          accessToken: 'api-key-access-token',
          refreshToken: 'api-key-refresh-token',
          clientId: 'api-key-client-id',
          clientSecret: 'api-key-client-secret',
        },
      })
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/source-credentials')
      .set(adminHeaders)
      .send({
        providerKey: 'reddit',
        kind: 'oauth2',
        secret: {
          accessToken: 'fixture-access-token',
          refreshToken: 'fixture-refresh-token',
          clientId: 'fixture-client-id',
          clientSecret: 'fixture-client-secret',
        },
        secretPreview: 'reddit-oauth',
        scopes: ['read', 'identity'],
        expiresAt: '2026-06-21T12:00:00.000Z',
      })
      .expect(201);

    const credential = created.body.sourceCredential;
    assert(typeof credential.id === 'string', 'source credential create must return id');
    assert(credential.providerKey === 'reddit', 'source credential create must preserve provider key');
    assert(credential.kind === 'oauth2', 'source credential create must preserve kind');
    assert(credential.status === 'active', 'source credential create must return active status');
    assert(credential.secretPreview === 'reddit-oauth', 'source credential create must return safe secret preview');
    assert(credential.scopes.length === 2, 'source credential create must preserve scopes');
    assertNoSecretMaterial(created.body, 'source credential create response must not expose secret material');

    const apiKeyCreated = await request(app.getHttpServer())
      .post('/source-credentials')
      .set({
        'x-tenant-id': tenant,
        'x-workspace-id': workspace,
        Authorization: `Bearer ${writeApiKeySecret}`,
      })
      .send({
        providerKey: 'github-issues',
        kind: 'bearer_token',
        secret: {
          accessToken: 'api-key-access-token',
        },
        secretPreview: 'github-issues-api-key',
        scopes: ['public_repo'],
      })
      .expect(201);

    assert(
      apiKeyCreated.body.sourceCredential.providerKey === 'github-issues',
      'write:source_bindings API key must create source credentials',
    );
    assertNoSecretMaterial(apiKeyCreated.body, 'source credential API key create response must not expose secrets');

    const unsafePreview = await request(app.getHttpServer())
      .post('/source-credentials')
      .set(adminHeaders)
      .send({
        providerKey: 'hacker-news',
        kind: 'bearer_token',
        secret: {
          accessToken: 'unsafe-preview-access-token',
        },
        secretPreview: 'unsafe-preview-access-token',
      })
      .expect(201);

    assert(
      unsafePreview.body.sourceCredential.secretPreview === 'configured',
      'source credential create must replace secret-like preview with a safe fallback',
    );
    assertNoSecretMaterial(
      unsafePreview.body,
      'source credential create with unsafe preview must not expose secret material',
    );

    const listed = await request(app.getHttpServer())
      .get('/source-credentials')
      .set(viewerHeaders)
      .query({ providerKey: 'reddit', limit: 10 })
      .expect(200);

    assert(listed.body.sourceCredentials.length === 1, 'source credential list must return created credential');
    assert(
      listed.body.sourceCredentials[0].id === credential.id,
      'source credential list must preserve credential id',
    );
    assertNoSecretMaterial(listed.body, 'source credential list response must not expose secret material');

    const apiKeyListed = await request(app.getHttpServer())
      .get('/source-credentials')
      .set({
        'x-tenant-id': tenant,
        'x-workspace-id': workspace,
        Authorization: `Bearer ${readApiKeySecret}`,
      })
      .query({ providerKey: 'github-issues', limit: 10 })
      .expect(200);

    assert(
      apiKeyListed.body.sourceCredentials[0]?.id === apiKeyCreated.body.sourceCredential.id,
      'read:topics API key must list source credentials for its workspace',
    );
    assertNoSecretMaterial(apiKeyListed.body, 'source credential API key list response must not expose secrets');

    await request(app.getHttpServer())
      .get('/source-credentials')
      .set({
        'x-tenant-id': tenant,
        'x-workspace-id': workspace,
        Authorization: `Bearer ${writeApiKeySecret}`,
      })
      .query({ providerKey: 'reddit', limit: 10 })
      .expect(403);

    await request(app.getHttpServer())
      .get('/source-credentials')
      .set({
        'x-tenant-id': tenant,
        'x-workspace-id': workspace,
        Authorization: `Bearer ${otherWorkspaceReadApiKeySecret}`,
      })
      .query({ providerKey: 'reddit', limit: 10 })
      .expect(403);

    const otherWorkspaceList = await request(app.getHttpServer())
      .get('/source-credentials')
      .set(otherWorkspaceHeaders)
      .query({ providerKey: 'reddit', limit: 10 })
      .expect(200);
    assert(
      otherWorkspaceList.body.sourceCredentials.length === 0,
      'other workspace must not list source credentials',
    );

    await request(app.getHttpServer())
      .get('/source-credentials')
      .set(viewerHeaders)
      .query({ limit: 0 })
      .expect(400);

    const githubList = await request(app.getHttpServer())
      .get('/source-credentials')
      .set(viewerHeaders)
      .query({ providerKey: 'rss', limit: 10 })
      .expect(200);
    assert(githubList.body.sourceCredentials.length === 0, 'provider filter must narrow source credentials');

    await request(app.getHttpServer())
      .patch(`/source-credentials/${credential.id}/rotate`)
      .set(viewerHeaders)
      .send({
        secret: {
          accessToken: 'rotated-access-token',
          refreshToken: 'rotated-refresh-token',
          clientId: 'fixture-client-id',
          clientSecret: 'rotated-client-secret',
        },
        secretPreview: 'rotated-oauth',
      })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/source-credentials/${credential.id}/rotate`)
      .set({
        'x-tenant-id': tenant,
        'x-workspace-id': workspace,
        Authorization: `Bearer ${readApiKeySecret}`,
      })
      .send({
        secret: {
          accessToken: 'rotated-access-token',
          refreshToken: 'rotated-refresh-token',
          clientId: 'fixture-client-id',
        },
      })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/source-credentials/${credential.id}/rotate`)
      .set(otherWorkspaceHeaders)
      .send({
        secret: {
          accessToken: 'rotated-access-token',
          refreshToken: 'rotated-refresh-token',
          clientId: 'fixture-client-id',
        },
      })
      .expect(404);

    const rotated = await request(app.getHttpServer())
      .patch(`/source-credentials/${credential.id}/rotate`)
      .set(adminHeaders)
      .send({
        secret: {
          accessToken: 'rotated-access-token',
          refreshToken: 'rotated-refresh-token',
          clientId: 'fixture-client-id',
          clientSecret: 'rotated-client-secret',
        },
        secretPreview: 'rotated-oauth',
        scopes: ['read'],
        expiresAt: '2026-06-21T13:00:00.000Z',
      })
      .expect(200);

    assert(rotated.body.sourceCredential.secretPreview === 'rotated-oauth', 'rotation must update preview');
    assert(rotated.body.sourceCredential.scopes.length === 1, 'rotation must update scopes');
    assert(rotated.body.sourceCredential.status === 'active', 'rotation must keep credential active');
    assertNoSecretMaterial(rotated.body, 'source credential rotate response must not expose secret material');

    const apiKeyRotated = await request(app.getHttpServer())
      .patch(`/source-credentials/${apiKeyCreated.body.sourceCredential.id}/rotate`)
      .set({
        'x-tenant-id': tenant,
        'x-workspace-id': workspace,
        Authorization: `Bearer ${writeApiKeySecret}`,
      })
      .send({
        secret: {
          accessToken: 'rotated-access-token',
        },
        secretPreview: 'github-issues-rotated',
      })
      .expect(200);

    assert(
      apiKeyRotated.body.sourceCredential.secretPreview === 'github-issues-rotated',
      'write:source_bindings API key must rotate source credentials',
    );
    assertNoSecretMaterial(apiKeyRotated.body, 'source credential API key rotate response must not expose secrets');

    await request(app.getHttpServer())
      .post(`/source-credentials/${credential.id}/revoke`)
      .set({
        'x-tenant-id': tenant,
        'x-workspace-id': workspace,
        Authorization: `Bearer ${readApiKeySecret}`,
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/source-credentials/${credential.id}/revoke`)
      .set(otherWorkspaceHeaders)
      .expect(404);

    const revoked = await request(app.getHttpServer())
      .post(`/source-credentials/${credential.id}/revoke`)
      .set(adminHeaders)
      .expect(201);

    assert(revoked.body.sourceCredential.status === 'revoked', 'revoke must mark credential revoked');
    assertNoSecretMaterial(revoked.body, 'source credential revoke response must not expose secret material');

    const apiKeyRevoked = await request(app.getHttpServer())
      .post(`/source-credentials/${apiKeyCreated.body.sourceCredential.id}/revoke`)
      .set({
        'x-tenant-id': tenant,
        'x-workspace-id': workspace,
        Authorization: `Bearer ${writeApiKeySecret}`,
      })
      .expect(201);

    assert(
      apiKeyRevoked.body.sourceCredential.status === 'revoked',
      'write:source_bindings API key must revoke source credentials',
    );
    assertNoSecretMaterial(apiKeyRevoked.body, 'source credential API key revoke response must not expose secrets');

    const listedAfterRevoke = await request(app.getHttpServer())
      .get('/source-credentials')
      .set(viewerHeaders)
      .query({ providerKey: 'reddit', limit: 10 })
      .expect(200);
    assert(
      listedAfterRevoke.body.sourceCredentials[0].status === 'revoked',
      'source credential list must expose revoked status without deleting metadata',
    );
    assertNoSecretMaterial(
      listedAfterRevoke.body,
      'source credential list after revoke must not expose secret material',
    );

    console.log('Source credential REST smoke OK');
  } finally {
    await app.close();
  }
}

const createApiKey = async (params: {
  readonly server: Parameters<typeof request>[0];
  readonly tenant: string;
  readonly workspace: string;
  readonly name: string;
  readonly scopes: readonly string[];
}): Promise<string> => {
  const response = await request(params.server)
    .post('/identity/api-keys')
    .set('x-tenant-id', params.tenant)
    .set('x-workspace-id', params.workspace)
    .set('x-workspace-role', 'admin')
    .send({
      name: params.name,
      scopes: params.scopes,
    })
    .expect(201);

  return response.body.secret;
};

void main();
