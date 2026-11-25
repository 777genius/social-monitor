# Hetzner release needs the first CI attempt of a main run

The release client binds a main revision to one CI run attempt. The frontend
bundle is uploaded as `frontend-candidate-<sha>-<run>-<attempt>` by the attempt
that built it, while the API candidate is named `api-candidate-<sha>-<run>`
without an attempt, so it cannot be uploaded twice for one run.

When `Re-run failed jobs` is used on a main CI run, GitHub reports the new
attempt as the authority, but the frontend artifact still carries the number of
the attempt that built it. The release `candidate` job then fails with the
generic `{"phase":"failed"}` before it reaches the host, and the release for
that revision is lost.

Rules for operators:

- Do not rerun jobs of a main CI run that already produced candidate
  artifacts. A rerun of only a queue-starved or cancelled aggregate job is
  enough to turn the run green but not enough to release it.
- If a main run is cancelled or ends in a partial rerun, land a new reviewed
  commit on main and release that revision instead.
- The strict attempt binding is intentional. Do not relax it to accept an
  artifact from an earlier attempt.
