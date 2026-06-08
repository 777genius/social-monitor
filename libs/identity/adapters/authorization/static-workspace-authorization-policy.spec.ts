import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { parseWorkspaceRolesHeader, StaticWorkspaceAuthorizationPolicy } from './static-workspace-authorization-policy';

describe('StaticWorkspaceAuthorizationPolicy', () => {
  it('allows owner and admin roles to manage API keys', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'api_keys.create',
      roles: ['viewer', 'admin'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('denies missing or low-privilege roles with a safe authorization error', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'api_keys.revoke',
      roles: ['member'],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'authorization.denied',
        details: {
          action: 'api_keys.revoke',
          requiredRoles: ['owner', 'admin'],
        },
      }),
    });
    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'api_keys.list',
      roles: [],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'authorization.denied',
        details: {
          action: 'api_keys.list',
        },
      }),
    });
  });
});

describe('parseWorkspaceRolesHeader', () => {
  it('normalizes comma-separated role headers', () => {
    expect(parseWorkspaceRolesHeader(' Admin, viewer ,,OWNER ')).toEqual(['admin', 'viewer', 'owner']);
  });
});
