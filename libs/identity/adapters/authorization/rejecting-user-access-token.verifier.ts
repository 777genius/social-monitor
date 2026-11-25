import { DomainError } from '@social-monitor/shared-kernel';

import type { UserAccessTokenPrincipal, UserAccessTokenVerifierPort } from '../../ports';

export class RejectingUserAccessTokenVerifier implements UserAccessTokenVerifierPort {
  async verify(): Promise<UserAccessTokenPrincipal> {
    throw new DomainError('authorization.denied', 'Bearer JWT authentication is disabled');
  }
}
