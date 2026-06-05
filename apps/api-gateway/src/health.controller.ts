import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

type HealthResponse = {
  readonly status: 'ok';
  readonly service: 'api-gateway';
};

@ApiTags('health')
@Controller()
export class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe for the API gateway.' })
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'api-gateway',
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe for the API gateway.' })
  ready(): HealthResponse {
    return {
      status: 'ok',
      service: 'api-gateway',
    };
  }
}
