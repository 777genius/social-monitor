#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
LC_ALL=C
export PATH LC_ALL

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
# Keep the test fixture hermetic when its caller is GitHub Actions or a legacy
# deployment shell. Negative override cases below reintroduce variables locally.
unset PRODUCTION_TRANSITION_REPOSITORY PRODUCTION_TRANSITION_TRUSTED_BASE \
  PRODUCTION_TRANSITION_RUN_ID GITHUB_REPOSITORY GITHUB_WORKFLOW_REF GITHUB_SHA \
  GITHUB_WORKSPACE
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/transition-authority-e2e.XXXXXX")
trap '/usr/bin/rm -rf -- "$FIXTURE"' EXIT
REPO=$FIXTURE/repo
REMOTE=$FIXTURE/origin.git
OUTPUT=$FIXTURE/review-output
REVIEW_KEY=$FIXTURE/review-key
TARGET_KEY=$FIXTURE/target-key
SENTINEL=$FIXTURE/candidate-executed

fail() { printf 'transition-authority-e2e-error: %s\n' "$*" >&2; exit 1; }
assert_rejected() {
  local label=$1 output status
  shift
  set +e
  output=$("$@" 2>&1)
  status=$?
  set -e
  ((status != 0)) || fail "$label was accepted"
}

/usr/bin/ssh-keygen -q -t ed25519 -N '' -C review-test -f "$REVIEW_KEY"
/usr/bin/ssh-keygen -q -t ed25519 -N '' -C target-test -f "$TARGET_KEY"
REVIEW_FP=$(/usr/bin/ssh-keygen -lf "$REVIEW_KEY.pub" -E sha256 | /usr/bin/awk '{print $2}')
TARGET_FP=$(/usr/bin/ssh-keygen -lf "$TARGET_KEY.pub" -E sha256 | /usr/bin/awk '{print $2}')
read -r REVIEW_TYPE REVIEW_DATA _ < "$REVIEW_KEY.pub"
read -r TARGET_TYPE TARGET_DATA _ < "$TARGET_KEY.pub"

/usr/bin/git init -q "$REPO"
/usr/bin/git -C "$REPO" config user.name 'Transition E2E'
/usr/bin/git -C "$REPO" config user.email transition-e2e@example.invalid
/usr/bin/mkdir -p "$REPO/ops/deploy"
printf '%s\n' \
  'version=social-monitor-production-transition-review-anchor-v1' \
  'anchor-path=ops/deploy/production-transition-review.anchor' \
  'allowed-signers-path=ops/deploy/production-transition-review.allowed_signers' \
  'principal=production-transition-review' 'namespace=git' 'key-type=ssh-ed25519' \
  "fingerprint=$REVIEW_FP" > "$REPO/ops/deploy/production-transition-review.anchor"
printf 'production-transition-review namespaces="git" %s %s review-test\n' \
  "$REVIEW_TYPE" "$REVIEW_DATA" \
  > "$REPO/ops/deploy/production-transition-review.allowed_signers"
/usr/bin/git -C "$REPO" add ops/deploy/production-transition-review.anchor \
  ops/deploy/production-transition-review.allowed_signers
/usr/bin/git -C "$REPO" commit -qm 'chore(deploy): fixture review A0'
A0=$(/usr/bin/git -C "$REPO" rev-parse HEAD)

/bin/cp -a "$PROJECT_ROOT/ops/." "$REPO/ops/"
/usr/bin/mkdir -p "$REPO/.github/workflows"
/bin/cp -a "$PROJECT_ROOT/.github/workflows/production-deploy.yml" \
  "$REPO/.github/workflows/"
/bin/cp -a "$PROJECT_ROOT/.github/workflows/production-transition-review.yml" \
  "$REPO/.github/workflows/"
/bin/cp -a "$PROJECT_ROOT/.github/workflows/production-transition-publish.yml" \
  "$REPO/.github/workflows/"
printf '%s\n' \
  'version=social-monitor-production-transition-review-anchor-v1' \
  'anchor-path=ops/deploy/production-transition-review.anchor' \
  'allowed-signers-path=ops/deploy/production-transition-review.allowed_signers' \
  'principal=production-transition-review' 'namespace=git' 'key-type=ssh-ed25519' \
  "fingerprint=$REVIEW_FP" > "$REPO/ops/deploy/production-transition-review.anchor"
printf 'production-transition-review namespaces="git" %s %s review-test\n' \
  "$REVIEW_TYPE" "$REVIEW_DATA" \
  > "$REPO/ops/deploy/production-transition-review.allowed_signers"
