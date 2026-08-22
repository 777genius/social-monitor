import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  ensureReaderSummaryPrismaClient,
  readerSummaryCodegenDatabaseUrl,
} from "./reader-summary-prisma-client-preflight.mjs";

const withFixture = async (run) => {
  const root = await mkdtemp(join(tmpdir(), "reader-summary-prisma-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const writeFileWithParents = async (root, relativePath, content) => {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return path;
};

const writeCli = (root) => writeFileWithParents(
  root,
  "node_modules/prisma/build/index.js",
  "// locked fixture CLI\n",
);

const writeCompleteClient = async (root) => {
  await writeFileWithParents(
    root,
    "prisma/generated/client/client.ts",
    'export * from "./models";\nimport "./internal/runtime";\n',
  );
  await writeFileWithParents(
    root,
    "prisma/generated/client/models.ts",
    "export const model = true;\n",
  );
  await writeFileWithParents(
    root,
    "prisma/generated/client/internal/runtime.ts",
    "export const runtime = true;\n",
  );
};

test("uses the locked local Prisma CLI and validates the generated graph", async () => {
  await withFixture(async (root) => {
    const prismaCli = await writeCli(root);
    const calls = [];
    const reports = [];
    const result = await ensureReaderSummaryPrismaClient({
      repositoryRoot: root,
      environment: { FIXTURE_ENV: "preserved" },
      report: (message) => reports.push(message),
      execute: async (...args) => {
        calls.push(args);
        await writeCompleteClient(root);
        return { stdout: "Generated Prisma Client", stderr: "" };
      },
    });

    assert.deepEqual(result, {
      entry: "prisma/generated/client/client.ts",
      moduleCount: 3,
    });
    assert.equal(calls[0][0], process.execPath);
    assert.deepEqual(calls[0][1], [
      prismaCli,
      "generate",
      "--schema",
      "prisma/schema.prisma",
    ]);
    assert.equal(calls[0][2].cwd, root);
    assert.equal(calls[0][2].env.FIXTURE_ENV, "preserved");
    assert.equal(calls[0][2].env.DATABASE_URL, readerSummaryCodegenDatabaseUrl);
    assert.match(reports.join("\n"), /status=ready/u);
  });
});

test("always refreshes an existing client before accepting it", async () => {
  await withFixture(async (root) => {
    await writeCli(root);
    await writeCompleteClient(root);
    let executions = 0;
    await ensureReaderSummaryPrismaClient({
      repositoryRoot: root,
      report: () => undefined,
      execute: async () => {
        executions += 1;
        return {};
      },
    });
    assert.equal(executions, 1);
  });
});

test("preserves an explicit DATABASE_URL and leaves the parent object untouched", async () => {
  await withFixture(async (root) => {
    await writeCli(root);
    const environment = {
      FIXTURE_ENV: "parent",
      DATABASE_URL: "postgresql://explicit:password@db.invalid/explicit",
    };
    let childEnvironment;
    await ensureReaderSummaryPrismaClient({
      repositoryRoot: root,
      environment,
      report: () => undefined,
      execute: async (_command, _args, options) => {
        childEnvironment = options.env;
        await writeCompleteClient(root);
        return {};
      },
    });
    assert.notEqual(childEnvironment, environment);
    assert.equal(childEnvironment.DATABASE_URL, environment.DATABASE_URL);
    assert.deepEqual(environment, {
      FIXTURE_ENV: "parent",
      DATABASE_URL: "postgresql://explicit:password@db.invalid/explicit",
    });
  });
});

test("does not add the placeholder to an environment without DATABASE_URL", async () => {
  await withFixture(async (root) => {
    await writeCli(root);
    const environment = { FIXTURE_ENV: "parent" };
    await ensureReaderSummaryPrismaClient({
      repositoryRoot: root,
      environment,
      report: () => undefined,
      execute: async () => {
        await writeCompleteClient(root);
        return {};
      },
    });
    assert.deepEqual(environment, { FIXTURE_ENV: "parent" });
    assert.equal(Object.hasOwn(environment, "DATABASE_URL"), false);
  });
});

test("reports generator stdout and stderr while redacting credentials", async () => {
  await withFixture(async (root) => {
    await writeCli(root);
    const databaseUrl = "postgresql://diagnostic:password@db.invalid/private";
    const failure = Object.assign(
      new Error(`DATABASE_URL=${databaseUrl} token=private-token`),
      {
        stdout: `Loaded ${databaseUrl}`,
        stderr: "P1012 password=secret-value",
      },
    );
    await assert.rejects(
      ensureReaderSummaryPrismaClient({
        repositoryRoot: root,
        environment: { DATABASE_URL: databaseUrl },
        report: () => undefined,
        execute: async () => { throw failure; },
      }),
      (error) => {
        assert.match(error.message, /stdout:\nLoaded/u);
        assert.match(error.message, /stderr:\nP1012/u);
        assert.match(error.message, /\[REDACTED\]/u);
        assert.doesNotMatch(error.message, /private-token|secret-value|password@/u);
        return true;
      },
    );
  });
});

test("fails before execution when the locked local Prisma CLI is absent", async () => {
  await withFixture(async (root) => {
    await assert.rejects(
      ensureReaderSummaryPrismaClient({
        repositoryRoot: root,
        report: () => undefined,
        execute: async () => assert.fail("must not execute"),
      }),
      /locked local CLI.*npm ci/u,
    );
  });
});

test("rejects an incomplete generated import graph", async () => {
  await withFixture(async (root) => {
    await writeCli(root);
    await assert.rejects(
      ensureReaderSummaryPrismaClient({
        repositoryRoot: root,
        report: () => undefined,
        execute: async () => {
          await writeFileWithParents(
            root,
            "prisma/generated/client/client.ts",
            'export * from "./missing";\n',
          );
          return {};
        },
      }),
      /incomplete client.*unresolved import/u,
    );
  });
});

test("rejects a generated entry symlink", async (t) => {
  if (process.platform === "win32") return t.skip("symlink permissions vary");
  await withFixture(async (root) => {
    await writeCli(root);
    const outside = await writeFileWithParents(root, "outside.ts", "export {};\n");
    await mkdir(join(root, "prisma/generated/client"), { recursive: true });
    await symlink(outside, join(root, "prisma/generated/client/client.ts"));
    await assert.rejects(
      ensureReaderSummaryPrismaClient({
        repositoryRoot: root,
        report: () => undefined,
        execute: async () => ({}),
      }),
      /incomplete client.*missing or unsafe/u,
    );
  });
});
