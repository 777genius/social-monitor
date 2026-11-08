# Collection repair and 6 November backfill

These patches record changes to root-owned operator files on the production host; these files are not currently maintained as source in this repository. Apply only against the exact preimage and under the existing collection lock after verifying that no collection is running. The SHA-256 pins are part of the deployment and must change together. A patch in this folder is not an automatic deployment mechanism.

- `20261107-current-collection.patch` records the installed 7 November repair. It recognizes the exact PostgreSQL grants from migration `20261001220000_reader_summary_first_publication_finite_contract` and handles one retained Hacker News import whose source remains but whose feed projection is absent, while retaining the other receipt, claim and containment checks.
- `20261106-historical-date.patch` records the installed exact date addition for the existing bounded Reddit/X historical scope. It preserves the previous allowed dates and changes associated source pins. It does not imply that providers can return all historical posts or that the day was fully collected.

Use the recorded collection artifacts and terminal state as evidence of actual provider coverage. Do not rerun an attempt with uncertain effects, modify retained historical receipts, or infer success from a service being started.
