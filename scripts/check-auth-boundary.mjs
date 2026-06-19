import { readFileSync } from 'node:fs';

const policySource = readFileSync('libs/identity/ports/workspace-authorization-policy.port.ts', 'utf8');
const identityProviderTokens = readFileSync('libs/identity/interfaces/rest/identity-provider-tokens.ts', 'utf8');
const requestAuthorizer = readFileSync('libs/identity/interfaces/rest/api-key-request-authorizer.ts', 'utf8');
const apiKeysController = readFileSync('libs/identity/interfaces/rest/api-keys.controller.ts', 'utf8');
const scanDeadLetterController = readFileSync('libs/ingestion/interfaces/rest/scan-dead-letter.controller.ts', 'utf8');
const userWorkspaceAuthorizer = readFileSync('libs/identity/interfaces/authorization/user-workspace-request.authorizer.ts', 'utf8');
const userAuthModule = readFileSync('libs/identity/interfaces/authorization/identity-user-auth.module.ts', 'utf8');
const usageAuditController = readFileSync('libs/usage/interfaces/rest/public-api-audit-events.controller.ts', 'utf8');
const userTokenVerifier = readFileSync('libs/identity/adapters/authorization/jwks-user-access-token.verifier.ts', 'utf8');
const membershipPort = readFileSync('libs/identity/ports/user-workspace-membership-verifier.port.ts', 'utf8');
const membershipPrisma = readFileSync('libs/identity/adapters/persistence/prisma/prisma-user-workspace-membership.verifier.ts', 'utf8');
const usageAuditPort = readFileSync('libs/usage/ports/public-api-audit-log.port.ts', 'utf8');
const apiGatewayE2eApp = readFileSync('test/e2e/support/api-gateway-e2e-app.ts', 'utf8');
const userJwtAuthBoundaryE2e = readFileSync('test/e2e/user-jwt-auth-boundary.e2e-spec.ts', 'utf8');
const apiKeysUserJwtManagementE2e = readFileSync('test/e2e/api-keys.user-jwt-management.e2e-spec.ts', 'utf8');
const scanDeadLettersAuthorizationE2e = readFileSync('test/e2e/scan-dead-letters.authorization.e2e-spec.ts', 'utf8');
const usageAuditEventsListE2e = readFileSync('test/e2e/usage-audit-events.list.e2e-spec.ts', 'utf8');
const productionAuthBoundaryMatrixE2e = readFileSync('test/e2e/production-auth-boundary-matrix.e2e-spec.ts', 'utf8');
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

for (const marker of [
  'SOCIAL_MONITOR_USER_AUTH_MODE=disabled',
  'SOCIAL_MONITOR_OIDC_ISSUER=',
  'SOCIAL_MONITOR_OIDC_AUDIENCE=',
  'SOCIAL_MONITOR_OIDC_JWKS_JSON=',
]) {
  if (!envExample.includes(marker)) {
    violations.push(`.env.example missing local auth marker "${marker}"`);
  }
}

if (compose.includes('TRUSTED_WORKSPACE_ROLE_HEADER: enabled')) {
  violations.push('docker-compose app beta profile must not enable trusted workspace role headers');
}

if (compose.includes('SOCIAL_MONITOR_USER_AUTH_MODE: disabled')) {
  violations.push('docker-compose app beta profile must not disable user auth');
}

if (!compose.includes('SOCIAL_MONITOR_USER_AUTH_MODE: ${SOCIAL_MONITOR_USER_AUTH_MODE:-oidc-jwt}')) {
  violations.push('docker-compose app beta profile must default to oidc-jwt user auth');
}

for (const marker of [
  'resolveIdentityUserAccessTokenConfig',
  'SOCIAL_MONITOR_USER_AUTH_MODE',
  'oidc-jwt',
  'assertRuntimeProfileAllowsMode',
]) {
  if (!identityProviderTokens.includes(marker)) {
    violations.push(`identity provider tokens missing user auth marker "${marker}"`);
  }
}

for (const marker of [
  'USER_ACCESS_TOKEN_VERIFIER',
  'USER_WORKSPACE_MEMBERSHIP_VERIFIER',
  'WORKSPACE_AUTHORIZATION_POLICY',
  'oidc_jwt',
  "actorType: 'user'",
  "startsWith('smk_')",
  'authorizeUser',
  'Bearer JWT authorization is required',
  'Bearer JWT workspace membership is missing',
  'membershipSource',
]) {
  if (!requestAuthorizer.includes(marker)) {
    violations.push(`api request authorizer missing JWT boundary marker "${marker}"`);
  }
}

for (const marker of [
  'authorizationHeader',
  'hasBearerAuthorizationHeader',
  'authorizeUser',
  "operation: action",
  "actorType: authorization.actorType",
]) {
  if (!apiKeysController.includes(marker)) {
    violations.push(`api key management controller missing user JWT marker "${marker}"`);
  }
}

