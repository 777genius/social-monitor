import type { ApiKeyRequestAuthorizer } from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import type { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import type { WorkspaceAuthorizationPolicyPort } from '@social-monitor/identity/ports';
import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';

import { SourceBindingAccessService } from './source-binding-access.service';

const tenantId = 'tenant-test' as TenantId;
const workspaceId = 'workspace-test' as WorkspaceId;

const createHarness = () => {
  const authorizeToken = jest.fn().mockResolvedValue(undefined);
  const authorizeWorkspace = jest.fn().mockReturnValue({ ok: true, value: undefined });
  const parseRoles = jest.fn().mockReturnValue(['admin']);
  const recordAudit = jest.fn().mockResolvedValue({ ok: true, value: undefined });

  const service = new SourceBindingAccessService(
    { execute: recordAudit } as unknown as RecordPublicApiAuditEventUseCase,
    { authorize: authorizeToken } as unknown as ApiKeyRequestAuthorizer,
    { authorize: authorizeWorkspace } as unknown as WorkspaceAuthorizationPolicyPort,
    { parse: parseRoles } as unknown as WorkspaceRoleHeaderParser,
  );

  return { service, authorizeToken, authorizeWorkspace, parseRoles, recordAudit };
};

describe('SourceBindingAccessService', () => {
  it('enforces the read scope for bearer callers without trusting role headers', async () => {
    const h = createHarness();
    await h.service.authorizeSourceBindingRead(tenantId, workspaceId, 'owner', 'Bearer JWT');
    expect(h.authorizeToken).toHaveBeenCalledWith({
      authorizationHeader: 'Bearer JWT',
      tenantId,
      workspaceId,
      requiredScope: 'read:interests',
      operation: 'source_bindings.read',
    });
    expect(h.authorizeWorkspace).not.toHaveBeenCalled();
    expect(h.parseRoles).not.toHaveBeenCalled();
  });

  it('enforces a workspace-policy action on non-bearer writes', async () => {
    const h = createHarness();
    await h.service.authorizeSourceBindingWrite(
      tenantId, workspaceId, 'owner,admin', undefined, 'source_bindings.update_status',
    );
    expect(h.authorizeToken).not.toHaveBeenCalled();
    expect(h.parseRoles).toHaveBeenCalledWith('owner,admin');
    expect(h.authorizeWorkspace).toHaveBeenCalledWith({
      tenantId,
      workspaceId,
      action: 'source_bindings.update_status',
      roles: ['admin'],
    });
  });

  it('denies writes when workspace policy rejects the caller', async () => {
    const h = createHarness();
    const error = new Error('authorization denied');
    h.authorizeWorkspace.mockReturnValue({ ok: false, error });
    await expect(h.service.authorizeSourceBindingWrite(
      tenantId, workspaceId, undefined, undefined, 'source_bindings.create',
    )).rejects.toBe(error);
  });

  it('keeps audit failures observable and records only attributed metadata', async () => {
    const h = createHarness();
    await h.service.recordSourceBindingAuditEvent({
      tenantId,
      workspaceId,
      action: 'source_binding.created',
      resourceId: 'binding-test',
      metadata: { created: true },
    });
    expect(h.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      workspaceId,
      actorType: 'system',
      actorId: 'monitoring.source-bindings',
      outcome: 'succeeded',
      resourceType: 'source_binding',
      resourceId: 'binding-test',
      metadata: { created: true },
    }));

    const error = new Error('audit failed');
    h.recordAudit.mockResolvedValue({ ok: false, error });
    await expect(h.service.recordSourceBindingAuditEvent({
      tenantId, workspaceId, action: 'source_binding.status_changed', resourceId: 'binding-test',
    })).rejects.toBe(error);
  });
});
