import { DomainError } from '@social-monitor/shared-kernel';

export const hasBearerAuthorizationHeader = (authorizationHeader: string | undefined): boolean =>
  authorizationHeader !== undefined && authorizationHeader.trim().length > 0;

export const parseBearerToken = (authorizationHeader: string | undefined): string => {
  const [scheme, secret, extra] = authorizationHeader?.trim().split(/\s+/) ?? [];

  if (scheme?.toLowerCase() !== 'bearer' || secret === undefined || extra !== undefined) {
    throw new DomainError('authorization.denied', 'Bearer authorization is required');
  }

  return secret;
};
