import { globSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';

const sdkPackage = '@infinity-context/sdk';
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'"]+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const violations = [];

const allowedPaths = [
  /^libs\/summary\/adapters\/memory\//,
  /^libs\/summary\/interfaces\/rest\/summary-rest\.module\.ts$/,
  /^libs\/summary\/interfaces\/rest\/summary-provider-tokens\.ts$/,
  /^libs\/relevance\/adapters\/memory\//,
  /^libs\/relevance\/interfaces\/rest\/relevance-rest\.module\.ts$/,
  /^libs\/relevance\/interfaces\/rest\/relevance-provider-tokens\.ts$/,
  /^scripts\/check-summary-memory-[a-z0-9-]+\.(?:mjs|ts)$/,
  /^scripts\/capture-summary-memory-[a-z0-9-]+\.(?:mjs|ts)$/,
  /^scripts\/check-relevance-memory-[a-z0-9-]+\.(?:mjs|ts)$/,
  /^scripts\/capture-relevance-memory-[a-z0-9-]+\.(?:mjs|ts)$/,
];

const explicitlyForbiddenPaths = [
  /^libs\/summary\/domain\//,
  /^libs\/summary\/features\//,
  /^libs\/summary\/interfaces\/rest\/.*\.controller\.ts$/,
  /^libs\/summary\/interfaces\/rest\/.*\.dto\.ts$/,
  /^libs\/relevance\/domain\//,
  /^libs\/relevance\/features\//,
  /^libs\/relevance\/interfaces\/rest\/.*\.controller\.ts$/,
  /^libs\/relevance\/interfaces\/rest\/.*\.dto\.ts$/,
];

for (const file of scanFiles()) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? '';
    if (specifier !== sdkPackage && !specifier.startsWith(`${sdkPackage}/`)) {
      continue;
    }

    const normalized = normalizePath(file);
    if (explicitlyForbiddenPaths.some((pattern) => pattern.test(normalized))) {
      violations.push(`${normalized}: ${sdkPackage} is forbidden in summary domain/features/controllers/DTO`);
      continue;
    }

    if (!allowedPaths.some((pattern) => pattern.test(normalized))) {
      violations.push(`${normalized}: ${sdkPackage} is allowed only in summary/relevance memory adapters, approved REST wiring, or memory smoke/check scripts`);
    }
  }
}

if (violations.length > 0) {
  console.error('Summary memory SDK boundary violations:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Summary memory SDK boundary OK');

function scanFiles() {
  return [
    ...globSync('apps/**/*.ts'),
    ...globSync('libs/**/*.ts'),
    ...globSync('scripts/**/*.{mjs,ts}'),
  ].filter((file) => (
    !file.endsWith('.d.ts') &&
    !file.endsWith('.spec.ts') &&
    !file.endsWith('.test.ts') &&
    !file.endsWith('.e2e-spec.ts')
  ));
}

function normalizePath(file) {
  return relative(process.cwd(), file).replaceAll('\\', '/');
}
