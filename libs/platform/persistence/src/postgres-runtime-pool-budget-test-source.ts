import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

export function runtimeSourceFiles(directory: string): readonly string[] {
  if (directory === 'prisma/generated') {
    return [];
  }
  const absoluteDirectory = join(process.cwd(), directory);
  const files: string[] = [];

  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const absolutePath = join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...runtimeSourceFiles(join(directory, entry.name)));
      continue;
    }
    if (['.ts', '.js', '.mjs', '.cjs', '.py'].includes(extname(entry.name))) {
      files.push(relative(process.cwd(), absolutePath));
    }
  }

  return files;
}

export function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

export function expectedSourceList(value: string): readonly string[] {
  return value.trim().split(/\s+/u);
}

export function directDatabaseConstructions(
  source: string,
): readonly ('Pool' | 'PrismaPg' | 'PrismaClient')[] {
  const imported = databaseConstructorAliases(source);
  const constructions: ('Pool' | 'PrismaPg' | 'PrismaClient')[] = [];
  for (const [localName, canonical] of imported) {
    const constructorPattern = new RegExp(
      `new\\s+${escapeRegularExpression(localName)}\\s*\\(`,
      'g',
    );
    constructions.push(
      ...(source.match(constructorPattern) ?? []).map(() => canonical),
    );
  }
  return constructions;
}

function databaseConstructorAliases(
  source: string,
): ReadonlyMap<string, 'Pool' | 'PrismaPg' | 'PrismaClient'> {
  const imported = new Map<string, 'Pool' | 'PrismaPg' | 'PrismaClient'>();
  for (const match of source.matchAll(
    /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g,
  )) {
    const moduleName = match[2] ?? '';
    const canonical =
      moduleName === 'pg'
        ? 'Pool'
        : moduleName === '@prisma/adapter-pg'
          ? 'PrismaPg'
          : moduleName.includes('generated/client/client')
            ? 'PrismaClient'
            : undefined;
    if (canonical === undefined) {
      continue;
    }
    for (const specifier of (match[1] ?? '').split(',')) {
      const importedName = new RegExp(
        `^(?:type\\s+)?${canonical}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?$`,
      ).exec(specifier.trim());
      if (importedName !== null) {
        imported.set(importedName[1] ?? canonical, canonical);
      }
    }
  }
  return imported;
}

export function directPoolOptions(source: string): readonly string[] {
  const options: string[] = [];
  for (const [localName, canonical] of databaseConstructorAliases(source)) {
    if (canonical !== 'Pool') {
      continue;
    }
    const poolPattern = new RegExp(
      `new\\s+${escapeRegularExpression(localName)}\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*(?:as[\\s\\S]*?)?\\)`,
      'g',
    );
    for (const match of source.matchAll(poolPattern)) {
      options.push(match[1] ?? '');
    }
  }
  return options;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function readComposeService(compose: string, service: string): string {
  const startMarker = `  ${service}:\n`;
  const start = compose.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Compose service is missing: ${service}`);
  }
  const remainder = compose.slice(start + startMarker.length);
  const nextService = /^ {2}[a-z0-9-]+:\s*$/m.exec(remainder);
  const end =
    nextService === null
      ? undefined
      : start + startMarker.length + nextService.index;
  return compose.slice(start, end);
}
