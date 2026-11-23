/** Collect identities only from complete provider windows; no database or provider effects are hidden here. */
export type HnDiscoveryResult = Readonly<{
  items: readonly Readonly<{ externalId: string; publishedAt: Date }>[];
  warnings: readonly string[];
  collection?: Readonly<{ complete: boolean; backfillPending: boolean }>;
}>;

export async function discoverHnArchiveDay(input: {
  readonly day: string;
  readonly existing: ReadonlySet<string>;
  readonly scan: (from: Date, to: Date) => Promise<HnDiscoveryResult>;
  readonly onProgress?: (scans: number) => void;
  /** Used only for explicitly partial observation runs. */
  readonly initialWindowHours?: 6;
}): Promise<Readonly<{ missingCount: number; missing: readonly { id: string; created_at_i: number; pass: string }[]; scans: number }>> {
  const start = Date.parse(`${input.day}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.day) || !Number.isFinite(start) ||
      new Date(start).toISOString().slice(0, 10) !== input.day || start + 86_400_000 > Date.now()) {
    throw new Error('HN discovery requires a closed UTC day');
  }
  const end = start + 86_400_000;
  const found = new Map<string, number>();
  let scans = 0;
  const scanWindow = async (from: number, to: number): Promise<void> => {
    if (++scans > 256) throw new Error('HN discovery scan budget exceeded');
    input.onProgress?.(scans);
    const result = await input.scan(new Date(from), new Date(to));
    const overflow = result.warnings.length > 0 && result.warnings.every(warning =>
      /^Hacker News historical (?:pass|scan) incomplete: maxItems exceeded(?: \([^()]+\))?$/u.test(warning));
    if (overflow) {
      const middle = from + Math.floor((to - from) / 2000) * 1000;
      if (middle <= from || middle >= to) throw new Error('HN discovery cannot split crowded second');
      await scanWindow(from, middle);
      await scanWindow(middle, to);
      return;
    }
    if (result.warnings.length > 0 || result.collection?.complete === false || result.collection?.backfillPending === true) {
      throw new Error('HN discovery provider coverage incomplete');
    }
    for (const item of result.items) {
      if (!/^hn:[1-9]\d*$/u.test(item.externalId) || !Number.isSafeInteger(Number(item.externalId.slice(3))) ||
          !(item.publishedAt instanceof Date) || !Number.isFinite(item.publishedAt.getTime()) ||
          item.publishedAt.getTime() % 1000 !== 0) throw new Error('HN discovery identity invalid');
      const time = item.publishedAt.getTime();
      // Comment-search passes can return supporting roots outside the scanned window.
      if (time < start || time >= end) continue;
      const previous = found.get(item.externalId);
      if (previous !== undefined && previous !== time) throw new Error('HN discovery identity changed');
      found.set(item.externalId, time);
      if (found.size > 10_000) throw new Error('HN discovery identity budget exceeded');
    }
  };
  const width = input.initialWindowHours === 6 ? 6 * 3_600_000 : 86_400_000;
  for (let from = start; from < end; from += width) await scanWindow(from, Math.min(from + width, end));
  const missing = [...found].filter(([id]) => !input.existing.has(id)).map(([id, time]) => ({
    id: id.slice(3), created_at_i: time / 1000, pass: 'configured-provider',
  })).sort((a, b) => a.created_at_i - b.created_at_i || Number(a.id) - Number(b.id));
  return { missingCount: missing.length, missing, scans };
}
