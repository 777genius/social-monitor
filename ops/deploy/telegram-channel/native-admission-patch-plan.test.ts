import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { nativeAdmissionBefore, nativeAdmissionPaths, planTelegramAdmissionExtension, sha256 } from './native-admission-patch-plan';

const snapshot = process.env.TELEGRAM_NATIVE_SNAPSHOT_DIR;
assert(snapshot, 'Set TELEGRAM_NATIVE_SNAPSHOT_DIR to the retained read-only native snapshot');
const input = {
  profile: readFileSync(resolve(snapshot, 'current_profile_admission.py'), 'utf8'),
  physical: readFileSync(resolve(snapshot, 'physical_operator_epoch.py'), 'utf8'),
  stage: readFileSync(resolve(snapshot, 'social-monitor-posts-current-authority-stage'), 'utf8'),
  router: readFileSync(resolve(snapshot, 'social-monitor-posts-once'), 'utf8'),
  history: readFileSync(resolve(snapshot, 'social-monitor-posts-history-preclaim.sh'), 'utf8'),
  lineage: readFileSync(resolve(snapshot, 'current_admission_sources.py'), 'utf8'),
  telegram: readFileSync(resolve('ops/deploy/telegram-channel/current_telegram_channel_admission.py'), 'utf8'),
  telegramShell: readFileSync(resolve('ops/deploy/telegram-channel/telegram-channel-mode.sh'), 'utf8'),
  telegramEntrypoint: readFileSync(resolve('ops/deploy/telegram-channel/collection-entrypoint.sh'), 'utf8'),
};

void test('reproduces the full source cascade without installation effects', () => {
  const result = planTelegramAdmissionExtension(input);
  assert.deepEqual(result, planTelegramAdmissionExtension(input));
  assert.equal(result.mode, 'offline-plan-only');
  assert.equal(result.files.length, 9);
  const file = (key: keyof typeof nativeAdmissionPaths) => {
    const value = result.files.find((entry) => entry.path === nativeAdmissionPaths[key]);
    assert(value);
    return value;
  };
  for (const entry of result.files) assert.equal(entry.afterSha256, sha256(entry.content));
  const profile = file('profile');
  const physical = file('physical');
  const stage = file('stage');
  const telegram = file('telegram');
  const history = file('history');
  const router = file('router');
  assert(physical.content.includes(`LIB / 'current_profile_admission.py': '${profile.afterSha256}'`));
  assert(physical.content.includes(`LIB / 'current_telegram_channel_admission.py': '${telegram.afterSha256}'`));
  for (const key of ['router', 'history', 'lineage', 'telegramShell', 'telegramEntrypoint'] as const) {
    assert(physical.content.includes(file(key).afterSha256));
  }
  assert(router.content.includes(history.afterSha256));
  assert(router.content.includes(file('telegramShell').afterSha256));
  assert(stage.content.includes(`'current_profile_admission': '${profile.afterSha256}'`));
  assert(stage.content.includes(`'physical_operator_epoch': '${physical.afterSha256}'`));
  assert(stage.content.includes(`'current_telegram_channel_admission': '${telegram.afterSha256}'`));
  assert(stage.content.includes(file('lineage').afterSha256));
  assert.equal(profile.content.split('telegram.open_claim(r, path, original, attempt_id)').length - 1, 2);

  const originalProfile = profile.content.replace(
    "    if values.get('mode') == 'telegram-channel':\n        import current_telegram_channel_admission as telegram\n" +
    "        telegram.validate_attempt(values, pairs, attempt, until, now)\n        return deadline_epoch(until, now)\n", '',
  ).replace("    if fields['mode'] == 'telegram-channel':\n" +
    "        return prewrite_identity(receipt, fields['date'], fields['slot'], now)\n", '',
  ).replaceAll("    import current_telegram_channel_admission as telegram\n" +
    "    telegram.open_claim(r, path, original, attempt_id)\n", '');
  assert.equal(originalProfile, input.profile);
  const historyAdd = history.content.indexOf('  if [[ ${previous_fields[1]:-} == mode=telegram-channel ]]; then\n');
  const historyEnd = history.content.indexOf('  if [[ ${previous_fields[1]:-} == mode=materialize-retained-source-captures ]]; then', historyAdd);
  assert(historyAdd >= 0 && historyEnd > historyAdd);
  assert.equal(history.content.slice(0, historyAdd) + history.content.slice(historyEnd), input.history);
  assert(history.content.includes('role_closed "$previous_id" && container_absent "social-posts-${previous_id,,}" &&'));
  assert(history.content.includes('watchdog_inactive "social-posts-wd-${previous_id#*-}"'));
  let originalPhysical = physical.content.split('\n').filter((line) => !line.includes("LIB / 'current_telegram_channel_admission.py':") &&
    !line.includes(`Path('${nativeAdmissionPaths.telegramShell}'):`) &&
    !line.includes(`Path('${nativeAdmissionPaths.telegramEntrypoint}'):`)).join('\n');
  for (const key of ['profile', 'router', 'history', 'lineage'] as const) {
    originalPhysical = originalPhysical.replace(file(key).afterSha256, nativeAdmissionBefore[key]);
  }
  assert.equal(originalPhysical, input.physical);
});

void test('rejects drift before producing any output or a partial cascade', () => {
  for (const key of ['profile', 'physical', 'stage', 'router', 'history', 'lineage'] as const) {
    assert.throws(() => planTelegramAdmissionExtension({ ...input, [key]: input[key] + '\n' }), /before SHA changed/);
  }
  assert.throws(() => planTelegramAdmissionExtension({ ...input, telegramEntrypoint: input.telegramEntrypoint + '\n' }), /entrypoint pin differs/);
});
