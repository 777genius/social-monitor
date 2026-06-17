import { existsSync, readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { relative } from 'node:path';

const violations = [];

const publicRestControllers = new Set([
  'libs/ingestion/interfaces/rest/source-profile.controller.ts',
]);

function normalizedPath(file) {
  return file.replaceAll('\\', '/');
}

function addViolation(file, reason) {
  violations.push(`${relative(process.cwd(), file)}: ${reason}`);
}

function productionTsFiles(pattern) {
  return globSync(pattern).filter((file) => (
    !file.endsWith('.spec.ts') &&
    !file.endsWith('.e2e-spec.ts') &&
    !file.endsWith('.test.ts') &&
    !file.endsWith('.d.ts')
  ));
}

const testFiles = [
  ...globSync('apps/**/*.ts'),
  ...globSync('libs/**/*.ts'),
  ...globSync('test/**/*.ts'),
].filter((file) => (
  file.endsWith('.spec.ts') ||
  file.endsWith('.e2e-spec.ts') ||
  file.endsWith('.test.ts')
));

for (const useCaseFile of globSync('libs/**/features/**/*.use-case.ts')) {
  const specFile = useCaseFile.replace(/\.use-case\.ts$/, '.use-case.spec.ts');
  if (!existsSync(specFile)) {
    addViolation(useCaseFile, `feature use case must have focused unit spec "${relative(process.cwd(), specFile)}"`);
  } else {
    const specSource = readFileSync(specFile, 'utf8');
    const useCaseClass = readFileSync(useCaseFile, 'utf8').match(/export\s+class\s+([A-Za-z0-9_]+UseCase)\b/)?.[1];

    if (!useCaseClass) {
      addViolation(useCaseFile, 'feature use case file must export a *UseCase class');
    } else if (!specSource.includes(useCaseClass)) {
      addViolation(specFile, `feature use case spec must reference ${useCaseClass}`);
    }

    if (!/\b(it|test)\s*\(/.test(specSource)) {
      addViolation(specFile, 'feature use case spec must include at least one executable test');
    }
  }

  const source = readFileSync(useCaseFile, 'utf8');
  if (/throw\s+new\s+DomainError\s*\(/.test(source)) {
    addViolation(useCaseFile, 'feature use case must return err(new DomainError(...)) instead of throwing DomainError');
  }

  if (/\bnew\s+InMemory[A-Za-z0-9_]*\s*\(/.test(source)) {
    addViolation(useCaseFile, 'feature use case must depend on ports, not concrete in-memory adapters');
  }
}

for (const controllerFile of globSync('libs/**/interfaces/rest/*.controller.ts')) {
  if (publicRestControllers.has(normalizedPath(controllerFile))) {
    continue;
  }

  const source = readFileSync(controllerFile, 'utf8');
  if (!source.includes('requireTenantScope(')) {
    addViolation(controllerFile, 'REST controller must enforce tenant/workspace scope with requireTenantScope');
  }
}

for (const file of [
  ...productionTsFiles('apps/**/*.ts'),
  ...productionTsFiles('libs/**/*.ts'),
]) {
  const source = readFileSync(file, 'utf8');
  if (/\bconsole\.(log|info|warn|error|debug)\s*\(/.test(source)) {
    addViolation(file, 'production code must use structured logging ports/adapters, not console.*');
  }
}

for (const testFile of testFiles) {
  const source = readFileSync(testFile, 'utf8');
  if (/\b(describe|it|test)\.(only|skip)\s*\(/.test(source)) {
    addViolation(testFile, 'committed tests must not use .only or .skip');
  }
}

for (const docFile of globSync('docs/**/*.md')) {
  const source = readFileSync(docFile, 'utf8');
  if (/^-\s+(?:Pending commit\b|Introduced by\b|PR\s+\d+.+\b(?:added|strengthened)\s+in\s+(?:current\s+branch|this\s+(?:quality|implementation)\s+pass)\b)/m.test(source)) {
    addViolation(docFile, 'committed evidence docs must not contain temporary commit evidence markers');
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Code quality guardrails OK');
