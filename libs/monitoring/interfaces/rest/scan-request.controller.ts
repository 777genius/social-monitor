import { Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { buildRequestContext } from '@social-monitor/platform-request-context';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import type { PublicApiAuditMetadataValue } from '@social-monitor/usage/ports';

import { RequestScanUseCase } from '../../features/request-scan/request-scan.use-case';
import type { RequestScanResponseDto } from './request-scan.dto';

@ApiTags('scan-requests')
@Controller('source-bindings/:sourceBindingId/scan-requests')
export class ScanRequestController {
  constructor(
    private readonly requestScan: RequestScanUseCase,
    private readonly recordPublicApiAuditEvent: RecordPublicApiAuditEventUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Request a scan for a source binding.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiHeader({ name: 'idempotency-key', required: true })
  async create(
    @Param('sourceBindingId') sourceBindingId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Headers('x-correlation-id') correlationHeader: string | undefined,
  ): Promise<RequestScanResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const requestContext = buildRequestContext({
      requestId,
      correlationId: correlationHeader,
    });

    const result = await this.requestScan.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sourceBindingId,
      idempotencyKey,
      correlationId: requestContext.correlationId,
    });

    if (!result.ok) {
      throw result.error;
    }

    if (result.value.created) {
      await this.recordScanRequestAuditEvent({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        resourceId: result.value.scanJobId,
        metadata: {
          sourceBindingId,
          status: result.value.status,
          created: result.value.created,
        },
      });
    }

    return result.value;
  }

  private async recordScanRequestAuditEvent(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly resourceId: string;
    readonly metadata?: Readonly<Record<string, PublicApiAuditMetadataValue>>;
  }): Promise<void> {
    const result = await this.recordPublicApiAuditEvent.execute({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      actorType: 'system',
      actorId: 'monitoring.scan-requests',
      action: 'scan_request.created',
      outcome: 'succeeded',
      resourceType: 'scan_job',
      resourceId: params.resourceId,
      metadata: params.metadata,
    });

    if (!result.ok) {
      throw result.error;
    }
  }
}
