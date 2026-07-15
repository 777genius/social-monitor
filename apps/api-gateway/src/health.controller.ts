import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiGatewayHealthReporter, type HealthResponse, type ReadinessResponse } from './health-reporter';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly healthReporter: ApiGatewayHealthReporter) {}

  @Get(['health', 'healthz'])
  @ApiOperation({ summary: 'Liveness probe for the API gateway.' })
  health(): HealthResponse {
    return this.healthReporter.health();
  }

  @Get(['ready', 'health/ready'])
  @ApiOperation({ summary: 'Readiness probe for the API gateway.' })
  ready(): ReadinessResponse {
    return this.healthReporter.ready();
  }
}
