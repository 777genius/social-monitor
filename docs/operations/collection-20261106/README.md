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

`20261109-historical-scopes.patch` records the installed preparation for one bounded historical HN/RSS pass and one Reddit/X pass for November 9, after the exact two earlier current-slot attempts. The historical UTC day must be closed. Linux tests covered those exact retained terminal states, mutation refusal, denial of repeat scope, and HN/RSS followed by Reddit/X. Neither historical pass has run yet; X historical coverage is not established. This records the installed operator state; it does not deploy it. Use `git apply --unidiff-zero` only after verifying all exact preimages below.

| File | Preimage SHA-256 | Installed SHA-256 |
| --- | --- | --- |
| `/usr/local/lib/social-monitor/historical-reddit-x/manifest.json` | `69044c27698fc0bb3e4494f9edfa9c72dcadfc3a58c5113a25a42ebf0149271c` | `2a4f0ca4c0d115184f9eebc554f3b7ae87a141553a545c84cfac41431ae93efc` |
| `/usr/local/lib/social-monitor/historical-reddit-x/mode.sh` | `41e701924439e8f0ec8cabe91f6d04e89302ec5722fd3a72a3b9b845262292a1` | `32a28678ad5b8a021135e0aeb0df89dc5f765aacba519f25bda2c700b2ca7dd0` |
| `/usr/local/lib/social-monitor/historical-reddit-x/collection-reddit-x-entrypoint.sh` | `032dd10c98468ff18481d3adb1f7acc9f3db33c9ecb4ec8bdc7082eef13fac05` | `f6d60ff50c62820dd4677d6c2fb9a2817d9a53cd5e5466e68a80e863417fe1f1` |
| `/usr/local/lib/social-monitor/current-source-guard/current_profile_admission.py` | `1187a96202e95cfe2cca665fc6c4ae28c13388bb362a9de4acfc2b32a62637f2` | `7dcd3a808144abd57a332be9a5115711116235e517dce2b1cf12198cf94434cf` |
| `/usr/local/sbin/social-monitor-posts-once` | `647e9d0851e81b4516ba32413d797b615020c83b0db7b18265bb74c9922e78df` | `fba2ce86cba51d7ae71149a535acd30c44682bf278daf93b42250ecde3924448` |
| `/usr/local/lib/social-monitor/current-source-guard/physical_operator_epoch.py` | `2d4bb08e394c9b2cc6289d02a5928ada53d59ccbe866f3a1734ed37d881424e8` | `f515748a5a9164a832623c8862560a4b4496eb461b510e55cf8530993abcb65d` |
| `/usr/local/sbin/social-monitor-posts-current-authority-stage` | `529985c2cfbfe4909d98ac73454b48e3a1696d914c8df873282a7136ebc744a5` | `a1d2b523f6be7eb51506bfdb5906bb29c132a665cece2891e7c67e172ed8efae` |
