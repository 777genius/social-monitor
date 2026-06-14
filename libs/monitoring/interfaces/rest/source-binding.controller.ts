import { Body, Controller, Headers, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import type { PublicApiAuditMetadataValue } from '@social-monitor/usage/ports';

import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';
import { ChangeSourceBindingStatusUseCase } from '../../features/change-source-binding-status/change-source-binding-status.use-case';
import { BindSourceRequestDto, normalizeSourceBindingConfig, type BindSourceResponseDto } from './bind-source.dto';
import {
  ChangeSourceBindingStatusRequestDto,
  type ChangeSourceBindingStatusResponseDto,
} from './source-binding-status.dto';

@ApiTags('source-bindings')
@Controller('topics/:topicId/source-bindings')
export class SourceBindingController {
  constructor(
    private readonly bindSource: BindSourceUseCase,
    private readonly changeSourceBindingStatus: ChangeSourceBindingStatusUseCase,
    private readonly recordPublicApiAuditEvent: RecordPublicApiAuditEventUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Bind a production-safe source provider to a topic.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'x-workspace-role', required: true, description: 'Comma-separated workspace roles. Source binding creation requires owner or admin.' })
  @ApiHeader({ name: 'idempotency-key', required: true })
  async create(
    @Param('topicId') topicId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: BindSourceRequestDto,
  ): Promise<BindSourceResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'source_bindings.create',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    const result = await this.bindSource.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      topicId,
      providerKey: body.providerKey,
      config: normalizeSourceBindingConfig(body.config),
      idempotencyKey,
      correlationId: requestId ?? crypto.randomUUID(),
    });

    if (!result.ok) {
      throw result.error;
    }

    if (result.value.created) {
      await this.recordSourceBindingAuditEvent({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        action: 'source_binding.created',
        resourceId: result.value.sourceBindingId,
        metadata: {
          providerKey: body.providerKey,
          topicId,
          created: result.value.created,
        },
      });
    }

    return result.value;
  }

  @Patch(':sourceBindingId/status')
  @ApiOperation({ summary: 'Pause or resume a source binding.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'x-workspace-role', required: true, description: 'Comma-separated workspace roles. Source binding status updates require owner or admin.' })
  @ApiHeader({ name: 'idempotency-key', required: true })
  async updateStatus(
    @Param('topicId') topicId: string,
    @Param('sourceBindingId') sourceBindingId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: ChangeSourceBindingStatusRequestDto,
  ): Promise<ChangeSourceBindingStatusResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'source_bindings.update_status',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    const result = await this.changeSourceBindingStatus.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      topicId,
      sourceBindingId,
      status: body.status,
      idempotencyKey,
      correlationId: requestId ?? crypto.randomUUID(),
    });

    if (!result.ok) {
      throw result.error;
    }

    if (result.value.changed) {
      await this.recordSourceBindingAuditEvent({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        action: 'source_binding.status_changed',
        resourceId: result.value.sourceBindingId,
        metadata: {
          topicId,
          status: result.value.status,
        },
      });
    }

    return result.value;
  }

  private async recordSourceBindingAuditEvent(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly action: string;
    readonly resourceId: string;
    readonly metadata?: Readonly<Record<string, PublicApiAuditMetadataValue>>;
  }): Promise<void> {
    const result = await this.recordPublicApiAuditEvent.execute({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      actorType: 'system',
      actorId: 'monitoring.source-bindings',
      action: params.action,
      outcome: 'succeeded',
      resourceType: 'source_binding',
      resourceId: params.resourceId,
      metadata: params.metadata,
    });

    if (!result.ok) {
      throw result.error;
    }
  }
}
