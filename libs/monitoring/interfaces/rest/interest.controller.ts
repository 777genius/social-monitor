import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
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
import {
  parsePaginationLimit,
  RequestCorrelationIdFactory,
  requireIdempotencyKeyHeader,
} from '@social-monitor/platform-request-context';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { CreateInterestUseCase } from '../../features/create-interest/create-interest.use-case';
import { ArchiveInterestUseCase } from '../../features/archive-interest/archive-interest.use-case';
import { ListInterestsUseCase } from '../../features/list-interests/list-interests.use-case';
import { UpdateInterestUseCase } from '../../features/update-interest/update-interest.use-case';
import { CreateInterestRequestDto, CreateInterestResponseDto } from './create-interest.dto';
import { ListInterestsResponseDto, InterestResponseDto } from './list-interests.dto';
import { UpdateInterestRequestDto } from './update-interest.dto';

@ApiTags('interests')
@Controller('interests')
export class InterestController {
  constructor(
    private readonly createInterest: CreateInterestUseCase,
    private readonly listInterests: ListInterestsUseCase,
    private readonly updateInterest: UpdateInterestUseCase,
    private readonly archiveInterest: ArchiveInterestUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
    private readonly requestCorrelationIds: RequestCorrelationIdFactory,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an interest inside the current tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:interests',
    workspaceRoleDescription: 'Comma-separated workspace roles. Interest creation requires owner or admin.',
  })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiCreatedResponse({ type: CreateInterestResponseDto })
  async create(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: CreateInterestRequestDto,
  ): Promise<CreateInterestResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });

    await this.authorizeInterestWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      'interests.create',
    );

    const result = await this.createInterest.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      name: body.name,
      query: body.query,
      idempotencyKey: requireIdempotencyKeyHeader(idempotencyKey),
      correlationId: this.requestCorrelationIds.fromRequestId(requestId),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Patch(':interestId')
  @ApiOperation({ summary: 'Update an interest inside the current tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiParam({ name: 'interestId', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:interests',
    workspaceRoleDescription: 'Comma-separated workspace roles. Interest updates require owner or admin.',
  })
  @ApiOkResponse({ type: InterestResponseDto })
  async update(
    @Param('interestId') interestId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: UpdateInterestRequestDto,
  ): Promise<InterestResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });

    await this.authorizeInterestWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      'interests.update',
    );

    const result = await this.updateInterest.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      interestId,
      name: body.name,
      query: body.query,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Delete(':interestId')
  @ApiOperation({ summary: 'Archive an interest inside the current tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiParam({ name: 'interestId', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:interests',
    workspaceRoleDescription: 'Comma-separated workspace roles. Interest archives require owner or admin.',
  })
  @ApiOkResponse({ type: InterestResponseDto })
  async archive(
    @Param('interestId') interestId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<InterestResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });

    await this.authorizeInterestWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      'interests.archive',
    );

    const result = await this.archiveInterest.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      interestId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List interests inside the current tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:interests',
    workspaceRoleDescription: 'Comma-separated workspace roles. Interest reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ type: ListInterestsResponseDto })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListInterestsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeInterestRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    const result = await this.listInterests.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 50,
        invalidMessage: 'Interest list limit must be between 1 and 100',
      }),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  private async authorizeInterestRead(
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
        operation: 'interests.read',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'interests.read',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }

  private async authorizeInterestWrite(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
    action: 'interests.create' | 'interests.update' | 'interests.archive',
  ): Promise<void> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: 'write:interests',
        operation: action,
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action,
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
