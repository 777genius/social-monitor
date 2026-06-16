import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  type WorkspaceAction,
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { GetDeliveryAttemptUseCase } from '../../features/get-delivery-attempt/get-delivery-attempt.use-case';
import { ListDeliveryAttemptsUseCase } from '../../features/list-delivery-attempts/list-delivery-attempts.use-case';
import { RetryDeliveryAttemptUseCase } from '../../features/retry-delivery-attempt/retry-delivery-attempt.use-case';
import {
  RetryDeliveryAttemptRequestDto,
  type GetDeliveryAttemptResponseDto,
  type ListDeliveryAttemptsResponseDto,
  type RetryDeliveryAttemptResponseDto,
} from './delivery-attempts.dto';
import { DeliveryReadAuthorizer } from './delivery-read.authorizer';

@ApiTags('delivery')
@Controller('delivery/attempts')
export class DeliveryAttemptsController {
  constructor(
    private readonly getDeliveryAttempt: GetDeliveryAttemptUseCase,
    private readonly listDeliveryAttempts: ListDeliveryAttemptsUseCase,
    private readonly retryDeliveryAttempt: RetryDeliveryAttemptUseCase,
    private readonly deliveryReadAuthorizer: DeliveryReadAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tenant/workspace delivery attempts for operator monitoring.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Delivery attempt reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListDeliveryAttemptsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.deliveryReadAuthorizer.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      action: 'delivery_attempts.read',
      operation: 'delivery_attempts.read',
    });

    const result = await this.listDeliveryAttempts.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      limit: limitQuery === undefined ? 50 : Number(limitQuery),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get(':deliveryAttemptId')
  @ApiOperation({ summary: 'Get one tenant/workspace delivery attempt status.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Delivery attempt reads allow owner, admin, member or viewer.',
  })
  async get(
    @Param('deliveryAttemptId') deliveryAttemptId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<GetDeliveryAttemptResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.deliveryReadAuthorizer.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'delivery_attempts.read',
      workspaceRoleHeader,
      authorizationHeader,
      operation: 'delivery_attempts.read',
    });

    const result = await this.getDeliveryAttempt.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      deliveryAttemptId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Post(':deliveryAttemptId/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Retry a retryable failed delivery attempt with caller-supplied content.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Delivery retries allow owner, admin or member.',
  })
  async retry(
    @Param('deliveryAttemptId') deliveryAttemptId: string,
    @Body() body: RetryDeliveryAttemptRequestDto,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
  ): Promise<RetryDeliveryAttemptResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    this.authorizeWorkspaceRole({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      workspaceRoleHeader,
      action: 'delivery_attempts.retry',
    });

    const result = await this.retryDeliveryAttempt.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      deliveryAttemptId,
      content: body.content,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  private authorizeWorkspaceRole(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly workspaceRoleHeader: string | undefined;
    readonly action: WorkspaceAction;
  }): void {
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      action: params.action,
      roles: parseWorkspaceRolesHeader(params.workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
