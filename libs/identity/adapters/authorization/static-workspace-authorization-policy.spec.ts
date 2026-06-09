import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { parseWorkspaceRolesHeader } from '../../ports';

import { StaticWorkspaceAuthorizationPolicy } from './static-workspace-authorization-policy';

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

  it('allows owner and admin roles to create monitoring topics', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'topics.create',
      roles: ['owner'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows every workspace role to read feed items', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'feed.read',
      roles: ['viewer'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows every workspace role to read delivery attempts', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'delivery_attempts.read',
      roles: ['viewer'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows owner and admin roles to create source bindings', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'source_bindings.create',
      roles: ['admin'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows owner and admin roles to set scan policies', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'scan_policies.set',
      roles: ['admin'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows every workspace role to read scan job status', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'scan_jobs.read',
      roles: ['viewer'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows owner, admin and member roles to request scans', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'scan_requests.create',
      roles: ['member'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows owner, admin and member roles to request summaries', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'summary_requests.create',
      roles: ['member'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows every workspace role to read summaries', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'summaries.read',
      roles: ['viewer'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows every workspace role to read summary job status', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'summary_jobs.read',
      roles: ['viewer'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows owner, admin and member roles to regenerate summaries', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'summary_regenerations.create',
      roles: ['member'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows owner and admin roles to manage webhook endpoints', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'webhook_endpoints.create',
      roles: ['admin'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'webhook_endpoints.disable',
      roles: ['owner'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows every workspace role to read webhook endpoints', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'webhook_endpoints.read',
      roles: ['viewer'],
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