printf '%s\n' \
  'version=social-monitor-production-transition-target-anchor-v1' \
  'anchor-path=ops/deploy/production-transition-target.anchor' \
  'allowed-signers-path=ops/deploy/production-transition-target.allowed_signers' \
  'principal=production-transition-target' 'namespace=git' 'key-type=ssh-ed25519' \
  "fingerprint=$TARGET_FP" > "$REPO/ops/deploy/production-transition-target.anchor"
printf 'production-transition-target namespaces="git" %s %s target-test\n' \
  "$TARGET_TYPE" "$TARGET_DATA" \
  > "$REPO/ops/deploy/production-transition-target.allowed_signers"
printf 'intentionally deleted by reviewed S2\n' > "$REPO/intentional-delete.txt"
/usr/bin/git -C "$REPO" add -A
/usr/bin/git -C "$REPO" commit -qm 'chore(deploy): fixture protected-main B0'
B0=$(/usr/bin/git -C "$REPO" rev-parse HEAD)
/usr/bin/git -C "$REPO" branch -M main

INDEX=$FIXTURE/s2.index
printf '#!/usr/bin/env bash\ntouch %q\n' "$SENTINEL" > "$FIXTURE/candidate.sh"
CANDIDATE_BLOB=$(/usr/bin/git -C "$REPO" hash-object -w "$FIXTURE/candidate.sh")
GIT_INDEX_FILE=$INDEX /usr/bin/git -C "$REPO" read-tree "$B0"
GIT_INDEX_FILE=$INDEX /usr/bin/git -C "$REPO" update-index --add --cacheinfo \
  "100755,$CANDIDATE_BLOB,external-candidate.sh"
GIT_INDEX_FILE=$INDEX /usr/bin/git -C "$REPO" update-index \
  --force-remove intentional-delete.txt
S2_TREE=$(GIT_INDEX_FILE=$INDEX /usr/bin/git -C "$REPO" write-tree)
S2=$(printf '%s\n' 'test: external inert S2' | \
  /usr/bin/git -C "$REPO" commit-tree "$S2_TREE" -p "$B0")
[[ ! -e $SENTINEL ]] || fail 'candidate executed during S2 construction'

/usr/bin/git clone -q --bare "$REPO" "$REMOTE"
/usr/bin/git -C "$REPO" remote add origin "$REMOTE"
/usr/bin/mkdir -p "$OUTPUT"
export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
export PRODUCTION_TRANSITION_TEST_REPOSITORY=$REPO
export PRODUCTION_TRANSITION_TEST_REMOTE=origin
export PRODUCTION_TRANSITION_TEST_ANCHOR_BASE=$A0
export PRODUCTION_TRANSITION_TEST_TRUSTED_BASE=$B0
export PRODUCTION_TRANSITION_TEST_REVIEW_FINGERPRINT=$REVIEW_FP
export PRODUCTION_TRANSITION_TEST_TARGET_FINGERPRINT=$TARGET_FP
export PRODUCTION_TRANSITION_TEST_NOW_EPOCH=2000000000
export PRODUCTION_TRANSITION_TEST_RUN_ID=run:516
export PRODUCTION_TRANSITION_TEST_TRANSITION_ID=transition:2026-08-29
export PRODUCTION_TRANSITION_TEST_REPLAY_ID=replay:0123456789abcdef
export GIT_AUTHOR_NAME='Transition E2E'
export GIT_AUTHOR_EMAIL=transition-e2e@example.invalid
export GIT_COMMITTER_NAME=$GIT_AUTHOR_NAME
export GIT_COMMITTER_EMAIL=$GIT_AUTHOR_EMAIL

REVIEW_RESULT=$(PRODUCTION_TRANSITION_REVIEW_SIGNING_KEY=$REVIEW_KEY \
  "$REPO/ops/deploy/production-transition-reviewer.sh" review "$S2" \
  1999999900 2000000100 "$OUTPUT")
P6=$(/usr/bin/sed -n 's/^p6=//p' <<< "$REVIEW_RESULT")
STATEMENT=$(/usr/bin/sed -n 's/^statement=//p' <<< "$REVIEW_RESULT")
SIGNATURE=$(/usr/bin/sed -n 's/^signature=//p' <<< "$REVIEW_RESULT")
[[ $P6 =~ ^[0-9a-f]{40}$ && -f $STATEMENT && -f $SIGNATURE ]] || \
  fail 'reviewer did not produce exact P6 and signed canonical review'
