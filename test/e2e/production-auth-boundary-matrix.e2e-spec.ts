import {
  generateKeyPairSync,
  sign as signJwt,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwksUserAccessTokenVerifier } from '@social-monitor/identity/adapters/authorization/jwks-user-access-token.verifier';
import { StaticWorkspaceAuthorizationPolicy } from '@social-monitor/identity/adapters/authorization/static-workspace-authorization-policy';
import {
  WORKSPACE_ROLE_HEADER_ENV,
  WorkspaceRoleHeaderParser,
} from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import { ApiKeyRequestAuthorizer } from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE } from '@social-monitor/identity/interfaces/rest/identity-provider-tokens';
import {
  USER_ACCESS_TOKEN_VERIFIER,
  USER_WORKSPACE_MEMBERSHIP_VERIFIER,
  WORKSPACE_AUTHORIZATION_POLICY,
  type UserWorkspaceMembership,
} from '@social-monitor/identity/ports';
import { VerifyApiKeyUseCase } from '@social-monitor/identity/features/verify-api-key/verify-api-key.use-case';
import { CheckPublicApiRateLimitUseCase } from '@social-monitor/usage/features/check-public-api-rate-limit/check-public-api-rate-limit.use-case';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import { RequestCorrelationIdFactory } from '@social-monitor/platform-request-context';
import { ok, SystemClock, tenantId, userId, workspaceId } from '@social-monitor/shared-kernel';
import { CreateTopicUseCase } from '@social-monitor/monitoring/features/create-topic/create-topic.use-case';
import { ListTopicsUseCase } from '@social-monitor/monitoring/features/list-topics/list-topics.use-case';
import { TopicController } from '@social-monitor/monitoring/interfaces/rest/topic.controller';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { createApiGatewayE2eApp } from './support/api-gateway-e2e-app';

const issuer = 'https://auth.example.test';
const audience = 'social-monitor-api';
const tenant = tenantId('tenant-production-auth-matrix-e2e');
const workspace = workspaceId('workspace-production-auth-matrix-e2e');
let privateKey: KeyObject;
let jwks: { readonly keys: readonly JsonWebKey[] };

