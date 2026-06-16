import { ok, type Result } from '@social-monitor/shared-kernel';

import type { BetaLaunchSupportReadModelPort } from '../../ports';
import type { GetBetaLaunchSupportResult } from './get-beta-launch-support.result';

export class GetBetaLaunchSupportUseCase {
  constructor(private readonly readModel: BetaLaunchSupportReadModelPort) {}

  async execute(): Promise<Result<GetBetaLaunchSupportResult, Error>> {
    return ok(await this.readModel.getSnapshot());
  }
}
