// Local promise receipts only: abort and disposal never attest remote/descendant termination.
export function createAssessmentCliLifecycle({
  now = () => globalThis.performance.now(), wallNow = () => Date.now(), timers = globalThis,
  signals = process, parentDeadline, reserveMs = 20_000, settlementMs = 5_000,
  disposalMs = 11_000, marginMs = 4_000, mark = () => {},
} = {}) {
  const entered = now();
  const transported = Number(parentDeadline);
  let deadline = Number.isFinite(transported) && transported > 0
    ? entered + Math.max(0, transported - wallNow()) : Infinity;
  const controller = new AbortController();
  const pending = new Set();
  let worker, timeout, cleanup, disposal, disposalReceipt, invocation;
  let enabled = deadline !== Infinity, cliSettled = false, finished = false;
  let cancelledAt;
  let notifyCancellation;
  const cancellation = new Promise((resolve) => { notifyCancellation = resolve; });
  const remaining = () => Math.max(0, deadline - now());
  const release = () => {
    if (!finished || !cliSettled || pending.size || (disposal && !disposalReceipt)) return;
    timers.clearTimeout(timeout);
    signals.removeListener("SIGTERM", onSignal);
    signals.removeListener("SIGINT", onSignal);
  };
  const cancel = () => {
    if (controller.signal.aborted) return;
    cancelledAt = now();
    controller.abort();
    if (enabled) mark("cancellation", "observed");
    notifyCancellation();
  };
  const onSignal = () => cancel();
  signals.on("SIGTERM", onSignal);
  signals.on("SIGINT", onSignal);
  const arm = () => {
    timers.clearTimeout(timeout);
    if (!enabled) return;
    if (remaining() <= reserveMs) cancel();
    else timeout = timers.setTimeout(cancel, remaining() - reserveMs);
  };
  const checkpoint = () => {
    if (enabled && remaining() <= reserveMs) cancel();
    if (controller.signal.aborted) throw new Error("Assessment local work cancelled");
  };
  const work = (invoke) => {
    const promise = Promise.resolve().then(() => { checkpoint(); return invoke(); });
    pending.add(promise);
    const settled = () => { pending.delete(promise); release(); };
    promise.then(settled, settled);
    return promise.then((value) => { checkpoint(); return value; });
  };
  const waitUntil = async (promise, end) => {
    let timer;
    try {
      return await Promise.race([promise.then(() => true, () => true),
        new Promise((resolve) => { timer = timers.setTimeout(() => resolve(false), Math.max(0, end - now())); })]);
    } finally { timers.clearTimeout(timer); }
  };
  const disposeOnce = () => {
    if (!disposal) {
      mark("disposal", "started");
      disposal = Promise.resolve().then(() => worker?.dispose?.());
      disposal.then(() => { disposalReceipt = { disposeSettled: true, disposeSucceeded: true }; release(); },
        () => { disposalReceipt = { disposeSettled: true, disposeSucceeded: false }; release(); });
    }
    return disposal;
  };
  const settleAndDispose = () => {
    cleanup ??= (async () => {
      const end = Math.min(deadline - marginMs, cancelledAt + settlementMs + disposalMs);
      const taskSettled = await waitUntil(Promise.allSettled([...pending, ...(!worker && invocation ? [invocation] : [])]), Math.min(end, cancelledAt + settlementMs));
      mark("task_settlement", "observed", { taskSettled });
      if (worker) await waitUntil(disposeOnce(), Math.min(end, now() + disposalMs));
      mark("disposal", "observed", disposalReceipt ?? { disposeSettled: false });
    })();
    return cleanup;
  };
  arm();
  return {
    remaining, checkpoint, work, cancel,
    configure(assessment, timeoutMs) {
      enabled = assessment;
      if (assessment) {
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("Assessment requires a bounded timeout");
        deadline = Math.min(deadline, entered + timeoutMs);
      }
      else {
        signals.removeListener("SIGTERM", onSignal);
        signals.removeListener("SIGINT", onSignal);
      }
      arm();
      checkpoint();
    },
    decorateWorker(value) {
      checkpoint();
      worker = value;
      return { start: (...args) => work(() => worker.start(...args)),
        seedCodexAuthJsonFile: (...args) => work(() => worker.seedCodexAuthJsonFile(...args)),
        run: (job) => work(async () => {
          const combined = new AbortController();
          const abort = () => { combined.abort(); if (job.abortSignal?.aborted) cancel(); };
          const sources = [controller.signal, job.abortSignal].filter(Boolean);
          for (const signal of sources) {
            signal.addEventListener("abort", abort, { once: true });
            if (signal.aborted) abort();
          }
          try { combined.signal.throwIfAborted(); return await worker.run({ ...job, abortSignal: combined.signal }); }
          finally { for (const signal of sources) signal.removeEventListener("abort", abort); }
        }),
        dispose: () => controller.signal.aborted ? settleAndDispose() : disposeOnce(),
      };
    },
    async runCli(invokeLegacyCli) {
      const cli = invocation = Promise.resolve().then(invokeLegacyCli);
      cli.then(() => { cliSettled = true; release(); }, () => { cliSettled = true; release(); });
      try {
        const normal = cli.then(async (code) => {
          if (enabled) await Promise.allSettled([...pending]);
          if (enabled && disposal) {
            await disposal.catch(() => {});
            if (!controller.signal.aborted) mark("disposal", "observed", disposalReceipt);
          }
          return code;
        });
        const code = await Promise.race([normal, cancellation.then(() => undefined)]);
        // Promise continuations can beat an overdue cancellation timer.
        if (enabled && remaining() <= reserveMs) cancel();
        if (controller.signal.aborted) { await settleAndDispose(); return 1; }
        return code;
      } finally { finished = true; release(); }
    },
  };
}
