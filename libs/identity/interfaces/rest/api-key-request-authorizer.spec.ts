import type { ApiKeyScope } from '@social-monitor/identity/domain';
import type { VerifyApiKeyCommand } from '@social-monitor/identity/features/verify-api-key/verify-api-key.command';
import type { VerifyApiKeyUseCase } from '@social-monitor/identity/features/verify-api-key/verify-api-key.use-case';
import {
  DomainError,
  err,
  ok,
  tenantId,
  userId,
  workspaceId,
  type Result,
} from '@social-monitor/shared-kernel';
import type { CheckPublicApiRateLimitUseCase } from '@social-monitor/usage/features/check-public-api-rate-limit/check-public-api-rate-limit.use-case';
import type { CheckPublicApiRateLimitCommand } from '@social-monitor/usage/features/check-public-api-rate-limit/check-public-api-rate-limit.command';
import type { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import type { RecordPublicApiAuditEventCommand } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.command';

import type {
  UserAccessTokenPrincipal,
  UserAccessTokenVerifierPort,
  UserWorkspaceMembership,
  UserWorkspaceMembershipVerifierPort,
  WorkspaceAuthorizationPolicyPort,
  WorkspaceAuthorizationRequest,
} from '../../ports';
import { ApiKeyRequestAuthorizer } from './api-key-request-authorizer';

const tenant = tenantId('tenant-1');
const workspace = workspaceId('workspace-1');

describe('ApiKeyRequestAuthorizer', () => {
  it('keeps smk_ bearer tokens on the API key path', async () => {
    const dependencies = createDependencies();
    const authorizer = createAuthorizer(dependencies);

    const result = await authorizer.authorize({
      authorizationHeader: 'Bearer smk_test-secret',
      tenantId: tenant,
      workspaceId: workspace,
      requiredScope: 'read:topics',
      operation: 'topics.read',
    });

    expect(result).toEqual({
      actorType: 'api_key',
      actorId: 'api-key-1',
      apiKeyId: 'api-key-1',
    });
    expect(dependencies.verifyApiKey.execute).toHaveBeenCalledWith({
      secret: 'smk_test-secret',
      requiredScope: 'read:topics',
    });
    expect(dependencies.userAccessTokenVerifier.verify).not.toHaveBeenCalled();
  });

  it('authorizes JWT users through durable workspace membership and records user audit evidence', async () => {
    const dependencies = createDependencies();
    const authorizer = createAuthorizer(dependencies);

    const result = await authorizer.authorize({
      authorizationHeader: 'Bearer jwt.header.signature',
      tenantId: tenant,
      workspaceId: workspace,
      requiredScope: 'write:topics',
      operation: 'topics.create',
    });

    expect(result).toEqual({
      actorType: 'user',
      actorId: 'user-1',
      userId: 'user-1',
    });
    expect(dependencies.userWorkspaceMembershipVerifier.verify).toHaveBeenCalledWith({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      tokenRoles: ['admin'],
    });
    expect(dependencies.workspaceAuthorization.authorize).toHaveBeenCalledWith({
      tenantId: tenant,
      workspaceId: workspace,
      action: 'topics.create',
      roles: ['admin'],
    });
    expect(dependencies.checkPublicApiRateLimit.execute).toHaveBeenCalledWith({
      subjectKey: 'user:user-1',
      operation: 'topics.create',
      limit: 60,
      windowSeconds: 60,
    });
    expect(dependencies.auditEvents.at(-1)).toMatchObject({
      actorType: 'user',
      actorId: 'user-1',
      action: 'topics.create',
      outcome: 'succeeded',
      metadata: {
        authType: 'oidc_jwt',
        issuer: 'https://auth.example.test',
        requiredScope: 'write:topics',
        roles: ['admin'],
        claimedRoles: ['admin'],
        membershipSource: 'durable',
      },
    });
  });

  it('denies JWT users from a different tenant or workspace and audits the denial', async () => {
    const dependencies = createDependencies({
      principal: {
        subject: userId('user-1'),
        tenantId: tenantId('tenant-2'),
        workspaceId: workspace,
        roles: ['admin'],
        issuer: 'https://auth.example.test',
        audience: ['social-monitor-api'],
      },
    });
    const authorizer = createAuthorizer(dependencies);

    await expect(authorizer.authorize({
      authorizationHeader: 'Bearer jwt.header.signature',
      tenantId: tenant,
      workspaceId: workspace,
      requiredScope: 'write:topics',
      operation: 'topics.create',
    })).rejects.toMatchObject<Partial<DomainError>>({
      code: 'authorization.denied',
      message: 'Bearer JWT tenant or workspace does not match request scope',
    });

    expect(dependencies.workspaceAuthorization.authorize).not.toHaveBeenCalled();
    expect(dependencies.checkPublicApiRateLimit.execute).not.toHaveBeenCalled();
    expect(dependencies.auditEvents.at(-1)).toMatchObject({
      actorType: 'user',
      actorId: 'user-1',
      outcome: 'denied',
      reasonCode: 'authorization.denied',
    });
  });

  it('denies JWT users without durable workspace membership and audits the denial', async () => {
    const dependencies = createDependencies({ membership: null });
    const authorizer = createAuthorizer(dependencies);

    await expect(authorizer.authorize({
      authorizationHeader: 'Bearer jwt.header.signature',
      tenantId: tenant,
      workspaceId: workspace,
      requiredScope: 'write:topics',
      operation: 'topics.create',
    })).rejects.toMatchObject<Partial<DomainError>>({
      code: 'authorization.denied',
      message: 'Bearer JWT workspace membership is missing',
    });

    expect(dependencies.workspaceAuthorization.authorize).not.toHaveBeenCalled();
    expect(dependencies.checkPublicApiRateLimit.execute).not.toHaveBeenCalled();
    expect(dependencies.auditEvents.at(-1)).toMatchObject({
      actorType: 'user',
      actorId: 'user-1',
      outcome: 'denied',
      reasonCode: 'authorization.denied',
      metadata: {
        membershipSource: 'missing',
        claimedRoles: ['admin'],
      },
    });
  });

  it('uses durable membership roles instead of elevated JWT claims', async () => {
    const dependencies = createDependencies({
      membership: {
        tenantId: tenant,
        workspaceId: workspace,
        userId: userId('user-1'),
        roles: ['viewer'],
        source: 'durable',
      },
    });
    dependencies.workspaceAuthorization.authorize.mockReturnValue(err(
      new DomainError('authorization.denied', 'Workspace role is not allowed for this action'),
    ));
    const authorizer = createAuthorizer(dependencies);

    await expect(authorizer.authorize({
      authorizationHeader: 'Bearer jwt.header.signature',
      tenantId: tenant,
      workspaceId: workspace,
      requiredScope: 'write:topics',
      operation: 'topics.create',
    })).rejects.toMatchObject<Partial<DomainError>>({
      code: 'authorization.denied',
    });

    expect(dependencies.workspaceAuthorization.authorize).toHaveBeenCalledWith({
      tenantId: tenant,
      workspaceId: workspace,
      action: 'topics.create',
      roles: ['viewer'],
    });
    expect(dependencies.checkPublicApiRateLimit.execute).not.toHaveBeenCalled();
  });
});

type Dependencies = {
  readonly verifyApiKey: jest.Mocked<Pick<VerifyApiKeyUseCase, 'execute'>>;
  readonly checkPublicApiRateLimit: jest.Mocked<Pick<CheckPublicApiRateLimitUseCase, 'execute'>>;
  readonly recordPublicApiAuditEvent: jest.Mocked<Pick<RecordPublicApiAuditEventUseCase, 'execute'>>;
  readonly userAccessTokenVerifier: jest.Mocked<UserAccessTokenVerifierPort>;
  readonly userWorkspaceMembershipVerifier: jest.Mocked<UserWorkspaceMembershipVerifierPort>;
  readonly workspaceAuthorization: jest.Mocked<WorkspaceAuthorizationPolicyPort>;
  readonly auditEvents: RecordPublicApiAuditEventCommand[];
};

const createDependencies = (params: {
  readonly principal?: UserAccessTokenPrincipal;
  readonly membership?: UserWorkspaceMembership | null;
} = {}): Dependencies => {
  const principal = params.principal ?? {
    subject: userId('user-1'),
    tenantId: tenant,
    workspaceId: workspace,
    roles: ['admin'],
    issuer: 'https://auth.example.test',
    audience: ['social-monitor-api'],
  } satisfies UserAccessTokenPrincipal;
  const membership = params.membership === undefined
    ? {
        tenantId: principal.tenantId,
        workspaceId: principal.workspaceId,
        userId: principal.subject,
        roles: ['admin'],
        source: 'durable',
      } satisfies UserWorkspaceMembership
    : params.membership;
  const auditEvents: RecordPublicApiAuditEventCommand[] = [];

  return {
    verifyApiKey: {
      execute: jest.fn(async (command: VerifyApiKeyCommand) => {
        void command;
        return ok({
          apiKey: {
            id: 'api-key-1',
            tenantId: tenant,
            workspaceId: workspace,
            name: 'test key',
            keyPrefix: 'smk_test-sec',
            scopes: ['read:topics'] as readonly ApiKeyScope[],
            status: 'active' as const,
            createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          },
        });
      }),
    },
    checkPublicApiRateLimit: {
      execute: jest.fn(async (command: CheckPublicApiRateLimitCommand) => {
        void command;
        return ok({
          allowed: true as const,
          limit: 60,
          remaining: 59,
          resetAt: new Date('2026-01-01T00:01:00.000Z').toISOString(),
        });
      }),
    },
    recordPublicApiAuditEvent: {
      execute: jest.fn(async (command: RecordPublicApiAuditEventCommand) => {
        auditEvents.push(command);
        return ok({
          auditEventId: 'audit-event-1',
          occurredAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        });
      }),
    },
    userAccessTokenVerifier: {
      verify: jest.fn(async (token: string) => {
        void token;
        return principal;
      }),
    },
    userWorkspaceMembershipVerifier: {
      verify: jest.fn(async (
        params: Parameters<UserWorkspaceMembershipVerifierPort['verify']>[0],
      ) => {
        void params;
        return membership;
      }),
    },
    workspaceAuthorization: {
      authorize: jest.fn((request: WorkspaceAuthorizationRequest): Result<void, DomainError> => {
        void request;
        return ok(undefined);
      }),
    },
    auditEvents,
  };
};

const createAuthorizer = (dependencies: Dependencies): ApiKeyRequestAuthorizer =>
  new ApiKeyRequestAuthorizer(
    dependencies.verifyApiKey as unknown as VerifyApiKeyUseCase,
    dependencies.checkPublicApiRateLimit as unknown as CheckPublicApiRateLimitUseCase,
    dependencies.recordPublicApiAuditEvent as unknown as RecordPublicApiAuditEventUseCase,
    dependencies.userAccessTokenVerifier,
    dependencies.userWorkspaceMembershipVerifier,
    dependencies.workspaceAuthorization,
    60,
  );
