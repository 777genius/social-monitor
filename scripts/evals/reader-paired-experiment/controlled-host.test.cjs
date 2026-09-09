'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { replayHost } = require('./replay-host.cjs');

test('controlled detached parser work settles without changing the foreground result', async () => {
  const host = replayHost(), order = [];
  try {
    const selection = { selected: ['foreground'] };
    host.globals.setImmediate(() => {
      host.track('shadow:parser', async () => {
        order.push('shadow response');
        await Promise.resolve();
        order.push('shadow parsed');
      });
    }).unref();
    host.globals.AbortSignal.timeout(100);
    const actual = await host.run(Promise.resolve(selection), { requireQuiescence: true });
    assert.equal(actual, selection);
    assert.deepEqual(order, ['shadow response', 'shadow parsed']);
    assert.equal(host.quiescence().settled, true);
    assert.equal(host.report().pendingTimers.length, 1);
  } finally { host.close(); }
});

test('foreground completion and unused timers cannot hide a pending shadow parser', async () => {
  const host = replayHost();
  let finish;
  try {
    host.globals.AbortSignal.timeout(100);
    const shadow = host.track('shadow:relation-parser', () => new Promise(resolve => { finish = resolve; }));
    await assert.rejects(host.run(Promise.resolve('selected'), { requireQuiescence: true }), /controlled_operation_unfinished/);
    assert.deepEqual(host.quiescence().outstanding, [{ id: 1, label: 'shadow:relation-parser' }]);
    assert.equal(host.quiescence().settled, false);
    assert.ok(host.report().trace.every(entry => entry.action !== 'fired'));
    finish(); await shadow;
    assert.equal(host.quiescence().settled, true);
  } finally { host.close(); }
});

test('caught detached parser failure stays sticky and concurrent operation bindings remain separate', async () => {
  const host = replayHost();
  let finish;
  try {
    const foreground = host.track('foreground:assessment', () => new Promise(resolve => { finish = resolve; }));
    const shadow = host.track('shadow:relation', async () => { throw Error('malformed'); }).catch(() => []);
    await shadow;
    assert.deepEqual(host.quiescence().outstanding, [{ id: 1, label: 'foreground:assessment' }]);
    assert.deepEqual(host.quiescence().failedOperations, [{ id: 2, label: 'shadow:relation' }]);
    finish('parsed'); assert.equal(await foreground, 'parsed');
    await assert.rejects(host.run(Promise.resolve('selected'), { requireQuiescence: true }), /controlled_operation_failed/);
    assert.equal(host.quiescence().settled, false);
    // Historical/default behavior is unchanged; its completion contract is
    // separate and does not opt in to controlled operation certification.
    assert.equal(await host.run(Promise.resolve('selected')), 'selected');
  } finally { host.close(); }
});

test('closed hosts reject new operation ownership', () => {
  const host = replayHost(); host.close();
  assert.throws(() => host.track('late', () => 1), /replay_host_closed/);
});
