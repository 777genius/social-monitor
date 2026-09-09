'use strict';
// A bounded zero-elapsed host, deliberately NOT a historical event scheduler.
// A timer-dependent await stops the arm. No wall timer advances editorial time.
const { setImmediate: flush } = require('node:timers/promises');
function replayHost() {
  let sequence = 0, closed = false;
  const immediates = new Map(), timers = new Map(), trace = [];
  function schedule(kind, callback, ms, args) {
    if (closed) throw Error('replay_host_closed');
    if (typeof callback !== 'function' || !Number.isSafeInteger(ms) || ms < 0) throw Error('unsupported_host_timer');
    const id = ++sequence;
    let referenced = true;
    const handle = { ref() { referenced = true; return handle; }, unref() { referenced = false; return handle; }, hasRef() { return referenced; } };
    const entry = { id, callback, args, ms };
    (kind === 'immediate' ? immediates : timers).set(handle, entry);
    trace.push({ action: 'scheduled', kind, id, ms });
    return handle;
  }
  const timeout = (fn, ms, ...args) => schedule('timeout', fn, ms, args);
  class ControlledAbortSignal {
    static timeout(ms) {
      const controller = new AbortController();
      timeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), ms).unref();
      return controller.signal;
    }
    static any(signals) { return AbortSignal.any(signals); }
    static abort(reason) { return AbortSignal.abort(reason); }
  }
  return {
    globals: { AbortController, AbortSignal: ControlledAbortSignal, structuredClone,
      Buffer, setTimeout: timeout, clearTimeout: handle => timers.delete(handle),
      setImmediate: (fn, ...args) => schedule('immediate', fn, 0, args),
      clearImmediate: handle => immediates.delete(handle) },
    async run(operation) {
      let settled = false, rejected = false, value, error;
      Promise.resolve(operation).then(result => { value = result; settled = true; }, failure => { error = failure; rejected = true; settled = true; });
      for (let step = 0; step < 256; step++) {
        // Node's check phase is only a microtask barrier, never an elapsed clock.
        await flush();
        if (immediates.size) {
          const entries = [...immediates];
          for (const [handle, entry] of entries) {
            if (!immediates.delete(handle)) continue;
            trace.push({ action: 'fired', kind: 'immediate', id: entry.id, ms: 0 });
            entry.callback(...entry.args);
            // Native Node drains microtasks between individual immediate callbacks.
            // A complete check-phase barrier also drains nested Promise reactions.
            await flush();
          }
          continue;
        }
        if (settled) { if (rejected) throw error; return value; }
        // No permitted pending operation can need an external event here.
        throw Error('precise_timing_replay_required');
      }
      throw Error('replay_host_step_cap');
    },
    report: () => ({ semantics: 'controlled_zero_elapsed_microtasks_then_immediates',
      historicalTimingVerified: false, pendingTimers: [...timers.values()].map(({ id, ms }) => ({ id, ms })), trace }),
    close() { closed = true; timers.clear(); immediates.clear(); },
  };
}
module.exports = { replayHost };
