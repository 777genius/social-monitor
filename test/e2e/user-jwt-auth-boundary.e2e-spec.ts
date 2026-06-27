import {
  generateKeyPairSync,
  sign as signJwt,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { createApiGatewayE2eApp } from './support/api-gateway-e2e-app';

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

    app = createApiGatewayE2eApp(moduleRef);
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
    const otherWorkspaceToken = tokenFor({
      subject: 'other-workspace-user',
      workspace: workspaceId('other-workspace-user-jwt-auth-boundary-e2e'),
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

    const workspaceMismatch = await request(app.getHttpServer())
      .get('/topics')
      .set(jwtHeaders(otherWorkspaceToken))
      .expect(403);

    expect(workspaceMismatch.body).toMatchObject({
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

  it('binds user personalization writes to the authenticated JWT subject', async () => {
    const memberToken = tokenFor({ subject: 'personalization-user', roles: ['member'] });

    await request(app.getHttpServer())
      .put('/topics/topic-jwt-user-preference/user-summary-preference')
      .set(jwtHeaders(memberToken))
      .send({
        userId: 'another-user',
        language: 'ru',
        tone: 'concise',
        customInstructions: 'This must not be written for another user.',
      })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'authorization.denied',
          detail: 'Bearer JWT user cannot write another user summary preference',
        });
      });

    const preference = await request(app.getHttpServer())
      .put('/topics/topic-jwt-user-preference/user-summary-preference')
      .set(jwtHeaders(memberToken))
      .send({
        userId: 'personalization-user',
        language: 'ru',
        tone: 'concise',
        customInstructions: 'Prioritize concise security updates.',
      })
      .expect(200);

    expect(preference.body).toEqual({
      created: true,
      summaryPreference: expect.objectContaining({
        userId: 'personalization-user',
        topicId: 'topic-jwt-user-preference',
        language: 'ru',
        tone: 'concise',
        customInstructions: 'Prioritize concise security updates.',
      }),
    });

    await request(app.getHttpServer())
      .get('/topics/topic-jwt-user-preference/user-summary-preference')
      .query({ userId: 'another-user' })
      .set(jwtHeaders(memberToken))
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'authorization.denied',
          detail: 'Bearer JWT user cannot access another user summary preference',
        });
      });

    const effectivePreference = await request(app.getHttpServer())
      .get('/topics/topic-jwt-user-preference/user-summary-preference')
      .query({ userId: 'personalization-user' })
      .set(jwtHeaders(memberToken))
      .expect(200);

    expect(effectivePreference.body).toEqual({
      source: 'topic',
      summaryPreference: expect.objectContaining({
        userId: 'personalization-user',
        topicId: 'topic-jwt-user-preference',
        language: 'ru',
        tone: 'concise',
      }),
    });
  });

  it('binds user subscription writes and reads to the authenticated JWT subject', async () => {
    const memberToken = tokenFor({ subject: 'subscription-user', roles: ['member'] });

    await request(app.getHttpServer())
      .post('/user-subscriptions')
      .set(jwtHeaders(memberToken))
      .send({
        userId: 'another-user',
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'programming',
        schedule: {
          recipientKey: 'another-user',
          channel: 'in_app',
          intervalSeconds: 3600,
          includeNoSignal: true,
        },
      })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'authorization.denied',
          detail: 'Bearer JWT user cannot access another user subscription preference',
        });
      });

    const created = await request(app.getHttpServer())
      .post('/user-subscriptions')
      .set(jwtHeaders(memberToken))
      .send({
        userId: 'subscription-user',
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'programming',
        schedule: {
          recipientKey: 'subscription-user',
          channel: 'in_app',
          intervalSeconds: 3600,
          includeNoSignal: true,
        },
      })
      .expect(201);

    expect(created.body).toEqual(expect.objectContaining({
      created: true,
      subscription: expect.objectContaining({
        userId: 'subscription-user',
      }),
    }));

    await request(app.getHttpServer())
      .get('/user-subscriptions')
      .query({ userId: 'another-user' })
      .set(jwtHeaders(memberToken))
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'authorization.denied',
          detail: 'Bearer JWT user cannot access another user subscription preference',
        });
      });

    const listed = await request(app.getHttpServer())
      .get('/user-subscriptions')
      .query({ userId: 'subscription-user' })
      .set(jwtHeaders(memberToken))
      .expect(200);

    expect(listed.body.subscriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subscription: expect.objectContaining({
          userId: 'subscription-user',
        }),
      }),
    ]));
  });

  it('binds source activation writes to the authenticated JWT subject', async () => {
    const memberToken = tokenFor({ subject: 'activation-user', roles: ['member'] });
    const viewerToken = tokenFor({ subject: 'activation-viewer', roles: ['viewer'] });

    await request(app.getHttpServer())
      .post('/user-subscriptions/activate-source')
      .set(jwtHeaders(viewerToken))
      .send({
        userId: 'activation-viewer',
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'programming',
        schedule: {
          recipientKey: 'activation-viewer',
          channel: 'in_app',
          intervalSeconds: 3600,
          includeNoSignal: true,
        },
      })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'authorization.denied',
          detail: 'Workspace role is not allowed for this action',
          details: {
            action: 'user_subscriptions.create',
            requiredRoles: ['owner', 'admin', 'member'],
          },
        });
      });

    await request(app.getHttpServer())
      .post('/user-subscriptions/activate-source')
      .set(jwtHeaders(memberToken))
      .send({
        userId: 'another-user',
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'programming',
        schedule: {
          recipientKey: 'another-user',
          channel: 'in_app',
          intervalSeconds: 3600,
          includeNoSignal: true,
        },
      })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'authorization.denied',
          detail: 'Bearer JWT user cannot access another user subscription preference',
        });
      });

    const activated = await request(app.getHttpServer())
      .post('/user-subscriptions/activate-source')
      .set(jwtHeaders(memberToken))
      .send({
        userId: 'activation-user',
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'programming',
        schedule: {
          recipientKey: 'activation-user',
          channel: 'in_app',
          intervalSeconds: 3600,
          includeNoSignal: true,
        },
      })
      .expect(201);

    expect(activated.body).toEqual(expect.objectContaining({
      created: true,
      sourceTarget: expect.objectContaining({
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'programming',
      }),
      subscription: expect.objectContaining({
        userId: 'activation-user',
      }),
      activation: {
        topicCreated: true,
        sourceBindingCreated: true,
        scanPolicyCreated: true,
        scanPolicyUpdated: false,
      },
    }));
  });

  it('binds summary feedback actors to the authenticated JWT subject', async () => {
    const memberToken = tokenFor({ subject: 'feedback-user', roles: ['member'] });

    await request(app.getHttpServer())
      .post('/summaries/summary-jwt-feedback-actor/feedback')
      .set(jwtHeaders(memberToken))
      .set('x-actor-id', 'another-user')
      .set('x-request-id', 'jwt-feedback-actor-mismatch')
      .set('idempotency-key', 'jwt-feedback-actor-mismatch')
      .send({
        category: 'too_verbose',
        rating: 2,
        comment: 'This actor override must be rejected before memory learns it.',
      })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'authorization.denied',
          detail: 'Bearer JWT user cannot submit summary feedback for another actor',
        });
      });
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
