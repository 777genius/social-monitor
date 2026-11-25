import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';

type PrismaRuntimeModule<TPrismaClientConstructor> = {
  readonly PrismaClient?: TPrismaClientConstructor;
};

const runtimeRequire = createRequire(join(process.cwd(), 'package.json'));

export function loadPrismaRuntimeClient<TPrismaClientConstructor>(): TPrismaClientConstructor {
  const modulePath = resolvePrismaRuntimeClientModule();
  const runtimeModule = runtimeRequire(modulePath) as PrismaRuntimeModule<TPrismaClientConstructor>;

  if (runtimeModule.PrismaClient === undefined) {
    throw new Error(`Generated Prisma client at ${displayPath(modulePath)} does not export PrismaClient`);
  }

  return runtimeModule.PrismaClient;
}

function resolvePrismaRuntimeClientModule(): string {
  const rootDirectory = process.cwd();
  const compiledClientPath = resolve(rootDirectory, 'dist/prisma/generated/client/client.js');
  const generatedJavaScriptClientPath = resolve(rootDirectory, 'prisma/generated/client/client.js');
  const generatedTypeScriptClientPath = resolve(rootDirectory, 'prisma/generated/client/client.ts');

  const candidatePaths = isCompiledRuntime()
    ? [compiledClientPath, generatedJavaScriptClientPath]
    : [generatedTypeScriptClientPath, generatedJavaScriptClientPath, compiledClientPath];

  const modulePath = candidatePaths.find((candidatePath) => existsSync(candidatePath));
  if (modulePath !== undefined) {
    return modulePath;
  }

  throw new Error(
    `Generated Prisma client is missing. Checked ${candidatePaths.map(displayPath).join(', ')}. Run npm run prisma:generate and npm run build.`,
  );
}

function isCompiledRuntime(): boolean {
  return __filename.includes(`${sep}dist${sep}`);
}

function displayPath(path: string): string {
  const relativePath = relative(process.cwd(), path);
  return relativePath.startsWith('..') ? path : relativePath;
}
