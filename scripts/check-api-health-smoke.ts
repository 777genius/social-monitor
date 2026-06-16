import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../apps/api-gateway/src/app.module';

const assertHealthResponse = (body: unknown, route: string): void => {
  const payload = body as {
    readonly status?: unknown;
    readonly service?: unknown;
    readonly checkedAt?: unknown;
    readonly uptimeSeconds?: unknown;
  };

  if (payload.status !== 'ok') {
    throw new Error(`${route} must return status=ok`);
  }

  if (payload.service !== 'api-gateway') {
    throw new Error(`${route} must return service=api-gateway`);
  }

  if (typeof payload.checkedAt !== 'string' || Number.isNaN(Date.parse(payload.checkedAt))) {
    throw new Error(`${route} must return an ISO checkedAt timestamp`);
  }

  if (typeof payload.uptimeSeconds !== 'number' || payload.uptimeSeconds < 0) {
    throw new Error(`${route} must return non-negative uptimeSeconds`);
  }
};

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();

  await app.init();

  try {
    for (const route of ['/health', '/healthz', '/ready', '/health/ready']) {
      const response = await request(app.getHttpServer()).get(route).expect(200);
      assertHealthResponse(response.body, route);
    }

    console.log('API health smoke OK');
  } finally {
    await app.close();
  }
}

void main();
