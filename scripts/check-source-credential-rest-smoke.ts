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
    'secretKeyId',
    'source_cred_',
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
      .query({ providerKey: 'github-issues', limit: 10 })
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

void main();
