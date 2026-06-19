import {
  generateKeyPairSync,
  sign as signJwt,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { createApiGatewayE2eApp } from './support/api-gateway-e2e-app';

const issuer = 'https://auth.example.test';
const audience = 'social-monitor-api';
let privateKey: KeyObject;

describe('Scan dead-letter authorization (e2e)', () => {
  let app: INestApplication;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    originalEnv = { ...process.env };

    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = keyPair.privateKey;
    const publicJwk = {
      ...(keyPair.publicKey.export({ format: 'jwk' }) as JsonWebKey),
      kid: 'scan-dead-letter-auth-test',
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

  it('requires owner/admin workspace role for support-safe scan dead-letter inspection', async () => {
    const tenant = tenantId('tenant-scan-dlq-auth-e2e');
    const workspace = workspaceId('workspace-scan-dlq-auth-e2e');
    await app.get(InMemoryScanFailureQueueAdapter).deadLetter({
      tenantId: tenant,
      workspaceId: workspace,
      scanJobId: 'scan-dlq-auth-e2e-1',
      topicId: 'topic-dlq-auth-e2e-1',
      sourceBindingId: 'source-binding-dlq-auth-e2e-1',
      scanPolicyId: 'scan-policy-dlq-auth-e2e-1',
      providerKey: 'fake-source',
      sourceQuery: {
        mode: 'search',
        query: 'dlq auth',
      },
      correlationId: 'correlation-dlq-auth-e2e-1',
      causationId: 'causation-dlq-auth-e2e-1',
      attemptNumber: 3,
      retryBudget: 3,
      failureReason: '429 provider rate limit with internal details',
    });

    const missingRole = await request(app.getHttpServer())
      .get('/ingestion/scan-dead-letters')
      .query({ limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'scan_dead_letters.read',
      },
    });

    const viewerDenied = await request(app.getHttpServer())
      .get('/ingestion/scan-dead-letters')
      .query({ limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(403);

    expect(viewerDenied.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'scan_dead_letters.read',
      },
    });

    const allowed = await request(app.getHttpServer())
      .get('/ingestion/scan-dead-letters')
      .query({ limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .expect(200);

    expect(allowed.body).toMatchObject({
      deadLetters: [
        expect.objectContaining({
          scanJobId: 'scan-dlq-auth-e2e-1',
          failureClass: 'provider_rate_limited',
          correlationId: 'correlation-dlq-auth-e2e-1',
        }),
      ],
    });
    expect(JSON.stringify(allowed.body)).not.toContain('internal details');

    const adminToken = tokenFor({ tenant, workspace, subject: 'scan-dlq-admin-user', roles: ['admin'] });
    const viewerToken = tokenFor({ tenant, workspace, subject: 'scan-dlq-viewer-user', roles: ['viewer'] });

    const jwtAllowed = await request(app.getHttpServer())
      .get('/ingestion/scan-dead-letters')
      .query({ limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(jwtAllowed.body.deadLetters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scanJobId: 'scan-dlq-auth-e2e-1',
        failureClass: 'provider_rate_limited',
      }),
    ]));

    const jwtViewerDenied = await request(app.getHttpServer())
      .get('/ingestion/scan-dead-letters')
      .query({ limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('authorization', `Bearer ${viewerToken}`)
      .expect(403);

    expect(jwtViewerDenied.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'scan_dead_letters.read',
      },
    });

    const apiKeyDenied = await request(app.getHttpServer())
      .get('/ingestion/scan-dead-letters')
      .query({ limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('authorization', 'Bearer smk_fake-dead-letter-reader')
      .expect(403);

    expect(apiKeyDenied.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Bearer JWT authorization is required',
    });
  });
});

const tokenFor = (params: {
  readonly tenant: string;
  readonly workspace: string;
  readonly subject: string;
  readonly roles: readonly string[];
}): string => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  return createJwt(privateKey, {
    sub: params.subject,
    iss: issuer,
    aud: audience,
    iat: nowSeconds,
    exp: nowSeconds + 600,
    tenant_id: params.tenant,
    workspace_id: params.workspace,
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
    kid: 'scan-dead-letter-auth-test',
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
