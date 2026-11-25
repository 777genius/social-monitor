# Iteration 02 - Day By Day Sequence

## Day 1 - Connector SDK

- Define provider port.
- Define capability profile.
- Define error taxonomy.
- Add fake provider.
- Check: fake provider passes certification.

## Day 2 - HN/RSS Adapters

- Implement HN mapping.
- Implement RSS parser and conditional requests.
- Add fixtures.
- Check: normalized items are stable.

## Day 3 - Scheduler And Worker

- Implement scan policy.
- Implement job creation.
- Implement worker lease.
- Check: two workers cannot process same job.

## Day 4 - Dedupe Feed

- Persist normalized items.
- Implement dedupe.
- Build feed API.
- Check: repeated scans and cross-source duplicate fixtures pass.

## Day 5 - Failure Review

- Test malformed payloads.
- Test cursor failure.
- Test quota/dead-letter behavior.
- Stop if cursor discipline or provenance is incomplete.
