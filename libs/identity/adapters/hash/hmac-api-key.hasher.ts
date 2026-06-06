import { createHash, timingSafeEqual } from 'node:crypto';

import type { ApiKeyHasherPort } from '../../ports';

export class Sha256ApiKeyHasher implements ApiKeyHasherPort {
  async hash(secret: string): Promise<string> {
    return createHash('sha256').update(secret).digest('hex');
  }

  async verify(params: { readonly secret: string; readonly hash: string }): Promise<boolean> {
    const candidate = await this.hash(params.secret);
    const candidateBuffer = Buffer.from(candidate, 'utf8');
    const hashBuffer = Buffer.from(params.hash, 'utf8');

    if (candidateBuffer.length !== hashBuffer.length) {
      return false;
    }

    return timingSafeEqual(candidateBuffer, hashBuffer);
  }
}
