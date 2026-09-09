'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { replayHost } = require('./replay-host.cjs');
test('microtasks settle before shadow immediates; unref does not suppress observation', async () => {
  const host = replayHost(), order = [];
  const promise = Promise.resolve().then(() => {
    order.push('microtask'); host.globals.setImmediate(() => order.push('shadow')).unref(); return 12;
  });
  assert.equal(await host.run(promise), 12);
  assert.deepEqual(order, ['microtask', 'shadow']); host.close();
});
test('timeout-dependent awaits require precise timing; no wall timeout fires', async () => {
  const host = replayHost(); let fired = false;
  const pending = new Promise(resolve => host.globals.setTimeout(() => { fired = true; resolve(); }, 1));
  await assert.rejects(host.run(pending), /precise_timing_replay_required/);
  assert.equal(fired, false); assert.equal(host.report().pendingTimers.length, 1); host.close();
});
test('clearImmediate, clearTimeout and abort propagation retain required host behavior', async () => {
  const host = replayHost(), controller = new AbortController(); let calls = 0;
  const timer = host.globals.setTimeout(() => calls++, 3);
  const immediate = host.globals.setImmediate(() => calls++);
  host.globals.clearTimeout(timer); host.globals.clearImmediate(immediate);
  const signal = host.globals.AbortSignal.any([controller.signal, host.globals.AbortSignal.timeout(10)]);
  controller.abort(); assert.equal(signal.aborted, true);
  await host.run(Promise.resolve()); assert.equal(calls, 0); host.close();
});

test('immediate microtasks can cancel the next callback, matching the native host', async () => {
  async function exercise(schedule, cancel, drain) {
    const order = [];
    let second;
    schedule(() => {
      order.push('first');
      Promise.resolve().then(() => Promise.resolve()).then(() => {
        order.push('nested microtask'); cancel(second);
        schedule(() => order.push('next turn'));
      });
    });
    second = schedule(() => order.push('cancelled'));
    await drain();
    return order;
  }
  const barrier = require('node:timers/promises').setImmediate;
  const native = await exercise(setImmediate, clearImmediate, async () => {
    await barrier(); await barrier(); await barrier();
  });
  const host = replayHost();
  try {
    const replay = await exercise(host.globals.setImmediate, host.globals.clearImmediate,
      () => host.run(Promise.resolve()));
    assert.deepEqual(native, ['first', 'nested microtask', 'next turn']);
    assert.deepEqual(replay, native);
  } finally { host.close(); }
});
test('falsy rejection reasons never become successful replay results', async () => {
  for (const reason of [undefined, null, false, 0, '']) {
    const host = replayHost();
    try {
      const outcome = await host.run(Promise.reject(reason)).then(
        () => ({ rejected: false }), error => ({ rejected: true, error }));
      assert.deepEqual(outcome, { rejected: true, error: reason });
    } finally { host.close(); }
  }
});
