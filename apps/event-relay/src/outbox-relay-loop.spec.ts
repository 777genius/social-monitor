import { NestStructuredLogger } from '@social-monitor/platform-logging';
import type { OutboxDispatcher } from '@social-monitor/platform-events';

import { OutboxRelayLoop } from './outbox-relay-loop';

describe('OutboxRelayLoop diagnostics', () => {
  afterEach(() => jest.restoreAllMocks());

  it('redacts and bounds broker/adapter errors without leaking credentials', async () => {
    const log = jest.spyOn(NestStructuredLogger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(NestStructuredLogger.prototype, 'info').mockImplementation(() => undefined);
    const secret = ['synthetic', 'secret', 'token'].join('-');
    const dispatchBatch = jest.fn().mockRejectedValue(new Error(
      'Authorization: Bearer ' + secret + '\n' + 'A'.repeat(600),
    ));
    const relay = new OutboxRelayLoop(
      { dispatchBatch } as unknown as OutboxDispatcher,
      { enabled: true, intervalMs: 60_000, limit: 1, runOnStart: true },
    );
    try {
      await relay.onModuleInit();
      expect(dispatchBatch).toHaveBeenCalledWith(1);
      expect(log).toHaveBeenCalledWith('outbox relay loop tick failed',
        expect.objectContaining({ trigger: 'startup', error: expect.any(String) }));
      const context = log.mock.calls[0]?.[1] as { error?: string } | undefined;
      expect(context?.error).toBeDefined();
      expect(context?.error).not.toContain(secret);
      expect(context?.error).not.toMatch(/[\r\n\t]/);
      expect(context?.error?.length).toBeLessThanOrEqual(240);
    } finally {
      await relay.onModuleDestroy();
    }
  });
});
