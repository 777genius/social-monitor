import { createHash } from 'node:crypto';

/** Offline byte transformation only. This module never reads or writes installed files. */
export type NativeAdmissionSources = Readonly<{
  profile: string;
  physical: string;
  stage: string;
  telegram: string;
  router: string;
  history: string;
  lineage: string;
  telegramShell: string;
  telegramEntrypoint: string;
}>;
export const nativeAdmissionBefore = Object.freeze({
  profile: '28a583614833f39b9bcb567fa25e262d20cb1e1df4906bc4217cec18a50d317d',
  physical: 'dbd61cb3d3a31dfe9a8177ef9fdb3203855e80d3bd2487cff986856a719965d2',
  stage: 'b652607cc16c2824e9178ec347d6347eec9f0e4e832734a7d8a7af9262162269',
  router: 'eef5803095b76d5e346031d953a2368c2fc62792846847bddf10563d61f08234',
  history: '7c54cdb53a6944ceafd145bccf735ade274d77d4206c8a19ca49d7cc78e15ca3',
  lineage: '4703f81b0f9ac087b3a9a7ba3ab73ba90fd72ba6034bf0064a699bdb55ef88d4',
});
export const nativeAdmissionPaths = Object.freeze({
  profile: '/usr/local/lib/social-monitor/current-source-guard/current_profile_admission.py',
  physical: '/usr/local/lib/social-monitor/current-source-guard/physical_operator_epoch.py',
  stage: '/usr/local/sbin/social-monitor-posts-current-authority-stage',
  telegram: '/usr/local/lib/social-monitor/current-source-guard/current_telegram_channel_admission.py',
  telegramShell: '/usr/local/lib/social-monitor/telegram-channel/telegram-channel-mode.sh',
  telegramEntrypoint: '/usr/local/lib/social-monitor/telegram-channel/collection-entrypoint.sh',
  router: '/usr/local/sbin/social-monitor-posts-once',
  history: '/usr/local/sbin/social-monitor-posts-history-preclaim.sh',
  lineage: '/usr/local/lib/social-monitor/current-source-guard/current_admission_sources.py',
});
export const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

const replaceExact = (source: string, before: string, after: string, expected = 1): string => {
  if (source.split(before).length - 1 !== expected) throw new Error('Native patch anchor changed');
  return source.split(before).join(after);
};