[[ $(/usr/bin/git -C "$REPO" rev-list --parents -n1 "$P6") == "$P6 $B0" ]] || \
  fail 'reviewer P6 graph differs'
DELETED_BLOB=$(/usr/bin/git -C "$REPO" rev-parse "$B0:intentional-delete.txt")
TOMBSTONE_ROW="tombstone 100644 blob $DELETED_BLOB"$'\t''intentional-delete.txt'
/usr/bin/git -C "$REPO" show "$P6:ops/deploy/production-transition-bridge.manifest" | \
  /usr/bin/grep -Fx "$TOMBSTONE_ROW" >/dev/null || \
  fail 'P6 omitted the canonical signed deletion tombstone'

PUBLISH_RESULT=$(PRODUCTION_TRANSITION_TARGET_SIGNING_KEY=$TARGET_KEY \
  "$REPO/ops/deploy/production-transition-publisher.sh" prepare "$S2" "$P6" \
  "$STATEMENT" "$SIGNATURE")
T=$(/usr/bin/sed -n 's/^t=//p' <<< "$PUBLISH_RESULT")
[[ $T =~ ^[0-9a-f]{40}$ && \
   $(/usr/bin/git -C "$REPO" rev-list --parents -n1 "$T") == "$T $P6 $S2" ]] || \
  fail 'publisher did not produce exact ordered T'
[[ ! -e $SENTINEL ]] || fail 'candidate executed before admission'

ADMISSION_OUTPUT=$("$REPO/ops/deploy/production-transition-admission.sh" verify --target "$T")
/usr/bin/grep -F "target=$T" <<< "$ADMISSION_OUTPUT" >/dev/null || \
  fail 'real admission did not accept reviewer/publisher output'
[[ ! -e $SENTINEL ]] || fail 'candidate executed during admission'

# Missing, extra, duplicate, reordered, and forged tombstone rows cannot be
# substituted even when the attacker re-signs a review with the review key.
PRODUCTION_TRANSITION_ANCHOR_BASE=$A0
PRODUCTION_TRANSITION_BRIDGE_BASE=$B0
PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT=$REVIEW_FP
PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT=$TARGET_FP
PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH=2000000000
# shellcheck source=ops/deploy/production-transition-canonical-lib.sh
source "$REPO/ops/deploy/production-transition-canonical-lib.sh"
ORIGINAL_CONTRACT=$FIXTURE/original.contract
/usr/bin/git -C "$REPO" show "$P6:$PRODUCTION_TRANSITION_CONTRACT_PATH" > "$ORIGINAL_CONTRACT"
assert_manifest_attack() {
  local name=$1 mode=$2 contract index blob tree forged_p6 statement
  contract=$FIXTURE/$name.contract
  index=$FIXTURE/$name.index
  statement=$FIXTURE/$name.manifest.statement
  case $mode in
    missing) /usr/bin/grep -Fv "$TOMBSTONE_ROW" "$ORIGINAL_CONTRACT" > "$contract" ;;
    extra) /bin/cp "$ORIGINAL_CONTRACT" "$contract"; printf '%s\n' \
      $'destination 100644 blob 0000000000000000000000000000000000000000\textra.txt' >> "$contract" ;;
    duplicate) /bin/cp "$ORIGINAL_CONTRACT" "$contract"; printf '%s\n' "$TOMBSTONE_ROW" >> "$contract" ;;
    reordered) { /usr/bin/head -n -2 "$ORIGINAL_CONTRACT"; /usr/bin/tail -n 1 "$ORIGINAL_CONTRACT"; \
      /usr/bin/tail -n 2 "$ORIGINAL_CONTRACT" | /usr/bin/head -n 1; } > "$contract" ;;
    forged) /usr/bin/sed "s/$DELETED_BLOB/0000000000000000000000000000000000000000/" \
      "$ORIGINAL_CONTRACT" > "$contract" ;;
  esac
  blob=$(/usr/bin/git -C "$REPO" hash-object -w "$contract")
  GIT_INDEX_FILE=$index /usr/bin/git -C "$REPO" read-tree "$S2^{tree}"
  GIT_INDEX_FILE=$index /usr/bin/git -C "$REPO" update-index --add --cacheinfo \
    "100644,$blob,$PRODUCTION_TRANSITION_CONTRACT_PATH"
  tree=$(GIT_INDEX_FILE=$index /usr/bin/git -C "$REPO" write-tree)
  forged_p6=$(printf 'test: forged %s manifest\n' "$name" | \
    /usr/bin/git -C "$REPO" commit-tree "$tree" -p "$B0")
  production_transition_canonical_review "$B0" "$S2" "$forged_p6" \
    run:516 transition:2026-08-29 replay:0123456789abcdef \
    1999999900 2000000100 > "$statement"
  /usr/bin/ssh-keygen -q -Y sign -f "$REVIEW_KEY" -n git "$statement" >/dev/null
  assert_rejected "$name tombstone manifest" /usr/bin/env \
    PRODUCTION_TRANSITION_TARGET_SIGNING_KEY="$TARGET_KEY" \
    "$REPO/ops/deploy/production-transition-publisher.sh" prepare \
      "$S2" "$forged_p6" "$statement" "$statement.sig"
}
for MANIFEST_ATTACK in missing extra duplicate reordered forged; do
  assert_manifest_attack "$MANIFEST_ATTACK" "$MANIFEST_ATTACK"
