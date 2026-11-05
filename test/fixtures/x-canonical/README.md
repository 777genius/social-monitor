# Detached E2 qualification evidence

These are immutable test inputs for the two E2 CI release findings. They do not
register runtime services or authorize provider/native execution. The normal
Jest specs and Python unittest suite consume source-owned inputs automatically;
no `.cache/e2-fixtures`, Git history, download, installation or manual bootstrap
is required. The bootstrap uses only Python's standard library and the unchanged
source-verification seam. Each Python process gets a fresh temporary directory;
it validates the plaintext closure, manifest and all30 sources before materializing them.
Only the existing allowlisted pure AST declarations execute. No Scweet package,
auth, provider, Runner, client or transport module is imported.

## Provenance and seals

- Four `.ts.txt` files are exact full reviewed first-party blobs from
  `b8ad9fa535dea1b28de0478162b8cc0aeee347be`, copied from the independent review's
  `.cache/e2-fixtures/reviewed-pure/`. Original source paths and SHA256 values
  are recorded in `inventory.json` and independently pinned in the parity spec.
  The text suffix prevents treating frozen historical evidence as importable
  application source. Exact declaration bytes are still compared before execution.
- `sdk-installed-source/Scweet/*.py.txt` contains the exact 30 reviewed public
  Scweet 5.3 source files as readable UTF-8, with no content transformation.
  `manifest.json` and `command.json` retain their original bytes. The acquisition
  command is inert provenance, never executed or materialized. The fixed manifest
  SHA256 is `0aa986455c1775520b7621a61c57204924c4ec12b6a5a9371a6db7412ca7797a`;
  command SHA256 is `55609464c4dc57b2f822940c35069a89ad28adcfc4818d0553c388f8a4facf20`.
  The original archive identity remains recorded in the unchanged license provenance;
  the archive is no longer a distributed fixture. This is not an installation recipe.
- `baseline.ls-tree.json` contains all 6318 path/mode/kind/blob tuples in original
  order for exact base `fa6bb2036d792bcc868d3cd795ffe1c0fb3f169f`.
  The 1224769-byte UTF-8 representation has SHA256
  `616e75145832ecd3826a92cfc253d821de92ade0175215c60e740bb55601a8f7`.
  Reconstructing each `mode kind blob\tpath\0` entry produces exactly 795142 bytes,
  SHA256 `20ff7f0ad57c6591f53c9e3567b672cec79940a654c952878310527bcb45e145`.
  The ownership spec independently pins these fa6 seals, both 6318 entry counts
  and the 795142-byte reconstructed length. All three focused ownership tests pass;
  all byte/mode assertions remain intact.
  No Git history, HEAD substitution, missing-history skip or ignored input is used.

## Fixture size and license accounting

`inventory.json` records payload hashes, byte counts and vendor line counts.
The baseline is generated structured evidence (37910 lines). The four first-party
`.ts.txt` evidence files remain unchanged (19955 bytes, 291 handwritten lines).
The SDK evidence contains **427881 bytes / 10836 handwritten vendor lines** in
30 files, plus 4160 bytes / 130 generated manifest lines and 827 bytes / 22 inert
command provenance lines. Vendor source is not generated code.

Pre-remediation inspection found `api_engine.py` at 2648 lines and `runner.py` at
1392 lines. The existing line-cap gate scans `test/**/*.py` and has no vendor
exclusion; storing them there as importable Python would fail, and splitting them
would break the approved source bytes. As with the existing `.ts.txt` evidence,
`.py.txt` marks non-importable, unchanged plaintext evidence. No source-line-cap,
architecture gate, exclusion or baseline file was changed. Vendor handwritten
counts are reported separately rather than hidden in generated counts. The default
runtime detector scans every byte of these text files without exceptions.

The bootstrap enforces the exact 32-file allowlist and only the `Scweet` directory,
rejecting extra files/directories, symlinks, missing/corrupt sources, manifest or
command. It verifies all bytes before materializing the manifest and 30 sources
in a fresh temporary directory outside the checkout. The command is never copied.
The unchanged source verifier runs again before allowlisted pure AST declarations
execute. No SDK package, provider, auth, transport or database is imported.

First-party repository source is distributed under the repository Apache-2.0
license, reproduced in `LICENSE.Apache-2.0.txt` (11357 bytes). Historical b8ad is
an incomplete source tree and does not itself contain a LICENSE blob; this is
explicitly the current repository license, not a purported historical license.

SDK license verified offline against the parent-supplied official PyPI Scweet5.3
metadata, wheel and sdist. Both artifact SHA256 digests match the PyPI response.
All30 reviewed SDK source files are byte-identical to both distributions: no
mismatches. Both package metadata files declare MIT; the sdist contains the exact
license reproduced in `LICENSE.Scweet-MIT.txt`, Copyright (c) 2020 Altimis Teams.
The wheel contains no separate LICENSE file; the matching sdist supplies it.
`scweet-license-provenance.json` records official artifact URLs, metadata/artifact
and license hashes, and each source comparison. This closes the prior missing
SDK license evidence item; it does not establish native or live-provider readiness.
The plaintext source bytes, license provenance and independent source pins remain unchanged.
The archive-to-text bootstrap replacement preserves the pure-builder refusal boundary.
