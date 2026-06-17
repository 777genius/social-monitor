import { readFileSync } from 'node:fs';

const compose = readFileSync('docker-compose.yml', 'utf8').replaceAll('\r\n', '\n');
const envExample = readFileSync('.env.example', 'utf8').replaceAll('\r\n', '\n');

const requiredServices = ['postgres:', 'redis:', 'rabbitmq:', 'kafka:'];
const missingServices = requiredServices.filter((service) => !compose.includes(`  ${service}`));
const violations = [];

if (compose.includes(':latest')) {
  violations.push('docker-compose.yml must not use latest image tags');
}

if (/password\s*=\s*(?!social_monitor_local_password)/i.test(envExample)) {
  violations.push('.env.example must use only documented local placeholder passwords');
}

for (const service of missingServices) {
  violations.push(`docker-compose.yml missing service ${service}`);
}

for (const service of ['postgres', 'redis', 'rabbitmq', 'kafka']) {
  const serviceBlock = getTopLevelServiceBlock(compose, service);
  if (!serviceBlock.includes('healthcheck:')) {
    violations.push(`${service} service must define a healthcheck`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Local infrastructure config OK');

function getTopLevelServiceBlock(source, service) {
  const match = new RegExp(`^  ${service}:\\n`, 'm').exec(source);

  if (!match) {
    return '';
  }

  const start = match.index + match[0].length;
  const next = source.slice(start).search(/\n {2}[a-z0-9-]+:/);

  return next === -1 ? source.slice(start) : source.slice(start, start + next);
}