done

# Processes reject simultaneous, wrong, legacy, and caller-named authority.
assert_rejected 'reviewer simultaneous authority' /usr/bin/env \
  PRODUCTION_TRANSITION_REVIEW_SIGNING_KEY="$REVIEW_KEY" \
  PRODUCTION_TRANSITION_TARGET_SIGNING_KEY="$TARGET_KEY" \
  "$REPO/ops/deploy/production-transition-reviewer.sh" review "$S2" \
  1999999900 2000000100 "$FIXTURE"
assert_rejected 'publisher simultaneous authority' /usr/bin/env \
  PRODUCTION_TRANSITION_TARGET_SIGNING_KEY="$TARGET_KEY" \
  PRODUCTION_TRANSITION_REVIEW_SIGNING_KEY="$REVIEW_KEY" \
  "$REPO/ops/deploy/production-transition-publisher.sh" prepare "$S2" "$P6" \
  "$STATEMENT" "$SIGNATURE"
assert_rejected 'caller-named checks' /usr/bin/env \
  PRODUCTION_TRANSITION_TARGET_SIGNING_KEY="$TARGET_KEY" \
  PRODUCTION_TRANSITION_REQUIRED_CHECKS=attacker-check \
  "$REPO/ops/deploy/production-transition-publisher.sh" prepare "$S2" "$P6" \
  "$STATEMENT" "$SIGNATURE"
assert_rejected 'fake GitHub context' /usr/bin/env \
  PRODUCTION_TRANSITION_TARGET_SIGNING_KEY="$TARGET_KEY" \
  GITHUB_REPOSITORY=attacker/social-monitor \
  "$REPO/ops/deploy/production-transition-publisher.sh" prepare "$S2" "$P6" \
  "$STATEMENT" "$SIGNATURE"
assert_rejected 'same review key used as target key' /usr/bin/env \
  PRODUCTION_TRANSITION_TARGET_SIGNING_KEY="$REVIEW_KEY" \
  "$REPO/ops/deploy/production-transition-publisher.sh" prepare "$S2" "$P6" \
  "$STATEMENT" "$SIGNATURE"

