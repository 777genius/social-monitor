#!/usr/bin/env bash
# One-time normal metadata use cases over the existing local postgres peer socket.
# The reviewed CI image/commit/tree are the only positional inputs; no DB secrets.
set -euo pipefail
umask 077
[[ $EUID == 0 && $(cat /etc/machine-id) == b28fc7b17042414386eb9b114046e50c ]] || exit 78
[[ $# == 3 && $1 =~ ^sha256:[0-9a-f]{64}$ && $2 =~ ^[0-9a-f]{40}$ && $3 =~ ^[0-9a-f]{40}$ ]] || exit 64
image=$1
commit=$2
tree=$3
state=/var/lib/platform/social-monitor
release_dir=$state/telegram-channel
validator=/usr/local/lib/social-monitor/current-source-guard/current_telegram_channel_admission.py
[[ -f $state/collection/.posts-once.lock && ! -L $state/collection/.posts-once.lock &&
   $(stat -c '%u:%g:%a:%h' "$state/collection/.posts-once.lock") == 0:0:600:1 ]] || exit 78
exec 9<> "$state/collection/.posts-once.lock"
flock --nonblock 9 || exit 75
[[ $(/usr/local/sbin/social-monitor-posts-generation-fence admit) == social_monitor_collection_v2 ]] || exit 75
[[ $(docker image inspect -f '{{.Id}}' "$image") == "$image" &&
   $(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image") == "$commit" ]] || exit 78
if [[ -e $release_dir/release.json || -L $release_dir/release.json ]]; then
  /usr/bin/python3 -I -S -B "$validator" release |
    jq -e --arg image "$image" --arg commit "$commit" --arg tree "$tree" \
      '.release.image==$image and .release.sourceCommit==$commit and .release.sourceTree==$tree' >/dev/null
  exit 0
fi
if [[ ! -e $release_dir && ! -L $release_dir ]]; then mkdir -m 700 "$release_dir"; fi
[[ -d $release_dir && ! -L $release_dir && $(stat -c '%u:%g:%a' "$release_dir") == 0:0:700 ]] || exit 78
name=social-telegram-bootstrap-$(cat /proc/sys/kernel/random/uuid)
watchdog_unit=$name-wd
bootstrap_completed=0
cleanup() {
  local rc=$? present timer_state service_state timer_job service_job
  trap - EXIT INT TERM
  set +e
  timeout --signal=TERM --kill-after=3s 15s docker rm -f "$name" >/dev/null 2>&1
  present=$(timeout --signal=TERM --kill-after=3s 15s docker container ls -a --filter "name=^/${name}$" --format '{{.Names}}')
  if [[ $? != 0 || -n $present ]]; then
    echo 'Telegram bootstrap cleanup uncertain; independent watchdog remains armed' >&2
    exit 78
  fi
  if [[ $bootstrap_completed != 1 ]]; then
    echo 'Telegram bootstrap launch outcome uncertain; independent watchdog remains armed' >&2
    exit 78
  fi
  systemctl stop "$watchdog_unit.timer" "$watchdog_unit.service" >/dev/null 2>&1
  timer_state=$(systemctl show -p ActiveState --value "$watchdog_unit.timer") || exit 78
  service_state=$(systemctl show -p ActiveState --value "$watchdog_unit.service") || exit 78
  timer_job=$(systemctl show -p Job --value "$watchdog_unit.timer") || exit 78
  service_job=$(systemctl show -p Job --value "$watchdog_unit.service") || exit 78
  [[ $timer_state == inactive && $service_state == inactive &&
     ( -z $timer_job || $timer_job == 0 ) && ( -z $service_job || $service_job == 0 ) ]] || exit 78
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
systemd-run --quiet --unit="$watchdog_unit" --on-active=4m --on-unit-active=1m \
  --property=Type=oneshot --property=TimeoutStartSec=30s \
  /usr/bin/docker rm -f "$name"
systemctl is-active --quiet "$watchdog_unit.timer" || exit 78
# Existing immutable image helpers, composed only for the fixed metadata scope.
# READ WRITE is transaction-local; no database/role defaults or source/feed writes.
bootstrap_program=$(cat <<'JAVASCRIPT'
const { acquirePrismaPgRuntimeConnection, defaultPostgresRuntimePoolConfig, runWithTenantDatabaseAccess } = require('@social-monitor/platform-persistence');
const { loadPrismaRuntimeClient } = require('@social-monitor/platform-persistence/prisma-runtime-client');
const { CryptoIdGenerator, SystemClock } = require('@social-monitor/shared-kernel');
const { AesGcmSourceBindingConfigProtector } = require('@social-monitor/monitoring/adapters/security/aes-gcm-source-binding-config-protector');
const { resolveTelegramCollectionTarget } = require('./scripts/lib/telegram-channel-collection-bootstrap');
const { telegramCollectionScope, telegramCollectionChannel, TelegramCollectionError } = require('./scripts/lib/telegram-channel-collection-contract');
const { telegramCollectionMonitoring, inspectTelegramCollectionCheckpoint } = require('./scripts/lib/telegram-channel-collection-database');
async function bootstrap() {
  if (process.env.SOCIAL_MONITOR_RUNTIME_PROFILE !== 'beta') throw new TelegramCollectionError('beta_required');
  if (!process.env.DATABASE_URL) throw new TelegramCollectionError('database_required');
  const ids = new CryptoIdGenerator(), clock = new SystemClock();
  const protector = AesGcmSourceBindingConfigProtector.fromEnvironment(process.env);
  const database = await acquirePrismaPgRuntimeConnection(defaultPostgresRuntimePoolConfig(process.env.DATABASE_URL, 'admin-tool'), loadPrismaRuntimeClient());
  try {
    const inspection = await runWithTenantDatabaseAccess(telegramCollectionScope, () => database.client.$transaction(async transaction => {
      await transaction.$executeRawUnsafe('SET TRANSACTION READ WRITE');
      const resolved = await resolveTelegramCollectionTarget('bootstrap', telegramCollectionMonitoring(transaction, ids, clock, protector));
      return { ...resolved, cursor: await inspectTelegramCollectionCheckpoint(transaction, resolved.sourceBindingId) };
    }, { maxWait: 5000, timeout: 60000 }));
    return { ok: true, schemaVersion: 1, mode: 'bootstrap', channel: telegramCollectionChannel, ...telegramCollectionScope,
      catalogReady: inspection.catalogReady, sourceBindingId: inspection.sourceBindingId, scanPolicyId: inspection.scanPolicyId,
      cursor: inspection.cursor, status: inspection.target === undefined ? 'not_bootstrapped' : 'ready' };
  } finally { await database.close(); }
}
bootstrap().then(result => console.log(JSON.stringify(result))).catch(error => {
  console.log(JSON.stringify({ ok: false, code: error instanceof TelegramCollectionError ? error.code : 'runtime_failed' }));
  process.exitCode = 1;
});
JAVASCRIPT
)
export SOURCE_CONFIG_ENCRYPTION_KEY
SOURCE_CONFIG_ENCRYPTION_KEY=$(openssl rand -base64 32)
result=$(timeout --signal=TERM --kill-after=15s 3m docker run --rm --name "$name" \
  --network none --user "$(id -u postgres):$(id -g postgres)" \
  --read-only --security-opt no-new-privileges:true --cap-drop ALL --pids-limit 128 --memory 1g --cpus 1 \
  --tmpfs /tmp:rw,nosuid,nodev,size=64m \
  --mount type=bind,src=/var/run/postgresql,dst=/var/run/postgresql,readonly \
  --env DATABASE_URL='postgresql://postgres@localhost/social_monitor?host=/var/run/postgresql' \
  --env SOCIAL_MONITOR_RUNTIME_PROFILE=beta --env SOURCE_CONFIG_ENCRYPTION_KEY \
  --env SOURCE_CONFIG_ENCRYPTION_KEY_ID=telegram-public-bootstrap \
  --entrypoint node "$image" scripts/run-with-timeout.mjs --timeout-ms 120000 --node-options --max-old-space-size=512 -- \
  ts-node --transpile-only --compiler-options '{"rootDir":"."}' -r tsconfig-paths/register -e "$bootstrap_program") || {
  jq -ce 'select(.ok==false and (.code|type)=="string") | {ok:false,code}' <<< "$result" >&2 || true
  exit 78
}
bootstrap_completed=1
unset SOURCE_CONFIG_ENCRYPTION_KEY
jq -e '.ok==true and .schemaVersion==1 and .mode=="bootstrap" and .status=="ready" and .catalogReady==true
  and .channel=="hiaimediaen" and .tenantId=="00000000-0000-7000-8000-000000006101"
  and .workspaceId=="00000000-0000-7000-8000-000000006102" and .interestId=="00000000-0000-7000-8000-000000006105"
  and (.sourceBindingId|type)=="string" and (.scanPolicyId|type)=="string"' <<< "$result" >/dev/null
[[ ! -e $release_dir/release.json.next && ! -L $release_dir/release.json.next ]] || exit 78
(set -C; jq --arg image "$image" --arg commit "$commit" --arg tree "$tree" \
  '{version:1,image:$image,sourceCommit:$commit,sourceTree:$tree,channel,tenantId,workspaceId,interestId,sourceBindingId,scanPolicyId}' \
  <<< "$result" > "$release_dir/release.json.next")
sync -f "$release_dir/release.json.next"
mv -T "$release_dir/release.json.next" "$release_dir/release.json"
sync -f "$release_dir/release.json" "$release_dir"
/usr/bin/python3 -I -S -B "$validator" release
