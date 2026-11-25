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
import { parsePaginationLimit } from '@social-monitor/platform-request-context';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import type { PublicApiAuditMetadataValue } from '@social-monitor/usage/ports';

import { CreateSourceCredentialUseCase } from '../../features/create-source-credential/create-source-credential.use-case';
import { ListSourceCredentialsUseCase } from '../../features/list-source-credentials/list-source-credentials.use-case';
import { RevokeSourceCredentialUseCase } from '../../features/revoke-source-credential/revoke-source-credential.use-case';
import { RotateSourceCredentialUseCase } from '../../features/rotate-source-credential/rotate-source-credential.use-case';
import {
  CreateSourceCredentialRequestDto,
  ListSourceCredentialsResponseDto,
  normalizeSourceCredentialScopes,
  normalizeSourceCredentialSecret,
  parseSourceCredentialExpiresAt,
  RotateSourceCredentialRequestDto,
  SourceCredentialResponseDto,
} from './source-credential.dto';

@ApiTags('source-credentials')
@Controller('source-credentials')
export class SourceCredentialController {
  constructor(
    private readonly createSourceCredential: CreateSourceCredentialUseCase,
    private readonly rotateSourceCredential: RotateSourceCredentialUseCase,
    private readonly revokeSourceCredential: RevokeSourceCredentialUseCase,
    private readonly listSourceCredentials: ListSourceCredentialsUseCase,
    private readonly recordPublicApiAuditEvent: RecordPublicApiAuditEventUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create tenant-owned source credential metadata and encrypted secret material.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:source_bindings',
    workspaceRoleDescription: 'Comma-separated workspace roles. Source credential writes require owner or admin.',
  })
  @ApiCreatedResponse({ type: SourceCredentialResponseDto })
  async create(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: CreateSourceCredentialRequestDto,
  ): Promise<SourceCredentialResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeSourceCredentialWrite(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    const result = await this.createSourceCredential.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      providerKey: body.providerKey,
      kind: body.kind,
      secret: normalizeSourceCredentialSecret(body.secret),
      secretPreview: body.secretPreview,
      scopes: normalizeSourceCredentialScopes(body.scopes),
      expiresAt: parseSourceCredentialExpiresAt(body.expiresAt),
    });
    if (!result.ok) {
      throw result.error;
    }

    await this.recordSourceCredentialAuditEvent({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'source_credential.created',
      resourceId: result.value.sourceCredential.id,
      metadata: {
        providerKey: result.value.sourceCredential.providerKey,
        kind: result.value.sourceCredential.kind,
      },
    });

    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List source credentials without exposing secret material.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:interests',
    workspaceRoleDescription: 'Comma-separated workspace roles. Source credential reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'providerKey', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ type: ListSourceCredentialsResponseDto })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('providerKey') providerKey: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListSourceCredentialsResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeSourceCredentialRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    const result = await this.listSourceCredentials.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      providerKey: providerKey?.trim() || undefined,
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 50,
        invalidMessage: 'Source credential list limit must be between 1 and 100',
      }),
      cursor,
    });
    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Patch(':sourceCredentialId/rotate')
  @ApiOperation({ summary: 'Rotate encrypted secret material for an existing source credential.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:source_bindings',
    workspaceRoleDescription: 'Comma-separated workspace roles. Source credential writes require owner or admin.',
  })
  @ApiOkResponse({ type: SourceCredentialResponseDto })
  async rotate(
    @Param('sourceCredentialId') sourceCredentialId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: RotateSourceCredentialRequestDto,
  ): Promise<SourceCredentialResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeSourceCredentialWrite(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    const result = await this.rotateSourceCredential.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sourceCredentialId,
      secret: normalizeSourceCredentialSecret(body.secret),
      secretPreview: body.secretPreview,
      scopes: body.scopes === undefined ? undefined : normalizeSourceCredentialScopes(body.scopes),
      expiresAt: parseSourceCredentialExpiresAt(body.expiresAt),
    });
    if (!result.ok) {
      throw result.error;
    }

    await this.recordSourceCredentialAuditEvent({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'source_credential.rotated',
      resourceId: result.value.sourceCredential.id,
      metadata: {
        providerKey: result.value.sourceCredential.providerKey,
        scopes: result.value.sourceCredential.scopes.join(' '),
      },
    });

    return result.value;
  }

  @Post(':sourceCredentialId/revoke')
  @ApiOperation({ summary: 'Revoke a source credential and remove its active secret material.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:source_bindings',
    workspaceRoleDescription: 'Comma-separated workspace roles. Source credential writes require owner or admin.',
  })
  @ApiCreatedResponse({ type: SourceCredentialResponseDto })
  async revoke(
    @Param('sourceCredentialId') sourceCredentialId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<SourceCredentialResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeSourceCredentialWrite(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    const result = await this.revokeSourceCredential.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sourceCredentialId,
    });
    if (!result.ok) {
      throw result.error;
    }

    await this.recordSourceCredentialAuditEvent({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'source_credential.revoked',
      resourceId: result.value.sourceCredential.id,
      metadata: {
        providerKey: result.value.sourceCredential.providerKey,
      },
    });

    return result.value;
  }

  private async authorizeSourceCredentialRead(
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
        operation: 'source_credentials.read',
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

  private async authorizeSourceCredentialWrite(
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
        operation: 'source_credentials.write',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'source_bindings.create',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });
    if (!authorization.ok) {
      throw authorization.error;
    }
  }

  private async recordSourceCredentialAuditEvent(params: {
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
      actorId: 'monitoring.source-credentials',
      action: params.action,
      outcome: 'succeeded',
      resourceType: 'source_credential',
      resourceId: params.resourceId,
      metadata: params.metadata,
    });

    if (!result.ok) {
      throw result.error;
    }
  }
}
