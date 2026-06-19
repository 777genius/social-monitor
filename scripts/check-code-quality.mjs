import { existsSync, readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { relative } from 'node:path';

const violations = [];

const publicRestControllers = new Set([
  'libs/ingestion/interfaces/rest/source-profile.controller.ts',
]);

const productionLineBudgets = new Map([
  ['libs/delivery/interfaces/rest/delivery-rest.module.ts', 600],
]);

const directIdentityGenerationAllowedFiles = new Set([
  'libs/shared-kernel/src/id-generator.ts',
]);

const sensitiveRedactionPolicyAllowedFiles = new Set([
  'libs/shared-kernel/src/redaction.ts',
]);

const outboundUrlPolicyAllowedFiles = new Set([
  'libs/shared-kernel/src/outbound-url-policy.ts',
]);

const rabbitMqQueueArgumentAllowedFiles = new Set([
  'libs/platform/queue/src/adapters/rabbitmq/rabbitmq-queue-arguments.ts',
]);

const evidenceProvenanceHelperImport = "from './lib/evidence-provenance.mjs'";
const evidenceProvenanceGuardIgnoredFiles = new Set([
  'scripts/check-code-quality.mjs',
]);
const forbiddenLocalEvidenceProvenancePatterns = [
  /\brequired(?:Deploy)?ArtifactProvenanceFields\b/,
  /\bfixtureArtifactEvidenceKind\b/,
  /\bforbiddenRealProvenanceFragments\b/,
  /\bfunction\s+validateRealProvenanceString\b/,
];

const prismaWritePattern =
  /\b(?:this\.)?prisma\.[A-Za-z0-9_]+\.(?:create|update|upsert|delete|deleteMany|updateMany|createMany)\s*\(/;

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

  if (/throw\s+new\s+Error\s*\(/.test(source)) {
    addViolation(useCaseFile, 'feature use case must return Result failures instead of throwing generic Error');
  }

  if (/\bDate\.now\s*\(/.test(source) || /\bnew\s+Date\s*\(\s*\)/.test(source)) {
    addViolation(useCaseFile, 'feature use case must use injected Clock instead of wall-clock time');
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

  if (/\bNumber\s*\(\s*limitQuery\s*\)/.test(source) || /\bconst\s+parseLimit\s*=/.test(source)) {
    addViolation(controllerFile, 'REST controllers must use parsePaginationLimit helpers for page limits, not ad hoc Number(limitQuery) parsing');
  }

  if (/\.then\s*\(/.test(source)) {
    addViolation(controllerFile, 'REST controllers must use async/await for transport flow instead of promise chains');
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

  const normalized = normalizedPath(file);
  const maxLines = productionLineBudgets.get(normalized) ?? 500;
  const lineCount = source.split('\n').length;
  if (!normalized.includes('/generated/') && lineCount > maxLines) {
    addViolation(file, `production file exceeds ${maxLines} line budget (${lineCount}); split by responsibility before adding features`);
  }

  if (/\brandomUUID\s*\(/.test(source) && !directIdentityGenerationAllowedFiles.has(normalized)) {
    addViolation(file, 'production code must use IdGenerator or RequestCorrelationIdFactory instead of direct randomUUID');
  }

  if (
    /\b(sensitiveKeyPattern|secretKeyPattern|bearerPattern|basicPattern|generatedSecretPattern|urlWithPasswordPattern)\b/.test(source) &&
    !sensitiveRedactionPolicyAllowedFiles.has(normalized)
  ) {
    addViolation(file, 'sensitive redaction patterns must live in shared-kernel redaction helpers, not be duplicated');
  }

  if (
    /\b(blockedHosts|isPrivateIp|isPrivateOrLocalNetworkHost|localhost\.localdomain|169\s*&&\s*second\s*===\s*254)\b/.test(source) &&
    !outboundUrlPolicyAllowedFiles.has(normalized)
  ) {
    addViolation(file, 'outbound URL SSRF policy must live in shared-kernel outbound URL helpers, not be duplicated');
  }
}

for (const file of productionTsFiles('libs/**/interfaces/**/*.ts')) {
  const normalized = normalizedPath(file);
  const isCompositionFile = (
    normalized.endsWith('.module.ts') ||
    normalized.endsWith('-provider-tokens.ts')
  );

  if (isCompositionFile) {
    continue;
  }

  const source = readFileSync(file, 'utf8');
  if (source.includes('process.env')) {
    addViolation(file, 'interface transport/support files must receive env-derived config through provider tokens, not read process.env');
  }
}

for (const file of productionTsFiles('apps/**/src/*.controller.ts')) {
  const source = readFileSync(file, 'utf8');
  if (source.includes('process.env')) {
    addViolation(file, 'app controllers must receive env-derived readiness/config through providers, not read process.env');
  }

  if (/\bDate\.now\s*\(/.test(source) || /\bnew\s+Date\s*\(\s*\)/.test(source)) {
    addViolation(file, 'app controllers must receive Clock-backed timestamps through providers, not read wall-clock time');
  }

  if (/\bprocess\.uptime\s*\(/.test(source)) {
    addViolation(file, 'app controllers must receive uptime through providers, not read process uptime directly');
  }
}

for (const file of [
  ...productionTsFiles('libs/**/adapters/**/*.ts'),
  ...productionTsFiles('libs/platform/queue/**/*.ts'),
]) {
  const source = readFileSync(file, 'utf8');
  if (source.includes('process.env')) {
    addViolation(file, 'adapters must receive runtime configuration explicitly from composition roots, not read process.env');
  }

  if (/\bDate\.now\s*\(/.test(source) || /\bnew\s+Date\s*\(\s*\)/.test(source)) {
    addViolation(file, 'adapters must receive Clock explicitly instead of reading wall-clock time');
  }

  if (/\brandomUUID\s*\(/.test(source)) {
    addViolation(file, 'adapters must receive IdGenerator explicitly instead of generating identities directly');
  }

  if (/\bnew\s+(SystemClock|CryptoIdGenerator)\s*\(/.test(source)) {
    addViolation(file, 'adapters must receive Clock/IdGenerator instances explicitly from composition roots, not create defaults');
  }

  if (/\bawait\s+fetch\s*\(/.test(source) && !source.includes('AbortSignal.timeout')) {
    addViolation(file, 'HTTP adapters must use AbortSignal.timeout for outbound fetch calls');
  }
}

for (const file of [
  ...productionTsFiles('apps/**/*.ts'),
  ...productionTsFiles('libs/**/*.ts'),
]) {
  const normalized = normalizedPath(file);
  const source = readFileSync(file, 'utf8');

  if (
    !rabbitMqQueueArgumentAllowedFiles.has(normalized) &&
    /\bassertQueue\s*\(/.test(source) &&
    /'x-dead-letter-exchange'|'x-queue-type'|'x-delivery-limit'/.test(source) &&
    !source.includes('rabbitMqDurableQueueArguments(')
  ) {
    addViolation(file, 'RabbitMQ queue declarations must use rabbitMqDurableQueueArguments for DLX/quorum arguments');
  }
}

for (const file of productionTsFiles('libs/**/adapters/**/prisma/**/*.ts')) {
  const source = readFileSync(file, 'utf8');

  if (!prismaWritePattern.test(source)) {
    continue;
  }

  if (!source.includes("from '@social-monitor/platform-persistence'")) {
    addViolation(file, 'Prisma persistence writes must use withPrismaWriteRetry from @social-monitor/platform-persistence');
  }

  if (source.includes('$transaction(') && !source.includes("isolationLevel: 'Serializable'")) {
    addViolation(file, 'Prisma write transactions must set Serializable isolation and rely on P2034 retry');
  }
}

for (const file of productionTsFiles('apps/**/src/*loop.ts')) {
  const source = readFileSync(file, 'utf8');
  if (/\bDate\.now\s*\(/.test(source) || /\bnew\s+Date\s*\(\s*\)/.test(source)) {
    addViolation(file, 'worker loops must use injected command id/clock helpers instead of wall-clock time');
  }
}

for (const testFile of testFiles) {
  const source = readFileSync(testFile, 'utf8');
  if (/\b(describe|it|test)\.(only|skip)\s*\(/.test(source)) {
    addViolation(testFile, 'committed tests must not use .only or .skip');
  }
}

for (const file of globSync('scripts/check-*.mjs')) {
  const normalized = normalizedPath(file);
  if (evidenceProvenanceGuardIgnoredFiles.has(normalized)) {
    continue;
  }

  const source = readFileSync(file, 'utf8');
  if (source.includes('provenanceRequirements') && !source.includes(evidenceProvenanceHelperImport)) {
    addViolation(file, 'evidence provenance validators must use scripts/lib/evidence-provenance.mjs instead of local copies');
  }
  for (const pattern of forbiddenLocalEvidenceProvenancePatterns) {
    if (pattern.test(source)) {
      addViolation(file, 'evidence provenance constants and real-string checks must live in scripts/lib/evidence-provenance.mjs');
    }
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
