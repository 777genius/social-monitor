import {
  createPublicKey,
  verify as verifySignature,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';

import {
  type Clock,
  DomainError,
  tenantId,
  userId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import type {
  UserAccessTokenPrincipal,
  UserAccessTokenVerifierPort,
  WorkspaceRole,
} from '../../ports';

type JwtHeader = {
  readonly alg?: unknown;
  readonly kid?: unknown;
  readonly typ?: unknown;
};

type JwtClaims = Readonly<Record<string, unknown>>;

export type JwksKey = JsonWebKey & {
  readonly kid?: string;
  readonly alg?: string;
  readonly use?: string;
};

export type JwksDocument = {
  readonly keys: readonly JwksKey[];
};

export type JwksUserAccessTokenVerifierConfig = {
  readonly issuer: string;
  readonly audience: string;
  readonly jwks: JwksDocument;
  readonly clockToleranceSeconds?: number;
  readonly subjectClaim?: string;
  readonly tenantIdClaim?: string;
  readonly workspaceIdClaim?: string;
  readonly rolesClaim?: string;
};

type JwtSegments = {
  readonly encodedHeader: string;
  readonly encodedPayload: string;
  readonly encodedSignature: string;
};

const supportedAlgorithm = 'RS256';
const workspaceRoles = new Set<WorkspaceRole>(['owner', 'admin', 'member', 'viewer']);

export class JwksUserAccessTokenVerifier implements UserAccessTokenVerifierPort {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwks: JwksDocument;
  private readonly clockToleranceSeconds: number;
  private readonly subjectClaim: string;
  private readonly tenantIdClaim: string;
  private readonly workspaceIdClaim: string;
  private readonly rolesClaim: string;

  constructor(
    config: JwksUserAccessTokenVerifierConfig,
    private readonly clock: Clock,
  ) {
    this.issuer = requireNonEmptyConfig(config.issuer, 'SOCIAL_MONITOR_OIDC_ISSUER');
    this.audience = requireNonEmptyConfig(config.audience, 'SOCIAL_MONITOR_OIDC_AUDIENCE');
    this.jwks = requireJwks(config.jwks);
    this.clockToleranceSeconds = config.clockToleranceSeconds ?? 30;
    this.subjectClaim = config.subjectClaim ?? 'sub';
    this.tenantIdClaim = config.tenantIdClaim ?? 'tenant_id';
    this.workspaceIdClaim = config.workspaceIdClaim ?? 'workspace_id';
    this.rolesClaim = config.rolesClaim ?? 'workspace_roles';
  }

  async verify(token: string): Promise<UserAccessTokenPrincipal> {
    const segments = parseJwtSegments(token);
    const header = parseJwtHeader(segments.encodedHeader);

    if (header.alg !== supportedAlgorithm) {
      throw new DomainError('authorization.denied', 'Bearer JWT algorithm is not supported');
    }

    const publicKey = this.selectPublicKey(header);
    const signatureValid = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${segments.encodedHeader}.${segments.encodedPayload}`, 'ascii'),
      publicKey,
      decodeBase64Url(segments.encodedSignature),
    );

    if (!signatureValid) {
      throw new DomainError('authorization.denied', 'Bearer JWT signature is invalid');
    }

    const claims = parseJwtClaims(segments.encodedPayload);
    this.assertRegisteredClaims(claims);

    const roles = normalizeWorkspaceRoles(claims[this.rolesClaim]);

    if (roles.length === 0) {
      throw new DomainError('authorization.denied', 'Bearer JWT workspace role is required');
    }

    return {
      subject: userId(requireStringClaim(claims, this.subjectClaim)),
      tenantId: tenantId(requireStringClaim(claims, this.tenantIdClaim)),
      workspaceId: workspaceId(requireStringClaim(claims, this.workspaceIdClaim)),
      roles,
      issuer: this.issuer,
      audience: normalizeAudience(claims.aud),
      tokenId: optionalStringClaim(claims, 'jti'),
    };
  }

  private selectPublicKey(header: JwtHeader): KeyObject {
    const kid = typeof header.kid === 'string' ? header.kid : undefined;
    const candidates = this.jwks.keys.filter((key) => {
      if (key.kty !== 'RSA') {
        return false;
      }

      if (key.use !== undefined && key.use !== 'sig') {
        return false;
      }

      if (key.alg !== undefined && key.alg !== supportedAlgorithm) {
        return false;
      }

      return kid === undefined ? this.jwks.keys.length === 1 : key.kid === kid;
    });

    const candidate = candidates[0];

    if (candidates.length !== 1 || candidate === undefined) {
      throw new DomainError('authorization.denied', 'Bearer JWT signing key is not trusted');
    }

    return createPublicKey({ key: candidate, format: 'jwk' });
  }

  private assertRegisteredClaims(claims: JwtClaims): void {
    if (claims.iss !== this.issuer) {
      throw new DomainError('authorization.denied', 'Bearer JWT issuer is not trusted');
    }

    if (!normalizeAudience(claims.aud).includes(this.audience)) {
      throw new DomainError('authorization.denied', 'Bearer JWT audience is not allowed');
    }

    const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
    const exp = requireNumericClaim(claims, 'exp');

    if (exp <= nowSeconds - this.clockToleranceSeconds) {
      throw new DomainError('authorization.denied', 'Bearer JWT is expired');
    }

    const nbf = optionalNumericClaim(claims, 'nbf');

    if (nbf !== undefined && nbf > nowSeconds + this.clockToleranceSeconds) {
      throw new DomainError('authorization.denied', 'Bearer JWT is not active yet');
    }

    const iat = optionalNumericClaim(claims, 'iat');

    if (iat !== undefined && iat > nowSeconds + this.clockToleranceSeconds) {
      throw new DomainError('authorization.denied', 'Bearer JWT issued-at claim is in the future');
    }
  }
}

const requireNonEmptyConfig = (value: string, name: string): string => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error(`${name} must be non-empty when SOCIAL_MONITOR_USER_AUTH_MODE=oidc-jwt`);
  }

  return trimmed;
};

const requireJwks = (jwks: JwksDocument): JwksDocument => {
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
    throw new Error('SOCIAL_MONITOR_OIDC_JWKS_JSON must include at least one signing key');
  }

  return jwks;
};

const parseJwtSegments = (token: string): JwtSegments => {
  const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split('.');

  if (
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    encodedSignature === undefined ||
    extra !== undefined ||
    encodedHeader.length === 0 ||
    encodedPayload.length === 0 ||
    encodedSignature.length === 0
  ) {
    throw new DomainError('authorization.denied', 'Bearer JWT is malformed');
  }

  return {
    encodedHeader,
    encodedPayload,
    encodedSignature,
  };
};

const parseJwtHeader = (encodedHeader: string): JwtHeader => {
  const header = parseBase64UrlJson(encodedHeader, 'Bearer JWT header is malformed');

  if (header === null || typeof header !== 'object' || Array.isArray(header)) {
    throw new DomainError('authorization.denied', 'Bearer JWT header is malformed');
  }

  return header as JwtHeader;
};

const parseJwtClaims = (encodedPayload: string): JwtClaims => {
  const claims = parseBase64UrlJson(encodedPayload, 'Bearer JWT claims are malformed');

  if (claims === null || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new DomainError('authorization.denied', 'Bearer JWT claims are malformed');
  }

  return claims as JwtClaims;
};

const parseBase64UrlJson = (value: string, errorMessage: string): unknown => {
  try {
    return JSON.parse(decodeBase64Url(value).toString('utf8')) as unknown;
  } catch {
    throw new DomainError('authorization.denied', errorMessage);
  }
};

const decodeBase64Url = (value: string): Buffer => {
  try {
    return Buffer.from(value, 'base64url');
  } catch {
    throw new DomainError('authorization.denied', 'Bearer JWT encoding is malformed');
  }
};

const requireStringClaim = (claims: JwtClaims, claimName: string): string => {
  const value = claims[claimName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError('authorization.denied', `Bearer JWT ${claimName} claim is required`);
  }

  return value;
};

const optionalStringClaim = (claims: JwtClaims, claimName: string): string | undefined => {
  const value = claims[claimName];

  if (value === undefined) {
    return undefined;
  }

  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
};

const requireNumericClaim = (claims: JwtClaims, claimName: string): number => {
  const value = claims[claimName];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DomainError('authorization.denied', `Bearer JWT ${claimName} claim is required`);
  }

  return value;
};

const optionalNumericClaim = (claims: JwtClaims, claimName: string): number | undefined => {
  const value = claims[claimName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DomainError('authorization.denied', `Bearer JWT ${claimName} claim must be numeric`);
  }

  return value;
};

const normalizeAudience = (audience: unknown): readonly string[] => {
  if (typeof audience === 'string' && audience.trim().length > 0) {
    return [audience];
  }

  if (Array.isArray(audience)) {
    return audience
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());
  }

  return [];
};

const normalizeWorkspaceRoles = (roles: unknown): readonly WorkspaceRole[] => {
  const rawRoles = Array.isArray(roles)
    ? roles
    : typeof roles === 'string'
      ? roles.split(/[,\s]+/)
      : [];

  return [...new Set(rawRoles
    .filter((role): role is string => typeof role === 'string')
    .map((role) => role.trim().toLowerCase())
    .filter((role): role is WorkspaceRole => workspaceRoles.has(role as WorkspaceRole)))]
    .sort((left, right) => left.localeCompare(right));
};