resign_mutation() {
  local name=$1 expression=$2 destination prefix review_id
  destination=$FIXTURE/$name.statement
  /usr/bin/sed "$expression" "$STATEMENT" > "$destination"
  prefix=$(/usr/bin/head -n -1 "$destination")
  review_id=$(printf '%s\n' "$prefix" | /usr/bin/sha256sum | /usr/bin/awk '{print $1}')
  printf '%s\nreview-id=%s\n' "$prefix" "$review_id" > "$destination"
  /usr/bin/ssh-keygen -q -Y sign -f "$REVIEW_KEY" -n git "$destination" >/dev/null
  printf '%s\n' "$destination"
}
for mutation in \
  'repo|s/^repository=.*/repository=attacker\/social-monitor/' \
  'run|s/^run-id=.*/run-id=fake:run/' \
  'b0|s/^b0=.*/b0=1111111111111111111111111111111111111111/' \
  'v1|s/canonical-review-v2/canonical-review-v1/'; do
  NAME=${mutation%%|*}; EXPRESSION=${mutation#*|}
  MUTATED=$(resign_mutation "$NAME" "$EXPRESSION")
  assert_rejected "$NAME canonical mutation" /usr/bin/env \
    PRODUCTION_TRANSITION_TARGET_SIGNING_KEY="$TARGET_KEY" \
    "$REPO/ops/deploy/production-transition-publisher.sh" prepare "$S2" "$P6" \
    "$MUTATED" "$MUTATED.sig"
done

/bin/cp "$STATEMENT" "$FIXTURE/signer-swap.statement"
/usr/bin/ssh-keygen -q -Y sign -f "$TARGET_KEY" -n git \
  "$FIXTURE/signer-swap.statement" >/dev/null
assert_rejected 'review signer swap' /usr/bin/env \
  PRODUCTION_TRANSITION_TARGET_SIGNING_KEY="$TARGET_KEY" \
  "$REPO/ops/deploy/production-transition-publisher.sh" prepare "$S2" "$P6" \
  "$FIXTURE/signer-swap.statement" "$FIXTURE/signer-swap.statement.sig"

# Reordered/duplicate canonical fields and target-tree mutation fail closed.
{ /usr/bin/head -n 2 "$STATEMENT"; /usr/bin/sed -n '2,$p' "$STATEMENT"; } \
  > "$FIXTURE/duplicate.statement"
/usr/bin/ssh-keygen -q -Y sign -f "$REVIEW_KEY" -n git \
  "$FIXTURE/duplicate.statement" >/dev/null
assert_rejected 'duplicate canonical field' /usr/bin/env \
  PRODUCTION_TRANSITION_TARGET_SIGNING_KEY="$TARGET_KEY" \
  "$REPO/ops/deploy/production-transition-publisher.sh" prepare "$S2" "$P6" \
  "$FIXTURE/duplicate.statement" "$FIXTURE/duplicate.statement.sig"

MUTATION_INDEX=$FIXTURE/target.index
EXTRA_BLOB=$(printf '%s\n' mutation | /usr/bin/git -C "$REPO" hash-object -w --stdin)
GIT_INDEX_FILE=$MUTATION_INDEX /usr/bin/git -C "$REPO" read-tree "$T^{tree}"
GIT_INDEX_FILE=$MUTATION_INDEX /usr/bin/git -C "$REPO" update-index --add --cacheinfo \
  "100644,$EXTRA_BLOB,target-mutation.txt"
MUTATED_TREE=$(GIT_INDEX_FILE=$MUTATION_INDEX /usr/bin/git -C "$REPO" write-tree)
MUTATED_T=$(/usr/bin/git -C "$REPO" show -s --format=%B "$T" | \
  /usr/bin/git -C "$REPO" -c gpg.format=ssh \
  -c gpg.ssh.program=/usr/bin/ssh-keygen -c user.signingkey="$TARGET_KEY" \
  commit-tree -S "$MUTATED_TREE" -p "$P6" -p "$S2")
assert_rejected 'target mutation' \
  "$REPO/ops/deploy/production-transition-admission.sh" verify --target "$MUTATED_T"

# Publication consumes the signed review atomically; an exact retry converges
# on the already-published target without changing either protected ref.
PRODUCTION_TRANSITION_TARGET_SIGNING_KEY=$TARGET_KEY \
  "$REPO/ops/deploy/production-transition-publisher.sh" publish "$T" >/dev/null
RETRY_RESULT=$(PRODUCTION_TRANSITION_TEST_NOW_EPOCH=2000000200 \
  PRODUCTION_TRANSITION_TARGET_SIGNING_KEY=$TARGET_KEY \
  "$REPO/ops/deploy/production-transition-publisher.sh" publish "$T")
/usr/bin/grep -Fx "published-t=$T" <<< "$RETRY_RESULT" >/dev/null
[[ $(/usr/bin/git --git-dir="$REMOTE" rev-parse refs/heads/main) == "$T" ]]
[[ $(/usr/bin/git --git-dir="$REMOTE" rev-parse \
  "refs/production-transition/review-consumed/$(/usr/bin/sed -n 's/^review-id=//p' <<< "$PUBLISH_RESULT")") == "$T" ]]
PREPARE_RETRY=$(PRODUCTION_TRANSITION_TEST_NOW_EPOCH=2000000200 \
  PRODUCTION_TRANSITION_TARGET_SIGNING_KEY=$TARGET_KEY \
  "$REPO/ops/deploy/production-transition-publisher.sh" prepare "$S2" "$P6" \
  "$STATEMENT" "$SIGNATURE")
[[ $(/usr/bin/sed -n 's/^t=//p' <<< "$PREPARE_RETRY") == "$T" ]]

assert_rejected 'different target cannot reuse consumed review' /usr/bin/env \
  PRODUCTION_TRANSITION_TARGET_SIGNING_KEY="$TARGET_KEY" \
  "$REPO/ops/deploy/production-transition-publisher.sh" publish "$MUTATED_T"

[[ ! -e $SENTINEL ]] || fail 'candidate executable was ever run'
printf 'production transition split-authority canonical v2 E2E passed\n'
