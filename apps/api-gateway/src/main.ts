import { ValidationPipe } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { bindPostgresRuntimeProcessIdentity } from '@social-monitor/platform-persistence';
import 'reflect-metadata';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  bindPostgresRuntimeProcessIdentity(process.env, 'api-gateway');
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const corsOptions = resolveCorsOptions(process.env);
  if (corsOptions !== undefined) {
    app.enableCors(corsOptions);
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Social Monitor API')
    .setDescription('Backend/API-first social monitoring MVP.')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('openapi', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

const resolveCorsOptions = (env: NodeJS.ProcessEnv): CorsOptions | undefined => {
  const configuredOrigins = parseCorsOrigins(env.SOCIAL_MONITOR_CORS_ORIGINS);
  const localDevOrigins = env.SOCIAL_MONITOR_RUNTIME_PROFILE === 'local-dev'
    ? [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]
    : [];
  const allowedOrigins = [...configuredOrigins, ...localDevOrigins];

  if (allowedOrigins.length === 0) {
    return undefined;
  }

  return {
    origin(origin, callback) {
      if (origin === undefined || allowedOrigins.some((allowed) => matchesOrigin(allowed, origin))) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'authorization',
      'content-type',
      'idempotency-key',
      'x-correlation-id',
      'x-request-id',
      'x-tenant-id',
      'x-workspace-id',
      'x-workspace-role',
    ],
  };
};

const parseCorsOrigins = (value: string | undefined): readonly string[] =>
  value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0) ?? [];

const matchesOrigin = (allowed: string | RegExp, origin: string): boolean =>
  typeof allowed === 'string' ? allowed === origin : allowed.test(origin);

void bootstrap();
