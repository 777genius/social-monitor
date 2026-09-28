// Custody is limited to app-server children returned by this MiMo worker's process factory.
export function createMimoAppServerCustody({ signal, spawnProcess, signalChild,
  timers = globalThis, killGraceMs = 1_000 }) {
  const children = new Map();
  const stop = (child) => {
    const owned = children.get(child);
    if (!owned || owned.stopping) return;
    owned.stopping = true;
    try { signalChild(child, "SIGTERM"); } catch { /* A closed child needs no signal. */ }
    owned.killTimer = timers.setTimeout(() => {
      if (!children.has(child)) return;
      try { signalChild(child, "SIGKILL"); } catch { /* A closed child needs no signal. */ }
    }, killGraceMs);
  };
  signal.addEventListener("abort", () => {
    for (const child of children.keys()) stop(child);
  }, { once: true });
  return {
    processFactory(input) {
      const child = spawnProcess(input);
      children.set(child, { stopping: false, killTimer: undefined });
      child.once("close", () => {
        timers.clearTimeout(children.get(child)?.killTimer);
        children.delete(child);
      });
      if (signal.aborted) stop(child);
      return child;
    },
  };
}
