import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { parsePaginationLimit, RequestCorrelationIdFactory } from '@social-monitor/platform-request-context';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import type { PublicApiAuditMetadataValue } from '@social-monitor/usage/ports';

import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';
import { ChangeSourceBindingStatusUseCase } from '../../features/change-source-binding-status/change-source-binding-status.use-case';
import { GetSourceBindingHealthUseCase } from '../../features/get-source-binding-health/get-source-binding-health.use-case';
import { ListSourceBindingOverviewUseCase } from '../../features/list-source-binding-overview/list-source-binding-overview.use-case';
import { ListSourceBindingsUseCase } from '../../features/list-source-bindings/list-source-bindings.use-case';
import { BindSourceRequestDto, BindSourceResponseDto, normalizeSourceBindingConfig } from './bind-source.dto';
import { ListSourceBindingsResponseDto } from './list-source-bindings.dto';
import { ListSourceBindingOverviewResponseDto } from './source-binding-overview.dto';
import {
  ChangeSourceBindingStatusRequestDto,
  ChangeSourceBindingStatusResponseDto,
} from './source-binding-status.dto';
import { SourceBindingHealthResponseDto } from './source-binding-health.dto';

@ApiTags('source-bindings')
@Controller('topics/:topicId/source-bindings')
export class SourceBindingController {
  constructor(
    private readonly bindSource: BindSourceUseCase,
    private readonly changeSourceBindingStatus: ChangeSourceBindingStatusUseCase,
    private readonly listSourceBindings: ListSourceBindingsUseCase,
    private readonly listSourceBindingOverview: ListSourceBindingOverviewUseCase,
    private readonly getSourceBindingHealth: GetSourceBindingHealthUseCase,
    private readonly recordPublicApiAuditEvent: RecordPublicApiAuditEventUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
    private readonly requestCorrelationIds: RequestCorrelationIdFactory,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Bind a production-safe source provider to a topic.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:source_bindings',
    workspaceRoleDescription: 'Comma-separated workspace roles. Source binding creation requires owner or admin.',
  })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiCreatedResponse({ type: BindSourceResponseDto })
  async create(
    @Param('topicId') topicId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: BindSourceRequestDto,
  ): Promise<BindSourceResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSourceBindingWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      'source_bindings.create',
    );

    const result = await this.bindSource.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      topicId,
      providerKey: body.providerKey,
      config: normalizeSourceBindingConfig(body.config),
      idempotencyKey,
      correlationId: this.requestCorrelationIds.fromRequestId(requestId),
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

  @Get()
  @ApiOperation({ summary: 'List source bindings for a topic.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:topics',
    workspaceRoleDescription: 'Comma-separated workspace roles. Source binding reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ type: ListSourceBindingsResponseDto })
  async list(
    @Param('topicId') topicId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListSourceBindingsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSourceBindingRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.listSourceBindings.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      topicId,
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 50,
        invalidMessage: 'Source binding list limit must be between 1 and 100',
      }),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get('overview')
  @ApiOperation({ summary: 'List source bindings with operational health for a topic.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:topics',
    workspaceRoleDescription: 'Comma-separated workspace roles. Source binding overview reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ type: ListSourceBindingOverviewResponseDto })
  async overview(
    @Param('topicId') topicId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListSourceBindingOverviewResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSourceBindingRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.listSourceBindingOverview.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      topicId,
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 50,
        invalidMessage: 'Source binding overview limit must be between 1 and 100',
      }),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get(':sourceBindingId/health')
  @ApiOperation({ summary: 'Get source binding operational health.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:topics',
    workspaceRoleDescription: 'Comma-separated workspace roles. Source binding health reads allow owner, admin, member or viewer.',
  })
  @ApiOkResponse({ type: SourceBindingHealthResponseDto })
  async health(
    @Param('topicId') topicId: string,
    @Param('sourceBindingId') sourceBindingId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<SourceBindingHealthResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSourceBindingRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.getSourceBindingHealth.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      topicId,
      sourceBindingId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  private async authorizeSourceBindingRead(
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
        requiredScope: 'read:topics',
        operation: 'source_bindings.read',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'source_bindings.read',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }

  @Patch(':sourceBindingId/status')
  @ApiOperation({ summary: 'Pause or resume a source binding.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:source_bindings',
    workspaceRoleDescription: 'Comma-separated workspace roles. Source binding status updates require owner or admin.',
  })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkResponse({ type: ChangeSourceBindingStatusResponseDto })
  async updateStatus(
    @Param('topicId') topicId: string,
    @Param('sourceBindingId') sourceBindingId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: ChangeSourceBindingStatusRequestDto,
  ): Promise<ChangeSourceBindingStatusResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSourceBindingWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      'source_bindings.update_status',
    );

    const result = await this.changeSourceBindingStatus.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      topicId,
      sourceBindingId,
      status: body.status,
      idempotencyKey,
      correlationId: this.requestCorrelationIds.fromRequestId(requestId),
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

  private async authorizeSourceBindingWrite(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
    operation: 'source_bindings.create' | 'source_bindings.update_status',
  ): Promise<void> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: 'write:source_bindings',
        operation,
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: operation,
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
