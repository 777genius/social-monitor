import { buildRequestContext } from './request-context';

describe('buildRequestContext', () => {
  const idGenerator = {
    generate: jest.fn(() => 'generated-request-id'),
  };

  beforeEach(() => {
    idGenerator.generate.mockClear();
  });

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
    }, idGenerator);

    expect(context.requestId).toBe('generated-request-id');
    expect(context.correlationId).toBe(context.requestId);
    expect(context.causationId).toBeUndefined();
    expect(idGenerator.generate).toHaveBeenCalledTimes(1);
  });
});
