import "dotenv/config";

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: requiredPath("READER_SUMMARY_PUBLICATION_TEST_SCHEMA_PATH"),
  migrations: {
    path: requiredPath("READER_SUMMARY_PUBLICATION_TEST_MIGRATIONS_PATH"),
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

function requiredPath(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required by the isolated publication gate`);
  }
  return value;
}
