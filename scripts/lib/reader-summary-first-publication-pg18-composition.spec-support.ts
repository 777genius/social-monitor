import type { Pool } from "pg";
import type { FirstPublicationDay } from "./reader-summary-first-publication-reservation";

/** Caller selection only. Offline lifecycle faults never acquire a Prisma
 * connection; genuine/default callers retain the generated prerequisite. */
export type FirstpubLifecycleComposition = Readonly<{
  kind: "genuine" | "offline-lifecycle-faults";
}>;

export function requireFirstpubGeneratedPrerequisite(
  composition: FirstpubLifecycleComposition, requireGenerated: () => unknown,
): void {
  switch (composition.kind) {
    case "genuine": requireGenerated(); return;
    case "offline-lifecycle-faults": return;
    default: throw new Error("Unknown FIRSTPUB lifecycle composition");
  }
}

export type FirstpubCrashReservation = (
  pool: Pool, day: FirstPublicationDay, reservedAt: Date,
) => Promise<void>;
export type FirstpubCrashComposition =
  | Readonly<{ kind: "genuine" }>
  | Readonly<{ kind: "offline-reservation"; reserve: FirstpubCrashReservation }>;

/** An offline port owns only its supplied completion/error promise. This
 * dispatcher cannot construct clients, run SQL or acknowledge COMMIT. */
export async function forwardFirstpubCrashReservation(
  pool: Pool, day: FirstPublicationDay, reservedAt: Date,
  composition: FirstpubCrashComposition, genuineReserve: FirstpubCrashReservation,
): Promise<void> {
  switch (composition.kind) {
    case "genuine": await genuineReserve(pool, day, reservedAt); return;
    case "offline-reservation": await composition.reserve(pool, day, reservedAt); return;
    default: throw new Error("Unknown FIRSTPUB crash composition");
  }
}
