import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
export async function writeExclusive(path:string,value:unknown):Promise<void>{const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await file.writeFile(JSON.stringify(value)+'\n');await file.sync();}finally{await file.close();}}
export function noRetryGitHubArchiveTransaction<T extends object>(client: T): T {
  let refusal: Error | undefined;
  const cache = new WeakMap<object, object>();
  const wrap = (target: object): object => {
    const cached = cache.get(target);
    if (cached) return cached;
    const proxy = new Proxy(target, { get(current, property) {
      const value: unknown = Reflect.get(current, property);
      if (typeof value === "function") return async (...args: unknown[]): Promise<unknown> => {
        if (refusal !== undefined) throw refusal;
        try { return await Reflect.apply(value, current, args) as unknown; }
        catch (originalError) {
          if (refusal === undefined) {
            refusal = new Error("Finite RSS DB operation failed; no retry; journal remains started");
            // Keep reconciliation private: cause/code/message can activate inherited conflict retries.
            Object.defineProperties(refusal, {
              originalError: { value: originalError, enumerable: false, writable: false, configurable: false },
              retryable: { value: false, enumerable: false, writable: false, configurable: false },
            });
          }
          throw refusal;
        }
      };
      return value !== null && typeof value === "object" ? wrap(value) : value;
    } });
    cache.set(target, proxy);
    return proxy;
  };
  return wrap(client) as T;
}
