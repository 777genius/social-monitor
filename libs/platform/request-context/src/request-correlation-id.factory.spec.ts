import { RequestCorrelationIdFactory, resolveRequestCorrelationId } from './request-correlation-id.factory';

describe('resolveRequestCorrelationId', () => {
  const idGenerator = {
    generate: jest.fn(() => 'generated-correlation-id'),
  };

  beforeEach(() => {
    idGenerator.generate.mockClear();
  });

  it('uses a normalized request id when the header is safe', () => {
    expect(resolveRequestCorrelationId(' request-1 ', idGenerator)).toBe('request-1');
    expect(idGenerator.generate).not.toHaveBeenCalled();
  });

  it('generates a fallback id when the request id header is unsafe', () => {
    expect(resolveRequestCorrelationId('contains spaces', idGenerator)).toBe('generated-correlation-id');
    expect(idGenerator.generate).toHaveBeenCalledTimes(1);
  });
});

describe('RequestCorrelationIdFactory', () => {
  it('uses the injected id generator for fallback correlation ids', () => {
    const idGenerator = {
      generate: jest.fn(() => 'generated-correlation-id'),
    };
    const factory = new RequestCorrelationIdFactory(idGenerator);

    expect(factory.fromRequestId(undefined)).toBe('generated-correlation-id');
    expect(idGenerator.generate).toHaveBeenCalledTimes(1);
  });
});
