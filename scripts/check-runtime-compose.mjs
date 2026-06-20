import { readFileSync } from 'node:fs';

const compose = readFileSync('docker-compose.yml', 'utf8').replaceAll('\r\n', '\n');
const envExample = readFileSync('.env.example', 'utf8').replaceAll('\r\n', '\n');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const violations = [];

const runtimeServices = [
  ['api', 'api'],
  ['ingestion-worker', 'ingestion'],
  ['intelligence-worker', 'intelligence'],
  ['delivery-service', 'delivery'],
  ['event-relay', 'event-relay'],
];

const migrateBlock = serviceBlock('migrate');
if (migrateBlock.length === 0) {
  violations.push('docker-compose.yml missing runtime service migrate');
} else {
  if (!migrateBlock.includes('SERVICE: api')) {
    violations.push('migrate must build the API image variant used for Prisma migration commands');
  }

  if (!migrateBlock.includes('command: ["npm", "run", "migrate:deploy"]')) {
    violations.push('migrate must run npm run migrate:deploy before app services start');
  }

  if (!migrateBlock.includes('postgres:') || !migrateBlock.includes('condition: service_healthy')) {
    violations.push('migrate must wait for healthy postgres');
  }

  if (!migrateBlock.includes('profiles: ["app"]')) {
    violations.push('migrate must run behind the app profile');
  }
}

for (const [service, npmService] of runtimeServices) {
  const block = serviceBlock(service);

  if (block.length === 0) {
    violations.push(`docker-compose.yml missing runtime service ${service}`);
    continue;
  }

  if (!block.includes('profiles: ["app"]') && !block.includes('<<: *app-common')) {
    violations.push(`${service} must run behind the app profile/common runtime anchor`);
  }

  if (!block.includes(`SERVICE: ${npmService}`)) {
    violations.push(`${service} must pass Docker build arg SERVICE: ${npmService}`);
  }

  const startScript = `start:${npmService}`;
  if (!packageJson.scripts?.[startScript]) {
    violations.push(`package.json missing ${startScript} for runtime service ${service}`);
  }
}

for (const marker of [
  'migrate:',
  'condition: service_completed_successfully',
  'SOCIAL_MONITOR_RUNTIME_PROFILE: beta',
  'MONITORING_PERSISTENCE: prisma',
  'MONITORING_SCAN_QUEUE: rabbitmq',
  'INGESTION_WORKER_PERSISTENCE: prisma',
  'INGESTION_SCAN_QUEUE_READER: rabbitmq',
  'SUMMARY_JOB_QUEUE_MODE: rabbitmq',
  'INTELLIGENCE_SUMMARY_QUEUE_READER: rabbitmq',
  'DELIVERY_ATTEMPT_DISPATCH_QUEUE: rabbitmq',
  'DELIVERY_ATTEMPT_QUEUE_READER: rabbitmq',
  'DELIVERY_ENABLED_CHANNELS: webhook',
  'DELIVERY_WEBHOOK_PROVIDER: http',
  'EVENT_RELAY_LOOP: enabled',
  'RABBITMQ_DEAD_LETTER_EXCHANGE: social-monitor.commands.dlx',
  'RABBITMQ_QUEUE_TYPE: quorum',
  'RABBITMQ_QUEUE_DELIVERY_LIMIT: "20"',
]) {
  if (!compose.includes(marker)) {
    violations.push(`docker-compose.yml missing runtime marker "${marker}"`);
  }
}

for (const marker of [
  'SOCIAL_MONITOR_RUNTIME_PROFILE=local-dev',
  'DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY=',
  'MONITORING_PERSISTENCE=',
  'SUMMARY_JOB_QUEUE_MODE=',
  'INGESTION_SCAN_QUEUE_READER=',
  'INTELLIGENCE_SUMMARY_QUEUE_READER=',
  'DELIVERY_ENABLED_CHANNELS=',
  'DELIVERY_ATTEMPT_QUEUE_READER=',
]) {
  if (!envExample.includes(marker)) {
    violations.push(`.env.example missing runtime marker "${marker}"`);
  }
}

if (!String(packageJson.scripts?.verify ?? '').includes('check:runtime-compose')) {
  violations.push('package.json verify must include check:runtime-compose');
}

if (envExample.includes('SOCIAL_MONITOR_RUNTIME_PROFILE=beta')) {
  violations.push('.env.example must default to local-dev, not beta');
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Runtime compose contract OK');

function serviceBlock(service) {
  const escapedService = service.replaceAll('-', '\\-');
  const match = compose.match(new RegExp(`\\n  ${escapedService}:\\n([\\s\\S]*?)(?=\\n  [a-z0-9-]+:|\\nvolumes:)`));

  return match?.[1] ?? '';
}
