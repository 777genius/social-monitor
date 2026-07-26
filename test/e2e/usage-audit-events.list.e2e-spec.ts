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
let privateKey: KeyObject;

describe('Usage audit events API (e2e)', () => {
  let app: INestApplication;
  let auditLog: InMemoryPublicApiAuditLog;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    originalEnv = { ...process.env };

    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = keyPair.privateKey;
    const publicJwk = {
      ...(keyPair.publicKey.export({ format: 'jwk' }) as JsonWebKey),
      kid: 'usage-audit-auth-test',
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
    auditLog = moduleRef.get(InMemoryPublicApiAuditLog);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it('lists scoped audit events with filters, cursor pagination and admin-only access', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-usage-audit-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-usage-audit-e2e'));
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };

    await auditLog.append({
      id: 'audit-e2e-older',
      tenantId: tenant,
      workspaceId: workspace,
      actorType: 'api_key',
      actorId: 'api-key-e2e-1',
      action: 'feed.list',
      outcome: 'succeeded',
      resourceType: 'feed',
      resourceId: 'feed-page-e2e',
      metadata: { source: 'e2e' },
      occurredAt: new Date('2026-06-07T10:00:00.000Z'),
    });
    await auditLog.append({
      id: 'audit-e2e-newer',
      tenantId: tenant,
      workspaceId: workspace,
      actorType: 'api_key',
      actorId: 'api-key-e2e-1',
      action: 'feed.list',
      outcome: 'denied',
      reasonCode: 'rate_limited',
      resourceType: 'feed',
      resourceId: 'feed-page-e2e',
      metadata: { source: 'e2e' },
      occurredAt: new Date('2026-06-07T11:00:00.000Z'),
    });
    await auditLog.append({
      id: 'audit-e2e-other-workspace',
      tenantId: tenant,
      workspaceId: workspaceId(deterministicTestUuid('workspace-usage-audit-other-e2e')),
      actorType: 'api_key',
      actorId: 'api-key-e2e-1',
      action: 'feed.list',
      outcome: 'succeeded',
      resourceType: 'feed',
      metadata: { source: 'e2e' },
      occurredAt: new Date('2026-06-07T12:00:00.000Z'),
    });

    const firstPage = await request(app.getHttpServer())
      .get('/usage/audit-events')
      .query({ actorType: 'api_key', actorId: 'api-key-e2e-1', action: 'feed.list', limit: 1 })
      .set(headers)
      .set('x-workspace-role', 'admin')
      .expect(200);

    expect(firstPage.body.auditEvents).toEqual([
      expect.objectContaining({
        id: 'audit-e2e-newer',
        outcome: 'denied',
        reasonCode: 'rate_limited',
        metadata: { source: 'e2e' },
      }),
    ]);
    expect(firstPage.body.nextCursor).toEqual(expect.any(String));

    const secondPage = await request(app.getHttpServer())
      .get('/usage/audit-events')
      .query({
        actorType: 'api_key',
        actorId: 'api-key-e2e-1',
        action: 'feed.list',
        limit: 10,
        cursor: firstPage.body.nextCursor,
      })
      .set(headers)
      .set('x-workspace-role', 'admin')
      .expect(200);

    expect(secondPage.body.auditEvents).toEqual([
      expect.objectContaining({
        id: 'audit-e2e-older',
        outcome: 'succeeded',
      }),
    ]);
    expect(JSON.stringify(secondPage.body)).not.toContain('audit-e2e-other-workspace');

    await request(app.getHttpServer())
      .get('/usage/audit-events')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(403);

    await request(app.getHttpServer())
      .get('/usage/audit-events')
      .query({ outcome: 'unknown' })
      .set(headers)
      .set('x-workspace-role', 'admin')
      .expect(400);

    const adminToken = tokenFor({ tenant, workspace, subject: 'usage-audit-admin-user', roles: ['admin'] });
    const viewerToken = tokenFor({ tenant, workspace, subject: 'usage-audit-viewer-user', roles: ['viewer'] });

    const jwtRead = await request(app.getHttpServer())
      .get('/usage/audit-events')
      .query({ actorType: 'api_key', actorId: 'api-key-e2e-1', limit: 10 })
      .set(headers)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(jwtRead.body.auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'audit-e2e-newer',
        outcome: 'denied',
      }),
    ]));

    const jwtViewerDenied = await request(app.getHttpServer())
      .get('/usage/audit-events')
      .set(headers)
      .set('authorization', `Bearer ${viewerToken}`)
      .expect(403);

    expect(jwtViewerDenied.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'public_api_audit.read',
      },
    });

    const apiKeyDenied = await request(app.getHttpServer())
      .get('/usage/audit-events')
      .set(headers)
      .set('authorization', 'Bearer smk_fake-audit-reader')
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
    kid: 'usage-audit-auth-test',
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
