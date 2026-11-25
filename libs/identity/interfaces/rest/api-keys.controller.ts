import { Body, Controller, Delete, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parsePaginationLimit } from '@social-monitor/platform-request-context';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { CreateApiKeyUseCase } from '../../features/create-api-key/create-api-key.use-case';
import { ListApiKeysUseCase } from '../../features/list-api-keys/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '../../features/revoke-api-key/revoke-api-key.use-case';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type IdentityPublicApiAuditActorType,
  type IdentityPublicApiAuditMetadataValue,
  type IdentityPublicApiAuditOutcome,
  type PublicApiAuditWriterPort,
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
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
  type UserRequestAuthorization,
} from './api-key-request-authorizer';
import { IDENTITY_PUBLIC_API_AUDIT_WRITER } from './identity-provider-tokens';

@ApiTags('api-keys')
@Controller('identity/api-keys')
export class ApiKeysController {
  constructor(
    private readonly createApiKey: CreateApiKeyUseCase,
    private readonly listApiKeys: ListApiKeysUseCase,
    private readonly revokeApiKey: RevokeApiKeyUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(IDENTITY_PUBLIC_API_AUDIT_WRITER)
    private readonly publicApiAuditWriter: PublicApiAuditWriterPort,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create tenant/workspace API key and return the raw secret once.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'authorization', required: false, description: 'Bearer OIDC JWT for production API key management.' })
  @ApiHeader({ name: 'x-workspace-role', required: false, description: 'Local-dev fallback only. API key management requires owner or admin.' })
  async create(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: CreateApiKeyRequestDto,
  ): Promise<CreateApiKeyResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeApiKeyManagement(
      scope,
      workspaceRoleHeader,
      authorizationHeader,
      'api_keys.create',
    );
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
      actorType: authorization.actorType,
      actorId: authorization.actorId,
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
  @ApiHeader({ name: 'authorization', required: false, description: 'Bearer OIDC JWT for production API key management.' })
  @ApiHeader({ name: 'x-workspace-role', required: false, description: 'Local-dev fallback only. API key listing requires owner or admin.' })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListApiKeysResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeApiKeyManagement(
      scope,
      workspaceRoleHeader,
      authorizationHeader,
      'api_keys.list',
    );
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
      actorType: authorization.actorType,
      actorId: authorization.actorId,
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
  @ApiHeader({ name: 'authorization', required: false, description: 'Bearer OIDC JWT for production API key management.' })
  @ApiHeader({ name: 'x-workspace-role', required: false, description: 'Local-dev fallback only. API key revocation requires owner or admin.' })
  async revoke(
    @Param('apiKeyId') apiKeyId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<RevokeApiKeyResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeApiKeyManagement(
      scope,
      workspaceRoleHeader,
      authorizationHeader,
      'api_keys.revoke',
    );
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
      actorType: authorization.actorType,
      actorId: authorization.actorId,
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
    readonly actorType: IdentityPublicApiAuditActorType;
    readonly actorId: string;
    readonly action: string;
    readonly outcome: IdentityPublicApiAuditOutcome;
    readonly resourceId?: string;
    readonly metadata?: Readonly<
      Record<string, IdentityPublicApiAuditMetadataValue>
    >;
  }): Promise<void> {
    const result = await this.publicApiAuditWriter.record({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      actorType: params.actorType,
      actorId: params.actorId,
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

  private async authorizeApiKeyManagement(
    scope: { readonly tenantId: TenantId; readonly workspaceId: WorkspaceId },
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
    action: WorkspaceAction,
  ): Promise<UserRequestAuthorization | { readonly actorType: 'system'; readonly actorId: 'identity.api-keys' }> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      return this.apiKeyRequestAuthorizer.authorizeUser({
        authorizationHeader,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        operation: action,
      });
    }

    const result = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action,
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!result.ok) {
      throw result.error;
    }

    return {
      actorType: 'system',
      actorId: 'identity.api-keys',
    };
  }
}
