/** A missing-only reconciliation is an input, not proof of provider coverage. */
export type HnMissingCandidate = Readonly<{ id: number; day: string; createdAt: string; pass: string }>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(label);
  return value as Record<string, unknown>;
}

function dayStart(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) throw new Error('Invalid reconciliation day');
  const start = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== day) {
    throw new Error('Invalid reconciliation day');
  }
  return start;
}

export function validateHnCandidates(candidates: readonly HnMissingCandidate[], from: string, to: string): void {
  const start = dayStart(from);
  const end = dayStart(to);
  if (start > end || candidates.length > 10_000) throw new Error('Invalid reconciliation window');
  const ids = new Set<number>();
  for (const item of candidates) {
    const day = dayStart(item.day);
    const time = Date.parse(item.createdAt);
    if (!Number.isSafeInteger(item.id) || item.id < 1 || ids.has(item.id) ||
        day < start || day > end || !Number.isFinite(time) ||
        new Date(time).toISOString() !== item.createdAt || time < day || time >= day + 86_400_000 ||
        !/^[A-Za-z0-9._:-]{1,128}$/u.test(item.pass)) {
      throw new Error('Invalid reconciliation candidate identity');
    }
    ids.add(item.id);
  }
}

export function parseHnMissingReconciliation(input: unknown): {
  candidates: readonly HnMissingCandidate[]; from: string; to: string;
} {
  const root = record(input, 'Invalid reconciliation');
  const days = record(root.days, 'Invalid reconciliation days');
  const keys = Object.keys(days).sort();
  if (keys.length === 0 || keys.length > 366) throw new Error('Invalid reconciliation window');
  const seen = new Set<number>();
  const candidates: HnMissingCandidate[] = [];
  for (const [index, day] of keys.entries()) {
    const start = dayStart(day);
    if (index > 0 && start !== dayStart(keys[index - 1]!) + 86_400_000) {
      throw new Error('Reconciliation window has missing days');
    }
    const entry = record(days[day], 'Invalid reconciliation day entry');
    if (!Array.isArray(entry.missing) || entry.missingCount !== entry.missing.length) {
      throw new Error('Reconciliation missing count mismatch');
    }
    for (const value of entry.missing) {
      const item = record(value, 'Invalid reconciliation candidate');
      const raw = item.id;
      const id = typeof raw === 'string' && /^[1-9]\d*$/u.test(raw) ? Number(raw) : raw;
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || seen.has(id) ||
          typeof item.created_at_i !== 'number' || !Number.isSafeInteger(item.created_at_i) ||
          item.created_at_i * 1000 < start || item.created_at_i * 1000 >= start + 86_400_000 ||
          typeof item.pass !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/u.test(item.pass)) {
        throw new Error('Invalid reconciliation candidate identity');
      }
      seen.add(id);
      candidates.push({ id, day, createdAt: new Date(item.created_at_i * 1000).toISOString(), pass: item.pass });
      if (candidates.length > 10_000) throw new Error('Reconciliation candidate limit exceeded');
    }
  }
  const totals = record(root.totals, 'Invalid reconciliation totals');
  if (totals.missing !== candidates.length) throw new Error('Reconciliation total mismatch');
  validateHnCandidates(candidates, keys[0]!, keys[keys.length - 1]!);
  return { candidates, from: keys[0]!, to: keys[keys.length - 1]! };
}