describe('Production auth boundary matrix (e2e)', () => {
  beforeAll(() => {
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = keyPair.privateKey;
    jwks = {
      keys: [{
        ...(keyPair.publicKey.export({ format: 'jwk' }) as JsonWebKey),
        kid: 'production-auth-boundary-matrix',
        alg: 'RS256',
        use: 'sig',
      }],
    };
  });

  it('ignores trusted workspace role headers when the runtime profile is beta', async () => {
    const harness = await createHarness({
      runtimeProfile: 'beta',
      membership: null,
    });

    try {
      const denied = await request(harness.app.getHttpServer())
        .post('/topics')
        .set('x-tenant-id', tenant)
        .set('x-workspace-id', workspace)
        .set('x-workspace-role', 'admin')
        .set('idempotency-key', 'production-auth-dev-role-beta')
        .send({
          name: 'Should not be created',
          query: 'ignored role header',
        })
        .expect(403);

      expect(denied.body).toMatchObject({
        code: 'authorization.denied',
        detail: 'Workspace role is required',
      });
      expect(harness.createTopic.execute).not.toHaveBeenCalled();
    } finally {
      await harness.app.close();
    }
  });

  it('rejects JWTs with the wrong audience before workspace membership lookup', async () => {
    const harness = await createHarness({
      runtimeProfile: 'deterministic-test',
      membership: {
        tenantId: tenant,
        workspaceId: workspace,
        userId: userId('wrong-audience-user'),
        roles: ['admin'],
        source: 'durable',
      },
    });
    const token = tokenFor({
      subject: 'wrong-audience-user',
      roles: ['admin'],
      audience: 'another-service',
    });

    try {
      const denied = await request(harness.app.getHttpServer())
        .get('/topics')
        .set(jwtHeaders(token))
        .expect(403);

      expect(denied.body).toMatchObject({
        code: 'authorization.denied',
        detail: 'Bearer JWT audience is not allowed',
      });
      expect(harness.membershipVerifier.verify).not.toHaveBeenCalled();
      expect(harness.listTopics.execute).not.toHaveBeenCalled();
    } finally {
      await harness.app.close();
    }
  });

  it('rejects JWT users when durable workspace membership is missing', async () => {
    const harness = await createHarness({
      runtimeProfile: 'deterministic-test',
      membership: null,
    });
    const token = tokenFor({
      subject: 'missing-membership-user',
      roles: ['admin'],
    });

    try {
      const denied = await request(harness.app.getHttpServer())
        .get('/topics')
        .set(jwtHeaders(token))
        .expect(403);

      expect(denied.body).toMatchObject({
        code: 'authorization.denied',
        detail: 'Bearer JWT workspace membership is missing',
      });
      expect(harness.membershipVerifier.verify).toHaveBeenCalledWith({
        tenantId: tenant,
        workspaceId: workspace,
        userId: 'missing-membership-user',
        tokenRoles: ['admin'],
      });
      expect(harness.listTopics.execute).not.toHaveBeenCalled();
    } finally {
      await harness.app.close();
    }
  });

  it('authorizes webhook endpoint management with JWT durable membership in beta without workspace role headers', async () => {
    const harness = await createWebhookHarness({
      runtimeProfile: 'beta',
      membership: {
        tenantId: tenant,
        workspaceId: workspace,
        userId: userId('webhook-admin-user'),
        roles: ['admin'],
        source: 'durable',
      },
    });
    const token = tokenFor({
      subject: 'webhook-admin-user',
      roles: ['admin'],
    });

    try {
      const created = await request(harness.app.getHttpServer())
        .post('/delivery/webhook-endpoints')
        .set(jwtHeaders(token))
        .send({
          url: 'https://example.com/webhooks/beta-jwt',
          eventTypes: ['digest.ready.v1'],
        })
        .expect(201);

      expect(created.body).toMatchObject({
        endpoint: {
          tenantId: tenant,
          workspaceId: workspace,
          status: 'enabled',
        },
        signingSecret: expect.stringMatching(/^whsec_/),
      });
      expect(harness.membershipVerifier.verify).toHaveBeenCalledWith({
        tenantId: tenant,
        workspaceId: workspace,
        userId: 'webhook-admin-user',
        tokenRoles: ['admin'],
      });

      const audit = await request(harness.app.getHttpServer())
        .get('/usage/audit-events')
        .query({
          actorType: 'user',
          actorId: 'webhook-admin-user',
          action: 'webhook_endpoint.created',
          limit: 10,
        })
        .set(jwtHeaders(token))
        .expect(200);

      expect(audit.body.auditEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          actorType: 'user',
          actorId: 'webhook-admin-user',
          action: 'webhook_endpoint.created',
          outcome: 'succeeded',
          resourceType: 'webhook_endpoint',
          resourceId: created.body.endpoint.id,
        }),
      ]));
    } finally {
      await harness.app.close();
    }
  });
});

