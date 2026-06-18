import { Body, Controller, Delete, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parsePaginationLimit } from '@social-monitor/platform-request-context';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import type { PublicApiAuditMetadataValue, PublicApiAuditOutcome } from '@social-monitor/usage/ports';

import { CreateApiKeyUseCase } from '../../features/create-api-key/create-api-key.use-case';
import { ListApiKeysUseCase } from '../../features/list-api-keys/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '../../features/revoke-api-key/revoke-api-key.use-case';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAction,
  type WorkspaceAuthorizationPolicyPort,
} from '../../ports';
import { WorkspaceRoleHeaderParser } from '../authorization/workspace-role-header.parser';
import {
  CreateApiKeyRequestDto,
  type CreateApiKeyResponseDto,
  type ListApiKeysResponseDto,
  type RevokeApiKeyResponseDto,
} from './api-keys.dto';

@ApiTags('api-keys')
@Controller('identity/api-keys')
export class ApiKeysController {
  constructor(
    private readonly createApiKey: CreateApiKeyUseCase,
    private readonly listApiKeys: ListApiKeysUseCase,
    private readonly revokeApiKey: RevokeApiKeyUseCase,
    private readonly recordPublicApiAuditEvent: RecordPublicApiAuditEventUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create tenant/workspace API key and return the raw secret once.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'x-workspace-role', required: true, description: 'Comma-separated workspace roles. API key management requires owner or admin.' })
  async create(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Body() body: CreateApiKeyRequestDto,
  ): Promise<CreateApiKeyResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    this.ensureWorkspaceRole(scope, workspaceRoleHeader, 'api_keys.create');
    const result = await this.createApiKey.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      name: body.name,
      scopes: body.scopes,
    });

    if (!result.ok) {
      throw result.error;
    }

    await this.recordApiKeyAuditEvent({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'api_key.created',
      outcome: 'succeeded',
      resourceId: result.value.apiKey.id,
      metadata: {
        keyPrefix: result.value.apiKey.keyPrefix,
        scopes: result.value.apiKey.scopes,
        status: result.value.apiKey.status,
      },
    });

    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List tenant/workspace API keys without exposing raw secrets or hashes.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'x-workspace-role', required: true, description: 'Comma-separated workspace roles. API key listing requires owner or admin.' })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListApiKeysResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    this.ensureWorkspaceRole(scope, workspaceRoleHeader, 'api_keys.list');
    const result = await this.listApiKeys.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 50,
        invalidMessage: 'API key list limit must be between 1 and 100',
      }),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    await this.recordApiKeyAuditEvent({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'api_key.listed',
      outcome: 'succeeded',
      metadata: {
        resultCount: result.value.apiKeys.length,
        hasNextPage: result.value.nextCursor !== undefined,
      },
    });

    return result.value;
  }

  @Delete(':apiKeyId')
  @ApiOperation({ summary: 'Revoke a tenant/workspace API key.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'x-workspace-role', required: true, description: 'Comma-separated workspace roles. API key revocation requires owner or admin.' })
  async revoke(
    @Param('apiKeyId') apiKeyId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
  ): Promise<RevokeApiKeyResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    this.ensureWorkspaceRole(scope, workspaceRoleHeader, 'api_keys.revoke');
    const result = await this.revokeApiKey.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      apiKeyId,
    });

    if (!result.ok) {
      throw result.error;
    }

    await this.recordApiKeyAuditEvent({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'api_key.revoked',
      outcome: 'succeeded',
      resourceId: result.value.id,
      metadata: {
        keyPrefix: result.value.keyPrefix,
        status: result.value.status,
      },
    });

    return result.value;
  }

  private async recordApiKeyAuditEvent(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly action: string;
    readonly outcome: PublicApiAuditOutcome;
    readonly resourceId?: string;
    readonly metadata?: Readonly<Record<string, PublicApiAuditMetadataValue>>;
  }): Promise<void> {
    const result = await this.recordPublicApiAuditEvent.execute({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      actorType: 'system',
      actorId: 'identity.api-keys',
      action: params.action,
      outcome: params.outcome,
      resourceType: 'api_key',
      resourceId: params.resourceId,
      metadata: params.metadata,
    });

    if (!result.ok) {
      throw result.error;
    }
  }

  private ensureWorkspaceRole(
    scope: { readonly tenantId: TenantId; readonly workspaceId: WorkspaceId },
    workspaceRoleHeader: string | undefined,
    action: WorkspaceAction,
  ): void {
    const result = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action,
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!result.ok) {
      throw result.error;
    }
  }
}
