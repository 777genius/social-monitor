import { readFileSync } from 'node:fs';

const policySource = readFileSync('libs/identity/ports/workspace-authorization-policy.port.ts', 'utf8');
const envExample = readFileSync('.env.example', 'utf8');
const compose = readFileSync('docker-compose.yml', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const violations = [];

for (const marker of [
  'trustedWorkspaceRoleHeaderEnabled',
  'SOCIAL_MONITOR_RUNTIME_PROFILE',
  "runtimeProfile === 'beta'",
  "nodeEnv === 'staging'",
  "nodeEnv === 'production'",
]) {
  if (!policySource.includes(marker)) {
    violations.push(`workspace role parser missing auth boundary marker "${marker}"`);
  }
}

if (!envExample.includes('TRUSTED_WORKSPACE_ROLE_HEADER=enabled')) {
  violations.push('.env.example must make trusted workspace role headers explicit for local-dev');
}

if (compose.includes('TRUSTED_WORKSPACE_ROLE_HEADER: enabled')) {
  violations.push('docker-compose app beta profile must not enable trusted workspace role headers');
}

if (!String(packageJson.scripts?.verify ?? '').includes('check:auth-boundary')) {
  violations.push('package.json verify must include check:auth-boundary');
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Auth boundary contract OK');