const createHarness = async (params: {
  readonly runtimeProfile: 'beta' | 'deterministic-test';
  readonly membership: UserWorkspaceMembership | null;
}): Promise<{
  readonly app: INestApplication;
  readonly createTopic: { readonly execute: jest.Mock };
  readonly listTopics: { readonly execute: jest.Mock };
  readonly membershipVerifier: { readonly verify: jest.Mock };
}> => {
  const createTopic = {
    execute: jest.fn().mockResolvedValue(ok({
      topicId: 'topic-production-auth-boundary-matrix',
      created: true,
    })),
  };
  const listTopics = {
    execute: jest.fn().mockResolvedValue(ok({
      topics: [],
      nextCursor: undefined,
    })),
  };
  const membershipVerifier = {
    verify: jest.fn().mockResolvedValue(params.membership),
  };
  const recordAudit = {
    execute: jest.fn().mockResolvedValue(ok({
      auditEventId: 'audit-production-auth-boundary-matrix',
      recorded: true,
    })),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [TopicController],
    providers: [
      ApiKeyRequestAuthorizer,
      WorkspaceRoleHeaderParser,
      RequestCorrelationIdFactory,
      {
        provide: CreateTopicUseCase,
        useValue: createTopic,
      },
      {
        provide: ListTopicsUseCase,
        useValue: listTopics,
      },
      {
        provide: VerifyApiKeyUseCase,
        useValue: {
          execute: jest.fn(),
        },
      },
      {
        provide: CheckPublicApiRateLimitUseCase,
        useValue: {
          execute: jest.fn().mockResolvedValue(ok({
            allowed: true,
            remaining: 59,
            resetAt: new Date('2026-01-01T00:01:00.000Z'),
          })),
        },
      },
      {
        provide: RecordPublicApiAuditEventUseCase,
        useValue: recordAudit,
      },
      {
        provide: USER_ACCESS_TOKEN_VERIFIER,
        useFactory: () => new JwksUserAccessTokenVerifier({
          issuer,
          audience,
          jwks,
        }, new SystemClock()),
      },
      {
        provide: USER_WORKSPACE_MEMBERSHIP_VERIFIER,
        useValue: membershipVerifier,
      },
      {
        provide: WORKSPACE_AUTHORIZATION_POLICY,
        useClass: StaticWorkspaceAuthorizationPolicy,
      },
      {
        provide: WORKSPACE_ROLE_HEADER_ENV,
        useValue: {
          NODE_ENV: 'test',
          SOCIAL_MONITOR_RUNTIME_PROFILE: params.runtimeProfile,
          TRUSTED_WORKSPACE_ROLE_HEADER: 'enabled',
        },
      },
      {
        provide: IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE,
        useValue: 60,
      },
    ],
  }).compile();

  const app = createApiGatewayE2eApp(moduleRef);
  await app.init();

  return {
    app,
    createTopic,
    listTopics,
    membershipVerifier,
  };
};

const createWebhookHarness = async (params: {
  readonly runtimeProfile: 'beta' | 'deterministic-test';
  readonly membership: UserWorkspaceMembership | null;
}): Promise<{
  readonly app: INestApplication;
  readonly membershipVerifier: { readonly verify: jest.Mock };
}> => {
  const membershipVerifier = {
    verify: jest.fn().mockResolvedValue(params.membership),
  };

  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(USER_ACCESS_TOKEN_VERIFIER)
    .useValue(new JwksUserAccessTokenVerifier({
      issuer,
      audience,
      jwks,
    }, new SystemClock()))
    .overrideProvider(USER_WORKSPACE_MEMBERSHIP_VERIFIER)
    .useValue(membershipVerifier)
    .overrideProvider(WORKSPACE_ROLE_HEADER_ENV)
    .useValue({
      NODE_ENV: 'test',
      SOCIAL_MONITOR_RUNTIME_PROFILE: params.runtimeProfile,
      TRUSTED_WORKSPACE_ROLE_HEADER: 'enabled',
    });

  const moduleRef = await moduleBuilder.compile();

  const app = createApiGatewayE2eApp(moduleRef);
  await app.init();

  return {
    app,
    membershipVerifier,
  };
};

const jwtHeaders = (token: string): Readonly<Record<string, string>> => ({
  'x-tenant-id': tenant,
  'x-workspace-id': workspace,
  authorization: `Bearer ${token}`,
});

const tokenFor = (params: {
  readonly subject: string;
  readonly roles: readonly string[];
  readonly audience?: string;
  readonly expiresInSeconds?: number;
}): string => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  return createJwt(privateKey, {
    sub: params.subject,
    iss: issuer,
    aud: params.audience ?? audience,
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
    kid: 'production-auth-boundary-matrix',
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
