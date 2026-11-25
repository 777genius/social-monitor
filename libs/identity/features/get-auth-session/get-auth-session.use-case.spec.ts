import { DomainError, tenantId, userId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  UserAccessTokenPrincipal,
  UserAccessTokenVerifierPort,
  UserWorkspaceMembership,
  UserWorkspaceMembershipVerifierPort,
  VerifyUserWorkspaceMembershipParams,
} from '../../ports';
import { GetAuthSessionUseCase } from './get-auth-session.use-case';

const tenant = tenantId('tenant-1');
const workspace = workspaceId('workspace-1');
const subject = userId('user-1');

describe('GetAuthSessionUseCase', () => {
  it('restores the current user session from a verified JWT and workspace membership', async () => {
    const dependencies = createDependencies();

    const result = await createUseCase(dependencies).execute({
      accessToken: 'jwt.header.signature',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        userId: subject,
        userLabel: subject,
        userRole: 'admin',
        selectedWorkspace: {
          tenantId: tenant,
          workspaceId: workspace,
          tenantName: tenant,
          workspaceName: workspace,
          workspaceRole: 'admin',
          statusLabel: 'Active',
        },
        workspaces: [
          {
            tenantId: tenant,
            workspaceId: workspace,
            tenantName: tenant,
            workspaceName: workspace,
            workspaceRole: 'admin',
            statusLabel: 'Active',
          },
        ],
      },
    });
    expect(dependencies.userAccessTokenVerifier.verify).toHaveBeenCalledWith('jwt.header.signature');
    expect(dependencies.userWorkspaceMembershipVerifier.verify).toHaveBeenCalledWith({
      tenantId: tenant,
      workspaceId: workspace,
      userId: subject,
      tokenRoles: ['admin'],
    });
  });

  it('downgrades the session user role from durable membership even when JWT claims admin', async () => {
    const dependencies = createDependencies({
      membership: {
        tenantId: tenant,
        workspaceId: workspace,
        userId: subject,
        roles: ['viewer'],
        source: 'durable',
      },
    });

    const result = await createUseCase(dependencies).execute({
      accessToken: 'jwt.header.signature',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        userRole: 'user',
        selectedWorkspace: {
          workspaceRole: 'viewer',
        },
      },
    });
  });

  it('maps owner workspace membership to the admin session user role', async () => {
    const dependencies = createDependencies({
      membership: {
        tenantId: tenant,
        workspaceId: workspace,
        userId: subject,
        roles: ['owner'],
        source: 'durable',
      },
    });

    const result = await createUseCase(dependencies).execute({
      accessToken: 'jwt.header.signature',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        userRole: 'admin',
        selectedWorkspace: {
          workspaceRole: 'owner',
        },
      },
    });
  });

  it('restores admin role from durable membership when JWT has no role claims', async () => {
    const dependencies = createDependencies({
      principal: {
        subject,
        tenantId: tenant,
        workspaceId: workspace,
        roles: [],
        issuer: 'https://auth.example.test',
        audience: ['social-monitor-api'],
      },
    });

    const result = await createUseCase(dependencies).execute({
      accessToken: 'jwt.header.signature',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        userRole: 'admin',
        selectedWorkspace: {
          workspaceRole: 'admin',
        },
      },
    });
    expect(dependencies.userWorkspaceMembershipVerifier.verify).toHaveBeenCalledWith({
      tenantId: tenant,
      workspaceId: workspace,
      userId: subject,
      tokenRoles: [],
    });
  });

  it('rejects API key bearer tokens because session discovery is user-only', async () => {
    const dependencies = createDependencies();

    await expect(createUseCase(dependencies).execute({
      accessToken: 'smk_test-secret',
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'authorization.denied',
        message: 'Bearer JWT user session is required',
      },
    });
    expect(dependencies.userAccessTokenVerifier.verify).not.toHaveBeenCalled();
  });

  it('rejects JWTs without verified workspace membership', async () => {
    const dependencies = createDependencies({ membership: null });

    await expect(createUseCase(dependencies).execute({
      accessToken: 'jwt.header.signature',
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'authorization.denied',
        message: 'Bearer JWT workspace membership is missing',
      },
    });
  });

  it('returns verifier authorization errors as use-case failures', async () => {
    const dependencies = createDependencies();
    dependencies.userAccessTokenVerifier.verify.mockRejectedValue(
      new DomainError('authorization.denied', 'Bearer JWT is expired'),
    );

    await expect(createUseCase(dependencies).execute({
      accessToken: 'jwt.header.signature',
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'authorization.denied',
        message: 'Bearer JWT is expired',
      },
    });
  });
});

type Dependencies = {
  readonly userAccessTokenVerifier: jest.Mocked<UserAccessTokenVerifierPort>;
  readonly userWorkspaceMembershipVerifier: jest.Mocked<UserWorkspaceMembershipVerifierPort>;
};

const createDependencies = (params: {
  readonly principal?: UserAccessTokenPrincipal;
  readonly membership?: UserWorkspaceMembership | null;
} = {}): Dependencies => {
  const principal = params.principal ?? {
    subject,
    tenantId: tenant,
    workspaceId: workspace,
    roles: ['admin'],
    issuer: 'https://auth.example.test',
    audience: ['social-monitor-api'],
  } satisfies UserAccessTokenPrincipal;
  const membership = params.membership === undefined
    ? {
        tenantId: tenant,
        workspaceId: workspace,
        userId: subject,
        roles: ['admin'],
        source: 'durable',
      } satisfies UserWorkspaceMembership
    : params.membership;

  return {
    userAccessTokenVerifier: {
      verify: jest.fn(async (token: string) => {
        void token;
        return principal;
      }),
    },
    userWorkspaceMembershipVerifier: {
      verify: jest.fn(async (params: VerifyUserWorkspaceMembershipParams) => {
        void params;
        return membership;
      }),
    },
  };
};

const createUseCase = (dependencies: Dependencies): GetAuthSessionUseCase =>
  new GetAuthSessionUseCase(
    dependencies.userAccessTokenVerifier,
    dependencies.userWorkspaceMembershipVerifier,
  );
