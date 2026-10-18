import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: resolve('prisma/schema.prisma'),
  migrations: { path: env('SELFHOST_MIGRATIONS_PATH') },
  datasource: { url: env('DATABASE_URL') },
});
