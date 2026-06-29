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
      action: 'interests.create',
      roles: ['owner'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows every workspace role to read monitoring topics', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'interests.read',
      roles: ['viewer'],
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

  it('allows members to retry delivery attempts but blocks viewers', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'delivery_attempts.retry',
      roles: ['member'],
    })).toEqual({
      ok: true,
      value: undefined,
    });

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'delivery_attempts.retry',
      roles: ['viewer'],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'authorization.denied',
      }),
    });
  });

  it('allows every workspace role to read digests', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'digests.read',
      roles: ['viewer'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows every workspace role to read realtime events', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'realtime_events.read',
      roles: ['viewer'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows owner and admin roles to read public API audit events', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'public_api_audit.read',
      roles: ['admin'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('denies viewer role from reading public API audit events', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'public_api_audit.read',
      roles: ['viewer'],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'authorization.denied',
      }),
    });
  });

  it('allows viewers to read notification preferences but not write them', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'notification_preferences.read',
      roles: ['viewer'],
    })).toEqual({
      ok: true,
      value: undefined,
    });

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'notification_preferences.write',
      roles: ['viewer'],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'authorization.denied',
      }),
    });

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'notification_preferences.write',
      roles: ['member'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows only owner and admin roles to inspect scan dead letters', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'scan_dead_letters.read',
      roles: ['admin'],
    })).toEqual({
      ok: true,
      value: undefined,
    });

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'scan_dead_letters.read',
      roles: ['viewer'],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'authorization.denied',
      }),
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

  it('allows every workspace role to read source bindings', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'source_bindings.read',
      roles: ['viewer'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows only owner and admin roles to pause or resume source bindings', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'source_bindings.update_status',
      roles: ['owner'],
    })).toEqual({
      ok: true,
      value: undefined,
    });

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'source_bindings.update_status',
      roles: ['member'],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'authorization.denied',
      }),
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

  it('allows every workspace role to read scan policies', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'scan_policies.read',
      roles: ['viewer'],
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

  it('allows every workspace role to record summary feedback', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'summary_feedback.create',
      roles: ['viewer'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows every workspace role to read summary feedback', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'summary_feedback.read',
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

  it('allows every workspace role to read summary policies', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'summary_policies.read',
      roles: ['viewer'],
    })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('allows only owner and admin roles to set summary policies', () => {
    const policy = new StaticWorkspaceAuthorizationPolicy();

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'summary_policies.set',
      roles: ['admin'],
    })).toEqual({
      ok: true,
      value: undefined,
    });

    expect(policy.authorize({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      action: 'summary_policies.set',
      roles: ['member'],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'authorization.denied' }),
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
    expect(parseWorkspaceRolesHeader(' Admin, viewer ,,OWNER ', {
      NODE_ENV: 'test',
    })).toEqual(['admin', 'viewer', 'owner']);
  });

  it('trusts workspace role headers only in dev and test profiles', () => {
    expect(parseWorkspaceRolesHeader('admin', {
      NODE_ENV: 'test',
    })).toEqual(['admin']);

    expect(parseWorkspaceRolesHeader('admin', {
      NODE_ENV: 'development',
      SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
    })).toEqual([]);

    expect(parseWorkspaceRolesHeader('admin', {
      NODE_ENV: 'production',
      TRUSTED_WORKSPACE_ROLE_HEADER: 'enabled',
    })).toEqual([]);
  });
});
