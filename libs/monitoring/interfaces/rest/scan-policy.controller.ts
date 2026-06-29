import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import {
  RequestCorrelationIdFactory,
  requireIdempotencyKeyHeader,
} from '@social-monitor/platform-request-context';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import type { PublicApiAuditMetadataValue } from '@social-monitor/usage/ports';

import { GetScanPolicyUseCase } from '../../features/get-scan-policy/get-scan-policy.use-case';
import { SetScanPolicyUseCase } from '../../features/set-scan-policy/set-scan-policy.use-case';
import { GetScanPolicyResponseDto } from './get-scan-policy.dto';
import { SetScanPolicyRequestDto, SetScanPolicyResponseDto } from './set-scan-policy.dto';

@ApiTags('scan-policies')
@Controller('source-bindings/:sourceBindingId/scan-policy')
export class ScanPolicyController {
  constructor(
    private readonly setScanPolicy: SetScanPolicyUseCase,
    private readonly getScanPolicy: GetScanPolicyUseCase,
    private readonly recordPublicApiAuditEvent: RecordPublicApiAuditEventUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
    private readonly requestCorrelationIds: RequestCorrelationIdFactory,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Set scan policy for a source binding.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:source_bindings',
    workspaceRoleDescription: 'Comma-separated workspace roles. Scan policy changes require owner or admin.',
  })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiCreatedResponse({ type: SetScanPolicyResponseDto })
  async create(
    @Param('sourceBindingId') sourceBindingId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: SetScanPolicyRequestDto,
  ): Promise<SetScanPolicyResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeScanPolicyWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.setScanPolicy.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sourceBindingId,
      intervalSeconds: body.intervalSeconds,
      freshnessSeconds: body.freshnessSeconds,
      retryBudget: body.retryBudget,
      idempotencyKey: requireIdempotencyKeyHeader(idempotencyKey),
      correlationId: this.requestCorrelationIds.fromRequestId(requestId),
    });

    if (!result.ok) {
      throw result.error;
    }

    if (result.value.created || result.value.updated) {
      await this.recordScanPolicyAuditEvent({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        resourceId: result.value.scanPolicyId,
        action: result.value.created ? 'scan_policy.created' : 'scan_policy.updated',
        metadata: {
          sourceBindingId,
          intervalSeconds: body.intervalSeconds,
          freshnessSeconds: body.freshnessSeconds,
          retryBudget: body.retryBudget,
          created: result.value.created,
          updated: result.value.updated,
        },
      });
    }

    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'Get scan policy for a source binding.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:interests',
    workspaceRoleDescription: 'Comma-separated workspace roles. Scan policy reads allow owner, admin, member or viewer.',
  })
  @ApiOkResponse({ type: GetScanPolicyResponseDto })
  async get(
    @Param('sourceBindingId') sourceBindingId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<GetScanPolicyResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeScanPolicyRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.getScanPolicy.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sourceBindingId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  private async recordScanPolicyAuditEvent(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly resourceId: string;
    readonly action: string;
    readonly metadata?: Readonly<Record<string, PublicApiAuditMetadataValue>>;
  }): Promise<void> {
    const result = await this.recordPublicApiAuditEvent.execute({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      actorType: 'system',
      actorId: 'monitoring.scan-policies',
      action: params.action,
      outcome: 'succeeded',
      resourceType: 'scan_policy',
      resourceId: params.resourceId,
      metadata: params.metadata,
    });

    if (!result.ok) {
      throw result.error;
    }
  }

  private async authorizeScanPolicyWrite(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
  ): Promise<void> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: 'write:source_bindings',
        operation: 'scan_policies.set',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'scan_policies.set',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }

  private async authorizeScanPolicyRead(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
  ): Promise<void> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: 'read:interests',
        operation: 'scan_policies.read',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'scan_policies.read',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
