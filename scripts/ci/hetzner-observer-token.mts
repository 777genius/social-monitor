import { ClientError, command } from './hetzner-release-client.mjs';
import type { Transport } from './hetzner-release-client.mjs';

export async function configureObserverToken(transport: Transport, token: Buffer): Promise<void> {
  if (token.length < 20 || token.length > 4096
      || !/^[A-Za-z0-9_]+$/u.test(token.toString('ascii'))
      || token.some(byte => byte > 127)) throw new ClientError('observer-token-denied');
  try {
    const result = await transport(command('observer-token'), async function* () { yield token; });
    // Never parse or propagate remote secret-bearing errors/output.
    if (result.code !== 0 || !result.stdout.equals(Buffer.from('{"observer_token":"configured"}\n')))
      throw new ClientError('observer-token-denied');
  } catch {
    throw new ClientError('observer-token-denied');
  }
}
