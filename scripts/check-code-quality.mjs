import { existsSync, readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { relative } from 'node:path';

const violations = [];

const publicRestControllers = new Set([
  'libs/ingestion/interfaces/rest/source-profile.controller.ts',
]);

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

for (const useCaseFile of globSync('libs/**/features/**/*.use-case.ts')) {
  const specFile = useCaseFile.replace(/\.use-case\.ts$/, '.use-case.spec.ts');
  if (!existsSync(specFile)) {
    addViolation(useCaseFile, `feature use case must have focused unit spec "${relative(process.cwd(), specFile)}"`);
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
  if (publicRestControllers.has(controllerFile)) {
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

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Code quality guardrails OK');
