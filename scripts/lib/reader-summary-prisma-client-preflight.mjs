import { constants } from "node:fs";
import { access, lstat, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";

import {
  readerSummaryFailureDetails,
  redactReaderSummaryDiagnostic,
} from "./reader-summary-e2e-diagnostics.mjs";

const clientEntry = "prisma/generated/client/client.ts";
const prismaCliEntry = "node_modules/prisma/build/index.js";
const codegenDatabaseUrl =
  "postgresql://reader_summary_codegen@127.0.0.1:5432/reader_summary_codegen";
const relativeModulePattern =
  /(?:\bfrom\s*|\bimport\s*|\brequire\(\s*)["'](\.{1,2}\/[^"']+)["']/gu;
const supportedExtensions = [".ts", ".js", ".json"];

const isWithin = (root, candidate) => {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" ||
    (!pathFromRoot.startsWith("..") && !pathFromRoot.startsWith("/"));
};

const readableRegularFile = async (path) => {
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) return false;
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const resolveRelativeModule = async (graphRoot, importer, specifier) => {
  const base = resolve(dirname(importer), specifier);
  const candidates = extname(base) === ""
    ? [
        ...supportedExtensions.map((extension) => `${base}${extension}`),
        ...supportedExtensions.map((extension) => resolve(base, `index${extension}`)),
      ]
    : [base];
  for (const candidate of candidates) {
    if (!isWithin(graphRoot, candidate)) continue;
    if (await readableRegularFile(candidate)) return candidate;
  }
  return undefined;
};

const validateGeneratedGraph = async (repositoryRoot) => {
  const graphRoot = resolve(repositoryRoot, "prisma/generated/client");
  const entry = resolve(repositoryRoot, clientEntry);
  if (!isWithin(graphRoot, entry) || !(await readableRegularFile(entry))) {
    throw new Error(`generated entry ${clientEntry} is missing or unsafe`);
  }
  const pending = [entry];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const source = await readFile(current, "utf8");
    for (const match of source.matchAll(relativeModulePattern)) {
      const imported = await resolveRelativeModule(graphRoot, current, match[1]);
      if (imported === undefined) {
        throw new Error(
          `generated module ${relative(graphRoot, current)} has unresolved import ${JSON.stringify(match[1])}`,
        );
      }
      pending.push(imported);
    }
  }
  return { entry: clientEntry, moduleCount: visited.size };
};

export const ensureReaderSummaryPrismaClient = async ({
  repositoryRoot,
  execute,
  environment = process.env,
  report = (message) => process.stdout.write(`${message}\n`),
}) => {
  const prismaCli = resolve(repositoryRoot, prismaCliEntry);
  if (!(await readableRegularFile(prismaCli))) {
    throw new Error(
      `Reader summary E2E Prisma preflight cannot find the locked local CLI at ${prismaCliEntry}. Run npm ci with the committed lockfile, then retry.`,
    );
  }
  const databaseUrl = environment.DATABASE_URL === undefined
    ? codegenDatabaseUrl
    : environment.DATABASE_URL;
  const codegenEnvironment = { ...environment, DATABASE_URL: databaseUrl };
  report('[reader-summary-e2e] prisma-client action=generate source="locked-local-cli"');
  try {
    const result = await execute(
      process.execPath,
      [prismaCli, "generate", "--schema", "prisma/schema.prisma"],
      {
        cwd: repositoryRoot,
        env: codegenEnvironment,
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const stdout = redactReaderSummaryDiagnostic(
      result?.stdout,
      [databaseUrl],
    ).trim();
    const stderr = redactReaderSummaryDiagnostic(
      result?.stderr,
      [databaseUrl],
    ).trim();
    if (stdout !== "") report(`[reader-summary-e2e] prisma-generate stdout=${JSON.stringify(stdout)}`);
    if (stderr !== "") report(`[reader-summary-e2e] prisma-generate stderr=${JSON.stringify(stderr)}`);
  } catch (error) {
    throw new Error(
      `Reader summary E2E Prisma generation failed. Run npm run prisma:generate to reproduce.${readerSummaryFailureDetails(error, [databaseUrl])}`,
    );
  }
  let graph;
  try {
    graph = await validateGeneratedGraph(repositoryRoot);
  } catch (error) {
    throw new Error(
      `Reader summary E2E Prisma generation produced an incomplete client: ${error.message}. Run npm run prisma:generate and inspect prisma/schema.prisma.`,
    );
  }
  report(
    `[reader-summary-e2e] prisma-client status=ready entry=${JSON.stringify(graph.entry)} modules=${graph.moduleCount}`,
  );
  return graph;
};

export const readerSummaryCodegenDatabaseUrl = codegenDatabaseUrl;
