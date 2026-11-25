import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import { parsePaginationLimit } from '@social-monitor/platform-request-context';
import { requireTenantScope } from '@social-monitor/shared-kernel';

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
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tenant/workspace delivery attempts for operator monitoring.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:delivery_status',
    workspaceRoleDescription: 'Comma-separated workspace roles. Delivery attempt reads allow owner, admin, member or viewer.',
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
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 50,
        invalidMessage: 'Delivery attempt list limit must be between 1 and 100',
      }),
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
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:delivery_status',
    workspaceRoleDescription: 'Comma-separated workspace roles. Delivery attempt reads allow owner, admin, member or viewer.',
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
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:delivery_status',
    workspaceRoleDescription: 'Comma-separated workspace roles. Delivery retries allow owner, admin or member.',
  })
  async retry(
    @Param('deliveryAttemptId') deliveryAttemptId: string,
    @Body() body: RetryDeliveryAttemptRequestDto,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<RetryDeliveryAttemptResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.deliveryReadAuthorizer.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      requiredScope: 'write:delivery_status',
      action: 'delivery_attempts.retry',
      operation: 'delivery_attempts.retry',
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
}
