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

  it('ignores unsafe or oversized context header values', () => {
    const context = buildRequestContext({
      requestId: '   ',
      correlationId: 'contains spaces',
      causationId: 'x'.repeat(129),
    });

    expect(context.requestId).toEqual(expect.any(String));
    expect(context.correlationId).toBe(context.requestId);
    expect(context.causationId).toBeUndefined();
  });
});
