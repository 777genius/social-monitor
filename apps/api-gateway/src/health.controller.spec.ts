import { ServiceUnavailableException } from '@nestjs/common';

import { HealthController } from './health.controller';
import type {
  ApiGatewayHealthReporter,
  ReadinessResponse,
} from './health-reporter';

describe('HealthController dependency readiness', () => {
  it('returns the database-aware readiness response', async () => {
    const response = { status: 'ok' } as ReadinessResponse;
    const reporter = {
      ready: jest.fn().mockResolvedValue(response),
    } as unknown as ApiGatewayHealthReporter;

    await expect(new HealthController(reporter).ready()).resolves.toBe(
      response,
    );
  });

  it('maps a dependency probe rejection to a non-secret 503', async () => {
    const reporter = {
      ready: jest.fn().mockRejectedValue(new Error('postgresql://secret@host')),
    } as unknown as ApiGatewayHealthReporter;

    const request = new HealthController(reporter).ready();
    await expect(request).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(request).rejects.toMatchObject({
      response: {
        statusCode: 503,
        message: 'Dependency readiness check failed',
      },
    });
    await expect(request).rejects.not.toThrow('postgresql://secret@host');
  });
});