export const planTelegramAdmissionExtension = (input: NativeAdmissionSources) => {
  for (const name of ['profile', 'physical', 'stage', 'router', 'history', 'lineage'] as const) {
    if (sha256(input[name]) !== nativeAdmissionBefore[name]) throw new Error(`Native before SHA changed: ${name}`);
  }
  if (!input.telegram.startsWith('"""Fixed Telegram admission data checks;') || input.telegram.includes('\r')) {
    throw new Error('Unexpected Telegram module bytes');
  }
  if (!input.telegramShell.includes('telegram_channel_init()') || !input.telegramShell.includes('telegram_channel_run()') ||
      input.telegramShell.includes('\r')) throw new Error('Unexpected Telegram shell module bytes');
  let profile = replaceExact(input.profile,
    "    if values.get('mode') == 'materialize-retained-source-captures':\n",
    "    if values.get('mode') == 'telegram-channel':\n" +
    "        import current_telegram_channel_admission as telegram\n" +
    "        telegram.validate_attempt(values, pairs, attempt, until, now)\n" +
    "        return deadline_epoch(until, now)\n" +
    "    if values.get('mode') == 'materialize-retained-source-captures':\n");
  profile = replaceExact(profile,
    "    if fields['mode'] == 'materialize-retained-source-captures':\n",
    "    if fields['mode'] == 'telegram-channel':\n" +
    "        return prewrite_identity(receipt, fields['date'], fields['slot'], now)\n" +
    "    if fields['mode'] == 'materialize-retained-source-captures':\n");
  const claim = "    retained.open_claim(r, path, original, attempt_id)\n";
  profile = replaceExact(profile, claim, claim +
    "    import current_telegram_channel_admission as telegram\n" +
    "    telegram.open_claim(r, path, original, attempt_id)\n", 2);

  const moduleSha = sha256(input.telegram);
  const shellSha = sha256(input.telegramShell);
  const entrySha = sha256(input.telegramEntrypoint);
  if (!input.telegramShell.includes(entrySha)) throw new Error('Telegram shell entrypoint pin differs from supplied bytes');
  const validator = nativeAdmissionPaths.telegram;
  const validatorCheck = `[[ -f ${validator} && ! -L ${validator} && $(stat -c '%u:%g:%a:%h' ${validator}) == 0:0:644:1 &&\n` +
    `     $(sha256sum ${validator} | cut -d' ' -f1) == ${moduleSha} ]]`;
  const validateTerminal = `[[ $(/usr/bin/python3 -I -S -B ${validator} validate-terminal "$previous_id") == TELEGRAM_TERMINAL_VALIDATED ]]`;
  const history = replaceExact(input.history,
    '  if [[ ${previous_fields[1]:-} == mode=materialize-retained-source-captures ]]; then',
    '  if [[ ${previous_fields[1]:-} == mode=telegram-channel ]]; then\n' +
    `    ${validatorCheck} || posts_preclaim_refuse "$LINENO" PRIOR_TELEGRAM\n` +
    `    ${validateTerminal} || posts_preclaim_refuse "$LINENO" PRIOR_TELEGRAM\n` +
    '    role_closed "$previous_id" && container_absent "social-posts-${previous_id,,}" &&\n' +
    '      watchdog_inactive "social-posts-wd-${previous_id#*-}" || posts_preclaim_refuse "$LINENO" PRIOR_TELEGRAM\n' +
    `    ${validateTerminal} || posts_preclaim_refuse "$LINENO" PRIOR_TELEGRAM\n` +
    '    continue\n  fi\n' +
    '  if [[ ${previous_fields[1]:-} == mode=materialize-retained-source-captures ]]; then');
  const historySha = sha256(history);
  let router = replaceExact(input.router, `== ${nativeAdmissionBefore.history} ]]`, `== ${historySha} ]]`);
  router = replaceExact(router, 'case "$mode" in\n', 'case "$mode" in\n  telegram-channel)\n' +
    `    ${validatorCheck} || exit 78\n` +
    `    telegram_module=${nativeAdmissionPaths.telegramShell}\n` +
    '    [[ -f $telegram_module && ! -L $telegram_module &&\n' +
    "       $(stat -c '%u:%g:%a:%h' \"$telegram_module\") == 0:0:644:1 &&\n" +
    `       $(sha256sum "$telegram_module" | cut -d' ' -f1) == ${shellSha} ]] || exit 78\n` +
    '    source "$telegram_module" || exit 78\n    telegram_channel_init "$@" || exit 64\n    ;;\n');
  router = replaceExact(router, 'source "$history_preclaim"\n', 'source "$history_preclaim"\n' +
    'if [[ $mode == telegram-channel ]]; then telegram_channel_run; exit 78; fi\n');
  const canonicalDay = '     $(date -u -d "$old_day" +%F 2>/dev/null) == "$old_day" ]] || return 1\n';
  router = replaceExact(router, canonicalDay, canonicalDay +
    '  if [[ $mode == telegram-channel ]]; then [[ $old_day < $day || $old_day == "$day" ]]; return; fi\n');
  const routerSha = sha256(router);
  let lineage = replaceExact(input.lineage, 'RETAINED = {key:',
    `TELEGRAM_PREVIOUS_OWNER_PAIR = {'router': '${nativeAdmissionBefore.router}', 'fence': '84d93196dc54561061ffdd97cca88aa78c66705965aff64b50aea7868acc37e4'}\nRETAINED = {key:`);
  lineage = replaceExact(lineage, 'pair == HISTORICAL or pair == PREVIOUS_OWNER_PAIR',
    'pair == HISTORICAL or pair == TELEGRAM_PREVIOUS_OWNER_PAIR or pair == PREVIOUS_OWNER_PAIR');
  const lineageSha = sha256(lineage);
  const profileSha = sha256(profile);
  let physical = replaceExact(input.physical,
    `    LIB / 'current_profile_admission.py': '${nativeAdmissionBefore.profile}',`,
    `    LIB / 'current_profile_admission.py': '${profileSha}',`);
  physical = replaceExact(physical, 'PINS = {\n',
    `PINS = {\n    LIB / 'current_telegram_channel_admission.py': '${moduleSha}',\n` +
    `    Path('${nativeAdmissionPaths.telegramShell}'): '${shellSha}',\n` +
    `    Path('${nativeAdmissionPaths.telegramEntrypoint}'): '${entrySha}',\n`);
  for (const [before, after] of [[nativeAdmissionBefore.router, routerSha],
    [nativeAdmissionBefore.history, historySha], [nativeAdmissionBefore.lineage, lineageSha]]) {
    physical = replaceExact(physical, `'${before}',`, `'${after}',`);
  }
  const physicalSha = sha256(physical);
  let stage = replaceExact(input.stage,
    `    'current_profile_admission': '${nativeAdmissionBefore.profile}',`,
    `    'current_profile_admission': '${profileSha}',`);
  stage = replaceExact(stage,
    `    'physical_operator_epoch': '${nativeAdmissionBefore.physical}',`,
    `    'physical_operator_epoch': '${physicalSha}',`);
  stage = replaceExact(stage, 'SOURCES = {\n',
    `SOURCES = {\n    'current_telegram_channel_admission': '${moduleSha}',\n`);
  stage = replaceExact(stage, `'${nativeAdmissionBefore.lineage}',`, `'${lineageSha}',`);
  const contents = { telegram: input.telegram, telegramShell: input.telegramShell,
    telegramEntrypoint: input.telegramEntrypoint, history, router, lineage, profile, physical, stage };
  return {
    mode: 'offline-plan-only' as const,
    before: nativeAdmissionBefore,
    files: (['telegram', 'telegramShell', 'telegramEntrypoint', 'history', 'router', 'lineage', 'profile', 'physical', 'stage'] as const).map((name) => ({
      path: nativeAdmissionPaths[name],
      beforeSha256: name === 'telegram' || name === 'telegramShell' || name === 'telegramEntrypoint' ? null : nativeAdmissionBefore[name],
      afterSha256: sha256(contents[name]),
      content: contents[name],
    })),
    untouched: ['social-monitor-posts-generation-fence', 'database guard', 'historical native evidence pin'],
  };
};
