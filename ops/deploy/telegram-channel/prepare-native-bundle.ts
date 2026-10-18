import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nativeAdmissionPaths, planTelegramAdmissionExtension, sha256 } from './native-admission-patch-plan';

// Offline preparation. This command never connects to or writes production.
const [snapshot, destination] = process.argv.slice(2);
if (!snapshot || !destination || process.argv.length !== 4) throw new Error('Expected snapshot directory and output JSON');
const root = resolve(__dirname);
const source = (name: string): string => readFileSync(resolve(root, name), 'utf8');
const retained = (name: string): string => readFileSync(resolve(snapshot, name), 'utf8');
const plan = planTelegramAdmissionExtension({
  profile: retained('current_profile_admission.py'), physical: retained('physical_operator_epoch.py'),
  stage: retained('social-monitor-posts-current-authority-stage'), router: retained('social-monitor-posts-once'),
  history: retained('social-monitor-posts-history-preclaim.sh'), lineage: retained('current_admission_sources.py'),
  telegram: source('current_telegram_channel_admission.py'), telegramShell: source('telegram-channel-mode.sh'),
  telegramEntrypoint: source('collection-entrypoint.sh'),
});
const extra = ['social-monitor-telegram-channel.service', 'social-monitor-telegram-channel.timer'].map((name) => {
  const content = source(name);
  return { path: `/etc/systemd/system/${name}`, beforeSha256: null, afterSha256: sha256(content), content };
});
const fileMode = (path: string): number => {
  if ([nativeAdmissionPaths.router, nativeAdmissionPaths.stage].some((entry) => entry === path)) return 0o755;
  if ([nativeAdmissionPaths.profile, nativeAdmissionPaths.physical, nativeAdmissionPaths.lineage].some((entry) => entry === path)) return 0o600;
  return 0o644;
};
const files = [...plan.files, ...extra].map((file) => ({ ...file, mode: fileMode(file.path) }));
writeFileSync(destination, JSON.stringify({ version: 1, machineId: 'b28fc7b17042414386eb9b114046e50c', files }) + '\n',
  { flag: 'wx', mode: 0o600 });
process.stdout.write(JSON.stringify({ mode: 'offline-prepared', files: files.map(({ path, beforeSha256, afterSha256 }) =>
  ({ path, beforeSha256, afterSha256 })) }) + '\n');
