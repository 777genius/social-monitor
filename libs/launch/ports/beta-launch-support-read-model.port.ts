import type { BetaLaunchSupportSnapshot } from '../domain';

export const BETA_LAUNCH_SUPPORT_READ_MODEL = Symbol('BETA_LAUNCH_SUPPORT_READ_MODEL');

export interface BetaLaunchSupportReadModelPort {
  getSnapshot(): Promise<BetaLaunchSupportSnapshot>;
}
