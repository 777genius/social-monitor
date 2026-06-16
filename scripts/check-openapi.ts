import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import 'reflect-metadata';

import { AppModule } from '../apps/api-gateway/src/app.module';

const snapshotPath = 'libs/contracts/rest/openapi.snapshot.json';
const shouldUpdate = process.argv.includes('--update') || process.env.UPDATE_OPENAPI_SNAPSHOT === '1';

async function main(): Promise<void> {
  const current = await generateOpenApiSnapshot();
  const serialized = `${JSON.stringify(sortJson(current), null, 2)}\n`;

  if (shouldUpdate) {
    mkdirSync(dirname(snapshotPath), { recursive: true });
    writeFileSync(snapshotPath, serialized);
    console.log(`OpenAPI snapshot updated: ${snapshotPath}`);
    return;
  }

  let expected: string;
  try {
    expected = readFileSync(snapshotPath, 'utf8');
  } catch {
    console.error(`OpenAPI snapshot missing: ${snapshotPath}. Run "npm run update:openapi".`);
    process.exitCode = 1;
    return;
  }

  if (expected !== serialized) {
    console.error(
      [
        'OpenAPI snapshot drift detected.',
        `Snapshot: ${relative(process.cwd(), snapshotPath)}`,
        'Run "npm run update:openapi" intentionally, review the diff and update generated clients/contracts.',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log('OpenAPI snapshot OK');
}

async function generateOpenApiSnapshot(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    await app.init();

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Social Monitor API')
      .setDescription('Backend/API-first social monitoring MVP.')
      .setVersion('0.1.0')
      .build();

    return SwaggerModule.createDocument(app, swaggerConfig);
  } finally {
    await app.close();
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }

  return value;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
