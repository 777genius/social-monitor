// A set comparison cannot reject duplicate IDs that would be overwritten by a Map.
export function validateUniqueExternalBetaDryRunJobIds(jobs, label, violations) {
  const seen = new Set();
  for (const job of jobs ?? []) {
    if (seen.has(job.jobId)) {
      violations.push(`${label}: duplicate jobId "${job.jobId}"`);
    }
    seen.add(job.jobId);
  }
}
