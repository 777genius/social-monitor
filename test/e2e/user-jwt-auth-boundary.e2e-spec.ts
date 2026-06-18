import {
  generateKeyPairSync,
  sign as signJwt,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

const issuer = 'https://auth.example.test';
const audience = 'social-monitor-api';
const tenant = tenantId('tenant-user-jwt-auth-boundary-e2e');
const workspace = workspaceId('workspace-user-jwt-auth-boundary-e2e');
let privateKey: KeyObject;

describe('User JWT auth boundary (e2e)', () => {
  let app: INestApplication;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    originalEnv = { ...process.env };

    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = keyPair.privateKey;
    const publicJwk = {
      ...(keyPair.publicKey.export({ format: 'jwk' }) as JsonWebKey),
      kid: 'user-auth-boundary-test',
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

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it('enforces JWT workspace roles, tenant scope, expiry and user audit evidence', async () => {
    const adminToken = tokenFor({ subject: 'admin-user', roles: ['admin'] });
    const viewerToken = tokenFor({ subject: 'viewer-user', roles: ['viewer'] });
    const otherTenantToken = tokenFor({
      subject: 'other-tenant-user',
      tenant: tenantId('other-tenant-user-jwt-auth-boundary-e2e'),
      roles: ['admin'],
    });
    const expiredToken = tokenFor({
      subject: 'expired-user',
      roles: ['admin'],
      expiresInSeconds: -60,
    });

    const created = await request(app.getHttpServer())
      .post('/topics')
      .set(jwtHeaders(adminToken))
      .set('x-request-id', 'user-jwt-topic-create-admin')
      .set('idempotency-key', 'user-jwt-topic-create-admin')
      .send({
        name: 'JWT admin topic',
        query: 'jwt admin topic',
      })
      .expect(201);

    expect(created.body).toEqual({
      topicId: expect.any(String),
      created: true,
    });

    const viewerRead = await request(app.getHttpServer())
      .get('/topics')
      .set(jwtHeaders(viewerToken))
      .query({ limit: 10 })
      .expect(200);

    expect(viewerRead.body.topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.body.topicId,
          name: 'JWT admin topic',
        }),
      ]),
    );

    const viewerWrite = await request(app.getHttpServer())
      .post('/topics')
      .set(jwtHeaders(viewerToken))
      .set('x-request-id', 'user-jwt-topic-create-viewer')
      .set('idempotency-key', 'user-jwt-topic-create-viewer')
      .send({
        name: 'JWT viewer topic',
        query: 'jwt viewer topic',
      })
      .expect(403);

    expect(viewerWrite.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'topics.create',
        requiredRoles: ['owner', 'admin'],
      },
    });

    const tenantMismatch = await request(app.getHttpServer())
      .get('/topics')
      .set(jwtHeaders(otherTenantToken))
      .expect(403);

    expect(tenantMismatch.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Bearer JWT tenant or workspace does not match request scope',
    });

    const expired = await request(app.getHttpServer())
      .get('/topics')
      .set(jwtHeaders(expiredToken))
      .expect(403);

    expect(expired.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Bearer JWT is expired',
    });

    const audit = await request(app.getHttpServer())
      .get('/usage/audit-events')
      .set({
        'x-tenant-id': tenant,
        'x-workspace-id': workspace,
        'x-workspace-role': 'admin',
      })
      .query({ actorType: 'user', limit: 20 })
      .expect(200);

    expect(audit.body.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorType: 'user',
          actorId: 'admin-user',
          action: 'topics.create',
          outcome: 'succeeded',
          metadata: expect.objectContaining({
            authType: 'oidc_jwt',
            requiredScope: 'write:topics',
            roles: ['admin'],
            claimedRoles: ['admin'],
            membershipSource: 'token_claim',
          }),
        }),
        expect.objectContaining({
          actorType: 'user',
          actorId: 'viewer-user',
          action: 'topics.create',
          outcome: 'denied',
          reasonCode: 'authorization.denied',
        }),
      ]),
    );
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
  readonly tenant?: string;
  readonly workspace?: string;
  readonly expiresInSeconds?: number;
}): string => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  return createJwt(privateKey, {
    sub: params.subject,
    iss: issuer,
    aud: audience,
    iat: nowSeconds,
    exp: nowSeconds + (params.expiresInSeconds ?? 600),
    tenant_id: params.tenant ?? tenant,
    workspace_id: params.workspace ?? workspace,
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
    kid: 'user-auth-boundary-test',
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
