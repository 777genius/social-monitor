import { resolveXCollectorRuntimeConfig } from './x-collector-runtime-config';

describe('resolveXCollectorRuntimeConfig', () => {
  const enabled = {
    X_COLLECTOR_ENABLED: '1',
    X_COLLECTOR_GRPC_ADDRESS: ' x-collector.test:50051 ',
  };

  it('allows a bounded multi-pass collection to finish beyond one minute', () => {
    expect(resolveXCollectorRuntimeConfig(enabled)).toEqual({
      address: 'x-collector.test:50051',
      timeoutMs: 180_000,
      serviceToken: undefined,
    });
  });

  it.each(['', ' ', '0', '-1', '1.5', 'invalid', 'Infinity'])(
    'uses the bounded default for invalid timeout %j',
    (timeout) => {
      expect(resolveXCollectorRuntimeConfig({
        ...enabled,
        X_COLLECTOR_GRPC_TIMEOUT_MS: timeout,
      })?.timeoutMs).toBe(180_000);
    },
  );

  it.each(['60000', '240000'])(
    'preserves an explicitly configured timeout %s',
    (timeout) => {
      expect(resolveXCollectorRuntimeConfig({
        ...enabled,
        X_COLLECTOR_GRPC_TIMEOUT_MS: timeout,
      })?.timeoutMs).toBe(Number(timeout));
    },
  );

  it('keeps a disabled or unaddressed collector disabled', () => {
    expect(resolveXCollectorRuntimeConfig({})).toBeNull();
    expect(resolveXCollectorRuntimeConfig({
      X_COLLECTOR_ENABLED: '1',
    })).toBeNull();
    expect(resolveXCollectorRuntimeConfig({
      X_COLLECTOR_GRPC_ADDRESS: 'x-collector.test:50051',
    })).toBeNull();
  });

  it('uses the same default for the existing experimental enable flag', () => {
    expect(resolveXCollectorRuntimeConfig({
      X_COLLECTOR_EXPERIMENTAL_ENABLED: '1',
      X_COLLECTOR_GRPC_ADDRESS: 'x-collector.test:50051',
    })?.timeoutMs).toBe(180_000);
  });
});
