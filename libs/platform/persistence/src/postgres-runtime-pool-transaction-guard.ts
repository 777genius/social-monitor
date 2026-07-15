import { AsyncLocalStorage } from 'node:async_hooks';

const interactiveTransactionRoot = new AsyncLocalStorage<object>();

export function guardRootClientDuringInteractiveTransaction<
  TClient extends object,
>(client: TClient): TClient {
  const proxyCache = new WeakMap<object, object>();

  const guardedObject = (target: object, root: boolean): object => {
    const cached = proxyCache.get(target);
    if (cached !== undefined) {
      return cached;
    }

    const methodCache = new Map<PropertyKey, unknown>();
    const proxy = new Proxy(target, {
      get(currentTarget, property): unknown {
        const cachedMethod = methodCache.get(property);
        if (cachedMethod !== undefined) {
          return cachedMethod;
        }

        const value = Reflect.get(
          currentTarget,
          property,
          currentTarget,
        ) as unknown;
        if (typeof value === 'function') {
          const guardedMethod = (...args: unknown[]): unknown => {
            assertRootClientOutsideInteractiveTransaction(rootClient);
            if (
              root &&
              property === '$transaction' &&
              typeof args[0] === 'function'
            ) {
              const operation = args[0] as (transaction: unknown) => unknown;
              args[0] = (transaction: unknown): unknown =>
                interactiveTransactionRoot.run(rootClient, () =>
                  operation(transaction),
                );
            }
            return Reflect.apply(value, currentTarget, args);
          };
          methodCache.set(property, guardedMethod);
          return guardedMethod;
        }
        if (value !== null && typeof value === 'object') {
          return guardedObject(value, false);
        }
        return value;
      },
    });
    proxyCache.set(target, proxy);
    return proxy;
  };

  const rootClient = guardedObject(client, true) as TClient;
  return rootClient;
}

function assertRootClientOutsideInteractiveTransaction(rootClient: object): void {
  if (interactiveTransactionRoot.getStore() === rootClient) {
    throw new Error(
      'Root Prisma client cannot be used inside an interactive transaction; use the transaction client argument',
    );
  }
}
