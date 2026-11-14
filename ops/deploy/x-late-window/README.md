# Bounded X collection components

These components collect explicitly configured late UTC windows and mark their
artifacts `PARTIAL_PROVIDER_WINDOW`. A successful partial scan does not prove
complete coverage of a day or the provider's available posts.

The CLI, collector adapter, router hook, and ledger guard are components only.
This directory does not install or activate a production route. Before use, the
host's existing locked router must validate each prior attempt and admission,
call the evidence check under that lock, retain one-shot claims and watchdog
handling, and verify the partial artifact. Its installed source and pins must be
reviewed and updated as one deployment; this source patch alone does not do so.

The configured windows are narrow incident-specific bounds. A prior full-day
query can overlap the new query parameters: the evidence is that prior queries
finished before the requested late window, not that their parameters were
non-overlapping. Do not retry an already claimed segment automatically. The
ledger guard does not emit account credentials or provider payloads.
