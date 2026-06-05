import { buildRequestContext } from './request-context';

describe('buildRequestContext', () => {
  it('uses request id as default correlation id', () => {
    const context = buildRequestContext({ requestId: 'request-1' });

    expect(context).toEqual({
      requestId: 'request-1',
      correlationId: 'request-1',
    });
  });

  it('keeps explicit correlation and causation ids', () => {
    const context = buildRequestContext({
      requestId: 'request-1',
      correlationId: 'correlation-1',
      causationId: 'causation-1',
    });

    expect(context).toEqual({
      requestId: 'request-1',
      correlationId: 'correlation-1',
      causationId: 'causation-1',
    });
  });
});
