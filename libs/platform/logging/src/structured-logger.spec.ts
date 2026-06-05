import { formatLogMessage } from './structured-logger';

describe('formatLogMessage', () => {
  it('formats stable key value fields', () => {
    expect(
      formatLogMessage('worker started', {
        service: 'ingestion-worker',
        retry: 2,
        ready: true,
        omitted: undefined,
      }),
    ).toBe('worker started service=ingestion-worker retry=2 ready=true');
  });
});
