import { readFileSync } from 'node:fs';

const compose = readFileSync('docker-compose.yml', 'utf8');
const envExample = readFileSync('.env.example', 'utf8');

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
  const serviceBlock = compose.split(`  ${service}:`)[1]?.split(/\n {2}[a-z0-9-]+:/)[0] ?? '';
  if (!serviceBlock.includes('healthcheck:')) {
    violations.push(`${service} service must define a healthcheck`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Local infrastructure config OK');
