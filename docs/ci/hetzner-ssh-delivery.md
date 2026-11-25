# Fixed SSH delivery and manual trusted bootstrap

This change adds a thin client and a default-plan installer for the approved
root controller. It creates no active workflow and performs no production action.
The controller's eight verbs, archive validation, compatibility review, independent
adapter evidence and release decisions remain authoritative. See
`ops/release/hetzner/README.md` and `contract.py`.

The client accepts the canonical unversioned JSON manifest with exactly `sha`,
`ci_run_id`, `archive_sha256`, `image_id`, `archive_bytes`, `migrations` and
`image_graph`. It preserves the complete migration inventory and image graph.
SHA is lowercase 40hex, run is a positive string of at most 15 digits,
digests are `sha256:` plus 64 lowercase hex, and archive bytes are a positive
integer <=10,000,000,000 (10GB). SHA/run must also match separately supplied
runner arguments. Manifest and archive must be canonical regular files without
symlink ancestors. The archive's exact bytes are hashed before any SSH call;
the same open file is streamed to receive with EOF and immutable identity checks.
No candidate code, rebuild, tag, migration or credentials are used by the client.

Runner configuration is a separately trusted JSON file containing exactly
`host`, integer `port`, `user` (`sm-release`), absolute `private_key` and
`known_hosts`. All paths/ancestors must be canonical, owned by root or the runner,
and without group/world writes; the key must also deny group/other access. The
client does not read key contents. Candidate metadata cannot specify transport
configuration. SSH executes `/usr/bin/ssh` without a local shell, with `-F
/dev/null`, strict host checking, the exact known-host file, disabled global
host keys, identities only, no agent, batch mode, a ten-second connection deadline,
no forwarding or PTY, and a bounded process deadline. The remote argument is
constructed only from the controller grammar. Raw stderr, errors and payloads
never enter output.

A manually invoked runner can use:

```sh
node scripts/ci/hetzner-release-client.mjs \
  --runner-config /trusted/runner.json --manifest /candidate/manifest.json \
  --archive /candidate/image.tar --sha <exact-40hex> --run <exact-run> \
  --phases /trusted/new-release-phases.jsonl
```

The phase file must not exist. Each finite observed phase is fsynced and binds
SHA/run/archive/image; its parent directory is synced at creation. Successful
completion requires status without latch, observed preflight machine
`b28fc7b17042414386eb9b114046e50c`, exact receive/admit bindings, activated terminal
receipt tied to admission, verify, receipt reread, and final status/preflight
proving image/snapshot. `status` itself has no machine-id field in this controller.
Only root's exact exit-1 `stale-main-skip` denial during receive/admit permits a
skip. Rolled-back receipts, other denials, latches and mismatches fail.

Read-only transport uncertainty gets at most three observations. Receive is
never automatically retried: the existing eight-verb protocol offers no separate
read-only import proof. An uncertain activation gets status, preflight and the
exact release receipt, then verification only if that terminal receipt is proven.
It never sends a second activation, rollback or other recovery write. Missing
terminal evidence fails for manual operator reconciliation. Successful transport
is not treated as successful activation.

The installer is manually invoked with `--source`, an independently approved
full `--approved-sha` (including this installer), separately provisioned canonical root-private
`components.conf`/`operator.conf`, a restricted Ed25519 `--public-key`, and an
official hash-locked CPython 3.12 PyYAML 6.0.3 `--pyyaml-wheel`. Invoke the approved source installer with a cleared environment and
`/usr/bin/python3 -I -B`; unisolated startup denies before non-builtin imports.
Without `--install` it only validates inputs and reports a plan. `ready` means input verification,
not host qualification or approval. Approval for an actual production bootstrap
must come later from the user. No actual install was performed for this patch.

