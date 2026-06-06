import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ListRealtimeEventsUseCase } from '../../features/list-realtime-events/list-realtime-events.use-case';
import type { ListRealtimeEventsResponseDto } from './realtime-events.dto';

@ApiTags('realtime')
@Controller('realtime/events')
export class RealtimeEventsController {
  constructor(private readonly listRealtimeEvents: ListRealtimeEventsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Replay tenant/workspace realtime events for REST resync.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiQuery({ name: 'channel', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async list(
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-workspace-id') workspaceHeader: string,
    @Query('channel') channel: string,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListRealtimeEventsResponseDto> {
    const result = await this.listRealtimeEvents.execute({
      tenantId: tenantId(tenantHeader),
      workspaceId: workspaceId(workspaceHeader),
      channel,
      limit: parseLimit(limitQuery),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}

const parseLimit = (value: string | undefined): number => {
  if (value === undefined) {
    return 20;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : Number.NaN;
};
