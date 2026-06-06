import { DomainError } from './domain-error';
import { requireTenantScope } from './tenant-scope';

describe('requireTenantScope', () => {
  it('normalizes tenant and workspace headers', () => {
    expect(requireTenantScope({
      tenantIdHeader: ' tenant-1 ',
      workspaceIdHeader: ' workspace-1 ',
    })).toEqual({
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
    });
  });

  it('returns tenant.scope_missing for missing tenant header', () => {
    expect(() => requireTenantScope({
      tenantIdHeader: undefined,
      workspaceIdHeader: 'workspace-1',
    })).toThrow(new DomainError('tenant.scope_missing', 'x-tenant-id header is required'));
  });

  it('returns tenant.scope_missing for missing workspace header', () => {
    expect(() => requireTenantScope({
      tenantIdHeader: 'tenant-1',
      workspaceIdHeader: ' ',
    })).toThrow(new DomainError('tenant.scope_missing', 'x-workspace-id header is required'));
  });
});
