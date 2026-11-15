/** Explicit future segments whose previous X runs finished before this bound. */
export const xLateWindowStart = (day: string): string | undefined => {
  switch (day) {
    case "2026-11-07": return `${day}T22:00:00.000Z`;
    case "2026-11-04":
    case "2026-11-08":
    case "2026-11-10":
    case "2026-11-11":
    case "2026-11-12":
    case "2026-11-13": return `${day}T21:00:00.000Z`;
    default: return undefined;
  }
};
