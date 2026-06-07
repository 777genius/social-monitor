import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import type { PublicApiAuditMetadataValue } from '@social-monitor/usage/ports';

import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';
import { BindSourceRequestDto, normalizeSourceBindingConfig, type BindSourceResponseDto } from './bind-source.dto';

@ApiTags('source-bindings')
@Controller('topics/:topicId/source-bindings')
export class SourceBindingController {
  constructor(
    private readonly bindSource: BindSourceUseCase,
    private readonly recordPublicApiAuditEvent: RecordPublicApiAuditEventUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Bind a production-safe source provider to a topic.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  async create(
    @Param('topicId') topicId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: BindSourceRequestDto,
  ): Promise<BindSourceResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });

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
