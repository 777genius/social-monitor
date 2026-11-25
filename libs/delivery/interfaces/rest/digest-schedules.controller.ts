import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import { parsePaginationLimit } from '@social-monitor/platform-request-context';
import { DomainError, requireTenantScope } from '@social-monitor/shared-kernel';

import { CreateDigestScheduleUseCase } from '../../features/create-digest-schedule/create-digest-schedule.use-case';
import { GetDigestScheduleUseCase } from '../../features/get-digest-schedule/get-digest-schedule.use-case';
import { ListDigestSchedulesUseCase } from '../../features/list-digest-schedules/list-digest-schedules.use-case';
import {
  CreateDigestScheduleRequestDto,
  type CreateDigestScheduleResponseDto,
  type GetDigestScheduleResponseDto,
  type ListDigestSchedulesResponseDto,
} from './digest-schedules.dto';
import { DeliveryReadAuthorizer } from './delivery-read.authorizer';

@ApiTags('delivery')
@Controller('delivery/digest-schedules')
export class DigestSchedulesController {
  constructor(
    private readonly createDigestSchedule: CreateDigestScheduleUseCase,
    private readonly getDigestSchedule: GetDigestScheduleUseCase,
    private readonly listDigestSchedules: ListDigestSchedulesUseCase,
    private readonly deliveryReadAuthorizer: DeliveryReadAuthorizer,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a periodic digest schedule for one recipient and interest set.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:delivery_status',
    workspaceRoleDescription: 'Comma-separated workspace roles. Digest schedule creation allows owner, admin or member.',
  })
  async create(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: CreateDigestScheduleRequestDto,
  ): Promise<CreateDigestScheduleResponseDto> {
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
      action: 'digest_schedules.create',
      operation: 'digest_schedules.create',
    });

    const result = await this.createDigestSchedule.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      recipientKey: body.recipientKey,
      channel: body.channel,
      interestIds: body.interestIds,
      intervalSeconds: body.intervalSeconds,
      includeNoSignal: body.includeNoSignal,
      nextRunAt: body.nextRunAt === undefined ? undefined : parseDate(body.nextRunAt, 'nextRunAt'),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List digest schedules for the current tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:delivery_status',
    workspaceRoleDescription: 'Comma-separated workspace roles. Digest schedule reads allow owner, admin, member or viewer.',
  })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListDigestSchedulesResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.deliveryReadAuthorizer.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      action: 'digest_schedules.read',
      operation: 'digest_schedules.read',
    });

    const result = await this.listDigestSchedules.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 50,
        invalidMessage: 'Digest schedule list limit must be between 1 and 100',
      }),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get(':digestScheduleId')
  @ApiOperation({ summary: 'Get one digest schedule for the current tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:delivery_status',
    workspaceRoleDescription: 'Comma-separated workspace roles. Digest schedule reads allow owner, admin, member or viewer.',
  })
  async get(
    @Param('digestScheduleId') digestScheduleId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<GetDigestScheduleResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.deliveryReadAuthorizer.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      action: 'digest_schedules.read',
      operation: 'digest_schedules.read',
    });
    const result = await this.getDigestSchedule.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      digestScheduleId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}

const parseDate = (value: string, fieldName: string): Date => {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new DomainError('validation.failed', `${fieldName} must be a valid ISO date`);
  }

  return parsed;
};
