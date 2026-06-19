import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { type TestingModule } from '@nestjs/testing';

import { DomainErrorFilter } from '../../../apps/api-gateway/src/domain-error.filter';

export const createApiGatewayE2eApp = (moduleRef: TestingModule): INestApplication => {
  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new DomainErrorFilter());
  app.useGlobalPipes(createApiGatewayValidationPipe());
  return app;
};

const createApiGatewayValidationPipe = (): ValidationPipe => new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
