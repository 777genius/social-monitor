# Collection repair and 6 November backfill

These patches record changes to root-owned operator files on the production host; these files are not currently maintained as source in this repository. Apply only against the exact preimage and under the existing collection lock after verifying that no collection is running. The SHA-256 pins are part of the deployment and must change together. A patch in this folder is not an automatic deployment mechanism.

- `20261107-current-collection.patch` records the installed 7 November repair. It recognizes the exact PostgreSQL grants from migration `20261001220000_reader_summary_first_publication_finite_contract` and handles one retained Hacker News import whose source remains but whose feed projection is absent, while retaining the other receipt, claim and containment checks.
- `20261106-historical-date.patch` records the installed exact date addition for the existing bounded Reddit/X historical scope. It preserves the previous allowed dates and changes associated source pins. It does not imply that providers can return all historical posts or that the day was fully collected.

Use the recorded collection artifacts and terminal state as evidence of actual provider coverage. Do not rerun an attempt with uncertain effects, modify retained historical receipts, or infer success from a service being started.

- `20261109-partial-recovery.patch` uses zero-context hunks (apply with `git apply --unidiff-zero` only after verifying the exact preimage hashes) and records the installed recovery-only handling for an unavailable Hacker News scan combined with an empty RSS scan, the shifted retry interval for transient manager-job contention, and the associated production integrity pins. The retained November 9 attempt was reconciled against post-write backup and isolated restore proofs; a subsequent collection completed with partial coverage. The patch is a record of production files, not an automatic deployment or a guarantee of full provider coverage.

November 9 patch SHA-256 bindings (preimage → installed):

| File | Preimage | Installed |
| --- | --- | --- |
| `/usr/local/sbin/social-monitor-posts-provider-policy.sh` | `babab8c5defb46baf6dce4e9c4ea41dc6cfaa8fd0a8ce667cb0923d5118ec58d` | `6bb480c649fdfcfc24eab39fe9b9bc28b921daeaef4bdb11f869cd86615f1060` |
| `/usr/local/sbin/social-monitor-posts-once` | `f2f0057e66e1619c068fbb2c39bebe9044e9e907691f94e0cb4e6b1558ef3fa3` | `647e9d0851e81b4516ba32413d797b615020c83b0db7b18265bb74c9922e78df` |
| `/usr/local/lib/social-monitor/current-source-guard/physical_operator_epoch.py` | `4be63bcd62b7d0a88ad27657b71ced7c8562fdc5cb6b59b8362dcae39547b990` | `2d4bb08e394c9b2cc6289d02a5928ada53d59ccbe866f3a1734ed37d881424e8` |
| `/usr/local/sbin/social-monitor-posts-current-authority-stage` | `f08da47f94370759ae33feb5e6d590bfc89cadecccec6670fa20be17f75b5d5c` | `529985c2cfbfe4909d98ac73454b48e3a1696d914c8df873282a7136ebc744a5` |
