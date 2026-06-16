import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

type HealthResponse = {
  readonly status: 'ok';
  readonly service: 'api-gateway';
  readonly checkedAt: string;
  readonly uptimeSeconds: number;
};

@ApiTags('health')
@Controller()
export class HealthController {
  @Get(['health', 'healthz'])
  @ApiOperation({ summary: 'Liveness probe for the API gateway.' })
  health(): HealthResponse {
    return this.ok();
  }

  @Get(['ready', 'health/ready'])
  @ApiOperation({ summary: 'Readiness probe for the API gateway.' })
  ready(): HealthResponse {
    return this.ok();
  }

  private ok(): HealthResponse {
    return {
      status: 'ok',
      service: 'api-gateway',
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
