import {
  generateKeyPairSync,
  sign as signJwt,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryPublicApiAuditLog } from '@social-monitor/usage/adapters/audit/in-memory-public-api-audit-log';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { createApiGatewayE2eApp } from './support/api-gateway-e2e-app';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

const issuer = 'https://auth.example.test';
const audience = 'social-monitor-api';
const tenant = tenantId(deterministicTestUuid('tenant-api-key-user-jwt-management-e2e'));
const workspace = workspaceId(deterministicTestUuid('workspace-api-key-user-jwt-management-e2e'));
let privateKey: KeyObject;

describe('API key user JWT management boundary (e2e)', () => {
  let app: INestApplication;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    originalEnv = { ...process.env };

    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = keyPair.privateKey;
    const publicJwk = {
      ...(keyPair.publicKey.export({ format: 'jwk' }) as JsonWebKey),
      kid: 'api-key-user-management-test',
      alg: 'RS256',
      use: 'sig',
    };

    process.env.NODE_ENV = 'test';
    process.env.SOCIAL_MONITOR_RUNTIME_PROFILE = 'deterministic-test';
    process.env.TRUSTED_WORKSPACE_ROLE_HEADER = 'enabled';
    process.env.SOCIAL_MONITOR_USER_AUTH_MODE = 'oidc-jwt';
    process.env.SOCIAL_MONITOR_OIDC_ISSUER = issuer;
    process.env.SOCIAL_MONITOR_OIDC_AUDIENCE = audience;
    process.env.SOCIAL_MONITOR_OIDC_JWKS_JSON = JSON.stringify({ keys: [publicJwk] });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = createApiGatewayE2eApp(moduleRef);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it('lets admin JWT users manage API keys without trusted role headers', async () => {
    const adminToken = tokenFor({ subject: 'api-key-admin-user', roles: ['admin'] });
    const viewerToken = tokenFor({ subject: 'api-key-viewer-user', roles: ['viewer'] });

    const created = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set(jwtHeaders(adminToken))
      .send({
        name: 'JWT managed read key',
        scopes: ['read:summaries'],
      })
      .expect(201);

    expect(created.body).toMatchObject({
      apiKey: {
        tenantId: tenant,
        workspaceId: workspace,
        name: 'JWT managed read key',
        scopes: ['read:summaries'],
        status: 'active',
      },
      secret: expect.stringMatching(/^smk_/),
    });

    const listed = await request(app.getHttpServer())
      .get('/identity/api-keys')
      .set(jwtHeaders(adminToken))
      .query({ limit: 10 })
      .expect(200);

    expect(listed.body.apiKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: created.body.apiKey.id,
        name: 'JWT managed read key',
      }),
    ]));

    await request(app.getHttpServer())
      .get('/identity/api-keys')
      .set({
        'x-tenant-id': tenant,
        'x-workspace-id': workspace,
        authorization: `Bearer ${created.body.secret as string}`,
      })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/identity/api-keys/${created.body.apiKey.id}`)
      .set(jwtHeaders(viewerToken))
      .expect(403);

    const revoked = await request(app.getHttpServer())
      .delete(`/identity/api-keys/${created.body.apiKey.id}`)
      .set(jwtHeaders(adminToken))
      .expect(200);

    expect(revoked.body).toMatchObject({
      id: created.body.apiKey.id,
      status: 'revoked',
    });

    const auditRecords = await app.get(InMemoryPublicApiAuditLog).list({
      tenantId: tenant,
      workspaceId: workspace,
      actorType: 'user',
      limit: 20,
    });

    expect(auditRecords.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorType: 'user',
        actorId: 'api-key-admin-user',
        action: 'api_key.created',
        outcome: 'succeeded',
        resourceType: 'api_key',
        resourceId: created.body.apiKey.id,
      }),
      expect.objectContaining({
        actorType: 'user',
        actorId: 'api-key-viewer-user',
        action: 'api_keys.revoke',
        outcome: 'denied',
        reasonCode: 'authorization.denied',
        resourceType: 'public_api_request',
      }),
    ]));
    expect(JSON.stringify(auditRecords.records)).not.toContain(created.body.secret as string);
  });
});

const jwtHeaders = (token: string): Readonly<Record<string, string>> => ({
  'x-tenant-id': tenant,
  'x-workspace-id': workspace,
  authorization: `Bearer ${token}`,
});

const tokenFor = (params: {
  readonly subject: string;
  readonly roles: readonly string[];
  readonly expiresInSeconds?: number;
}): string => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  return createJwt(privateKey, {
    sub: params.subject,
    iss: issuer,
    aud: audience,
    iat: nowSeconds,
    exp: nowSeconds + (params.expiresInSeconds ?? 600),
    tenant_id: tenant,
    workspace_id: workspace,
    workspace_roles: params.roles,
  });
};

const createJwt = (
  signingKey: KeyObject,
  claims: Readonly<Record<string, unknown>>,
): string => {
  const encodedHeader = encodeJson({
    alg: 'RS256',
    typ: 'JWT',
    kid: 'api-key-user-management-test',
  });
  const encodedPayload = encodeJson(claims);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signJwt(
    'RSA-SHA256',
    Buffer.from(signingInput, 'ascii'),
    signingKey,
  ).toString('base64url');

  return `${signingInput}.${signature}`;
};

const encodeJson = (value: Readonly<Record<string, unknown>>): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