for (const marker of [
  'UserWorkspaceRequestAuthorizer',
  'USER_ACCESS_TOKEN_VERIFIER',
  'USER_WORKSPACE_MEMBERSHIP_VERIFIER',
  'Bearer JWT authorization is required',
  'Bearer JWT workspace membership is missing',
]) {
  if (!userWorkspaceAuthorizer.includes(marker)) {
    violations.push(`user workspace authorizer missing marker "${marker}"`);
  }
}

for (const marker of [
  'IdentityUserAuthModule',
  'UserWorkspaceRequestAuthorizer',
  'IDENTITY_PRISMA_CLIENT',
  'USER_ACCESS_TOKEN_VERIFIER',
  'USER_WORKSPACE_MEMBERSHIP_VERIFIER',
]) {
  if (!userAuthModule.includes(marker)) {
    violations.push(`identity user auth module missing marker "${marker}"`);
  }
}

for (const marker of [
  'authorizationHeader',
  'hasBearerAuthorizationHeader',
  'authorizeUser',
  "operation: 'scan_dead_letters.read'",
  'Bearer OIDC JWT for production scan dead-letter inspection',
]) {
  if (!scanDeadLetterController.includes(marker)) {
    violations.push(`scan dead-letter controller missing user JWT marker "${marker}"`);
  }
}

for (const marker of [
  'authorizationHeader',
  'hasBearerAuthorizationHeader',
  'UserWorkspaceRequestAuthorizer',
  "operation: 'public_api_audit.read'",
  'Bearer OIDC JWT for production audit event reads',
]) {
  if (!usageAuditController.includes(marker)) {
    violations.push(`usage audit controller missing user JWT marker "${marker}"`);
  }
}

for (const marker of [
  'UserWorkspaceMembershipVerifierPort',
  'USER_WORKSPACE_MEMBERSHIP_VERIFIER',
  'source: UserWorkspaceMembershipSource',
]) {
  if (!membershipPort.includes(marker)) {
    violations.push(`user workspace membership port missing marker "${marker}"`);
  }
}

for (const marker of [
  'this.prisma.membership.findFirst',
  "source: 'durable'",
  'workspaceRoleFromPrisma',
]) {
  if (!membershipPrisma.includes(marker)) {
    violations.push(`Prisma membership verifier missing marker "${marker}"`);
  }
}

for (const marker of [
  'RS256',
  'createPublicKey',
  'verifySignature',
  'Bearer JWT issuer is not trusted',
  'Bearer JWT audience is not allowed',
  'Bearer JWT is expired',
]) {
  if (!userTokenVerifier.includes(marker)) {
    violations.push(`JWKS verifier missing validation marker "${marker}"`);
  }
}

if (!usageAuditPort.includes("'user'")) {
  violations.push('usage audit actor types must include user for JWT-backed public API requests');
}

for (const marker of [
  'createApiGatewayE2eApp',
  'DomainErrorFilter',
  'createApiGatewayValidationPipe',
]) {
  if (!apiGatewayE2eApp.includes(marker)) {
    violations.push(`API gateway e2e app helper missing marker "${marker}"`);
  }
}

for (const [label, source] of [
  ['user JWT auth boundary e2e', userJwtAuthBoundaryE2e],
  ['API key user JWT management e2e', apiKeysUserJwtManagementE2e],
  ['scan dead-letter authorization e2e', scanDeadLettersAuthorizationE2e],
  ['usage audit events list e2e', usageAuditEventsListE2e],
  ['production auth boundary matrix e2e', productionAuthBoundaryMatrixE2e],
]) {
  if (!source.includes('createApiGatewayE2eApp')) {
    violations.push(`${label} must use shared API gateway e2e app bootstrap`);
  }
}

if (!String(packageJson.scripts?.verify ?? '').includes('check:auth-boundary')) {
  violations.push('package.json verify must include check:auth-boundary');
}

if (!String(packageJson.scripts?.['check:user-auth-boundary'] ?? '').includes('user-jwt-auth-boundary.e2e-spec.ts')) {
  violations.push('package.json missing check:user-auth-boundary JWT e2e guard');
}

if (!String(packageJson.scripts?.['check:user-auth-boundary'] ?? '').includes('api-keys.user-jwt-management.e2e-spec.ts')) {
  violations.push('package.json missing check:user-auth-boundary API key user JWT e2e guard');
}

if (!String(packageJson.scripts?.['check:user-auth-boundary'] ?? '').includes('scan-dead-letters.authorization.e2e-spec.ts')) {
  violations.push('package.json missing check:user-auth-boundary scan dead-letter user JWT e2e guard');
}

if (!String(packageJson.scripts?.['check:user-auth-boundary'] ?? '').includes('usage-audit-events.list.e2e-spec.ts')) {
  violations.push('package.json missing check:user-auth-boundary usage audit user JWT e2e guard');
}

if (!String(packageJson.scripts?.verify ?? '').includes('check:user-auth-boundary')) {
  violations.push('package.json verify must include check:user-auth-boundary');
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Auth boundary contract OK');
