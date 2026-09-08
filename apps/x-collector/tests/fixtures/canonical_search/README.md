# Immutable canonical-search oracle

`baseline_scweet_adapter.py` preserves the exact original repository bytes from
commit `2690a1a0e55b6c4100481f8b7cafbb9f0bc24685`, path
`apps/x-collector/src/x_collector/scweet_adapter.py` (before E1 extraction).

SHA-256: `539d6ee1ac7e17b0ff1e7e9bb9a261a4f36aa4906d2905f989e30361f75241e1`.

Captured once with `git show <commit>:<path>` and byte/hash verified during
fixture creation. This is trusted repository source used only as a test oracle;
do not regenerate it from current implementation or update it with production edits.
The loader verifies these bytes before executing them in a separate test module.
Normal tests need no Git, network, bootstrap, or `.cache` directory.

The raw frozen fixture costs 969 lines, counted separately from E1 implementation
changes, and remains subject to the unchanged 1000-line source cap.
Parity evidence is written only when `CANONICAL_SEARCH_PARITY_OUTPUT` explicitly
names an absolute output file path in an existing directory; normal tests create no evidence files.