Explicit installation requires the actual authorized machine, root ownership,
safe ancestors, the installer from that source, the exact approved Git HEAD and clean relevant HEAD/index/working
bytes. Git uses a cleared environment with hooks/fsmonitor disabled, no replacement
objects, and ls-tree/ls-files plus raw Git blob hashing; no diff clean filters,
textconv, external diff, npm or source hooks run. The operator adapter and its
module closure must be present in the approved source and its separately supplied
wrapper must match. The finite installation list currently requires
`operator-adapter`, `operator_adapter.py`, `operator_config.py`,
`operator_github.py`, `operator_backup.py`, `operator_database.py`,
`operator_probe.py`. These are not in the approved core yet. Integration must
review and align that list with the real operator module closure before bootstrap;
absence denies rather than installing an observer with success defaults.

Installer assets are confined to `/opt/social-monitor-release`, a copies venv
at `/opt/social-monitor-release-python`, dedicated root state directories/lock,
`sm-release` account/group/home with its own restricted authorized key, and its
own validated no-argument sudoers rule. Existing installation/account/assets deny
instead of updating or replacing unrelated keys. Config is supplied, never
created; Compose, API/non-target containers, writer units, backup config, DB roles,
tokens and backend credentials are untouched. The venv is checked before pip
and after dependency installation; only CPython's exact root-created `lib64 -> lib`
compatibility alias is removed. Other links and writable dependencies deny.
The installed isolated interpreter must report PyYAML 6.0.3 before account setup. Interrupted bootstrap can leave
partial owned assets; it requires manual inspection rather than automatic repair.

A Bash/Python entrypoint cannot erase `LD_PRELOAD`/`BASH_ENV` before its own
startup. The dedicated login shell is therefore a small C executable built with
`gcc -static`, with ELF validation rejecting PT_INTERP and PT_DYNAMIC. It accepts
only sshd `-c` with the exact forced `/usr/bin/sudo -n
/opt/social-monitor-release/root-executor`. The same static binary at root-only
`root-executor` accepts no arguments. Both preserve only a bounded original
command and clear all environment before fixed sudo/Python execution. Sudoers
keeps only that command, disables SETENV and authorizes the exact no-argument
root executor. Python uses `-I -B` and the fixed trusted controller. Controller
parsing remains the command authority.

Focused synthetic checks:

```sh
node_modules/.cicd-tools/node22 --test scripts/ci/hetzner-release-client.test.mjs
node_modules/.cicd-tools/venv/bin/python3 -B -m unittest discover \
  -s ops/release/hetzner -p 'install_test.py' -v
node_modules/.cicd-tools/venv/bin/python3 -B -m unittest discover \
  -s ops/release/hetzner -p 'restricted_executor_test.py' -v
```

The SSH process seam proves argument/environment/stream contracts, not a real SSH
connection. Static tests compile the actual executor and verify no ELF interpreter/dynamic
dependencies, plus real root-argument denial under poisoned startup variables.
An independent GCC AST graph check validates clearenv/setenv ordering, the finite
environment keys, root/login argc guards and the fixed execution vectors.
Static argument/environment denial returns 126; unavailable fixed execution
returns 127, so failed exec cannot masquerade as a verified argument denial. That is static evidence, not
a successful dynamic environment observation.
The execve observation tests stop before fixed sudo/Python execution; when
PTRACE_TRACEME or synthetic UID/GID transitions are denied by the sandbox they explicitly skip. In this sandbox
those environment observation tests were skipped: the actual environment boundary
still requires disposable-container qualification. No production paths are
created and nothing is installed. This does not qualify sshd/PAM/account, real
sudo policy, venv/bootstrap or controller deployment.
Outstanding qualification: approved operator modules/config parser integration;
root disposable-container complete bootstrap and interrupted-install handling;
sshd forced command, PAM/account admission, host key handling, binary EOF transfer,
sudo environment retention/no-argument denial and installed Python execution;
actual Docker 29 archive/receipt flow and PG18/backup/GitHub adapter evidence.
No core71/full Jest, provider/runtime-agent smoke or production check was run.
