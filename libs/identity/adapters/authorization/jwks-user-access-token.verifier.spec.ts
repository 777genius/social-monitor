import {
  generateKeyPairSync,
  sign as signToken,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';

import { FixedClock, type DomainError } from '@social-monitor/shared-kernel';

import { JwksUserAccessTokenVerifier, type JwksDocument } from './jwks-user-access-token.verifier';

const issuer = 'https://auth.example.test';
const audience = 'social-monitor-api';
const now = new Date('2026-06-18T00:00:00.000Z');
const clock = new FixedClock(now);

describe('JwksUserAccessTokenVerifier', () => {
  const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = {
    ...(keyPair.publicKey.export({ format: 'jwk' }) as JsonWebKey),
    kid: 'test-key',
    alg: 'RS256',
    use: 'sig',
  };
  const jwks: JwksDocument = { keys: [publicJwk] };

  it('verifies an RS256 JWT and maps workspace claims', async () => {
    const verifier = new JwksUserAccessTokenVerifier({ issuer, audience, jwks }, clock);
    const token = createJwt(keyPair.privateKey, {
      sub: 'user-1',
      iss: issuer,
      aud: [audience, 'other-service'],
      exp: futureSeconds(60),
      tenant_id: 'tenant-1',
      workspace_id: 'workspace-1',
      workspace_roles: ['admin', 'ignored'],
      jti: 'jwt-1',
    });

    await expect(verifier.verify(token)).resolves.toMatchObject({
      subject: 'user-1',
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
      roles: ['admin'],
      issuer,
      audience: [audience, 'other-service'],
      tokenId: 'jwt-1',
    });
  });

  it('rejects JWTs for the wrong audience', async () => {
    const verifier = new JwksUserAccessTokenVerifier({ issuer, audience, jwks }, clock);
    const token = createJwt(keyPair.privateKey, {
      sub: 'user-1',
      iss: issuer,
      aud: 'other-service',
      exp: futureSeconds(60),
      tenant_id: 'tenant-1',
      workspace_id: 'workspace-1',
      workspace_roles: ['admin'],
    });

    await expect(verifier.verify(token)).rejects.toMatchObject<Partial<DomainError>>({
      code: 'authorization.denied',
      message: 'Bearer JWT audience is not allowed',
    });
  });

  it('allows JWTs without workspace roles so durable membership can decide authorization', async () => {
    const verifier = new JwksUserAccessTokenVerifier({ issuer, audience, jwks }, clock);
    const token = createJwt(keyPair.privateKey, {
      sub: 'user-1',
      iss: issuer,
      aud: audience,
      exp: futureSeconds(60),
      tenant_id: 'tenant-1',
      workspace_id: 'workspace-1',
    });

    await expect(verifier.verify(token)).resolves.toMatchObject({
      subject: 'user-1',
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
      roles: [],
    });
  });

  it('rejects expired JWTs', async () => {
    const verifier = new JwksUserAccessTokenVerifier({
      issuer,
      audience,
      jwks,
      clockToleranceSeconds: 0,
    }, clock);
    const token = createJwt(keyPair.privateKey, {
      sub: 'user-1',
      iss: issuer,
      aud: audience,
      exp: futureSeconds(-1),
      tenant_id: 'tenant-1',
      workspace_id: 'workspace-1',
      workspace_roles: ['admin'],
    });

    await expect(verifier.verify(token)).rejects.toMatchObject<Partial<DomainError>>({
      code: 'authorization.denied',
      message: 'Bearer JWT is expired',
    });
  });

  it('rejects JWTs with tampered signatures', async () => {
    const verifier = new JwksUserAccessTokenVerifier({ issuer, audience, jwks }, clock);
    const claims = {
      sub: 'user-1',
      iss: issuer,
      aud: audience,
      exp: futureSeconds(60),
      tenant_id: 'tenant-1',
      workspace_id: 'workspace-1',
      workspace_roles: ['admin'],
    };
    const token = createJwt(keyPair.privateKey, claims);
    const [encodedHeader, , encodedSignature] = token.split('.');
    const tampered = `${encodedHeader}.${encodeJson({ ...claims, sub: 'user-2' })}.${encodedSignature}`;

    await expect(verifier.verify(tampered)).rejects.toMatchObject<Partial<DomainError>>({
      code: 'authorization.denied',
      message: 'Bearer JWT signature is invalid',
    });
  });
});

const createJwt = (
  privateKey: KeyObject,
  claims: Readonly<Record<string, unknown>>,
): string => {
  const encodedHeader = encodeJson({
    alg: 'RS256',
    typ: 'JWT',
    kid: 'test-key',
  });
  const encodedPayload = encodeJson(claims);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signToken(
    'RSA-SHA256',
    Buffer.from(signingInput, 'ascii'),
    privateKey,
  ).toString('base64url');

  return `${signingInput}.${signature}`;
};

const encodeJson = (value: Readonly<Record<string, unknown>>): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const futureSeconds = (offsetSeconds: number): number =>
  Math.floor(now.getTime() / 1000) + offsetSeconds;
