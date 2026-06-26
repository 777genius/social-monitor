import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SourceCredential } from '../../domain';
import { OAuth2SourceCredentialRefresher } from './oauth2-source-credential-refresher';

describe('OAuth2SourceCredentialRefresher', () => {
  it('rejects private token URLs before making outbound refresh requests', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        throw new Error('fetch must not be called for rejected token URLs');
      });
    const refresher = new OAuth2SourceCredentialRefresher({ refreshSkewMs: 60_000 });

    await expect(refresher.refreshIfNeeded({
      credential: makeExpiredCredential(),
      secret: {
        refreshToken: 'permanent-refresh-token',
        tokenUrl: 'http://127.0.0.1:8080/token',
        clientId: 'reddit-client-id',
      },
      now: new Date('2026-06-21T10:00:00.000Z'),
    })).rejects.toThrow('OAuth2 source credential token URL rejected');

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('redacts JSON and plain token-like fields from failed token responses', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      '{"error":"invalid_grant","access_token":"json-access"} refresh_token=plain-refresh Bearer token-value',
      { status: 401 },
    ));
    const refresher = new OAuth2SourceCredentialRefresher({ refreshSkewMs: 60_000 });

    let message = '';
    try {
      await refresher.refreshIfNeeded({
        credential: makeExpiredCredential(),
        secret: {
          refreshToken: 'permanent-refresh-token',
          tokenUrl: 'https://oauth.example.test/token',
          clientId: 'reddit-client-id',
        },
        now: new Date('2026-06-21T10:00:00.000Z'),
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('"access_token":"[REDACTED]"');
    expect(message).not.toContain('json-access');
    expect(message).not.toContain('plain-refresh');
    expect(message).not.toContain('token-value');

    fetchSpy.mockRestore();
  });
});

const makeExpiredCredential = (): SourceCredential =>
  SourceCredential.create({
    id: 'source-credential-oauth2-refresher-test',
    tenantId: tenantId('tenant-oauth2-refresher-test'),
    workspaceId: workspaceId('workspace-oauth2-refresher-test'),
    providerKey: 'reddit',
    kind: 'oauth2',
    secretKeyId: 'source-credential-secret-test',
    secretPreview: 'reddit-client',
    scopes: ['read'],
    expiresAt: new Date('2026-06-21T09:59:00.000Z'),
    createdAt: new Date('2026-06-21T09:00:00.000Z'),
  });
