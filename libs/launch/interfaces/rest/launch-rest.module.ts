import { Module } from '@nestjs/common';

import { StaticBetaLaunchSupportReadModel } from '../../adapters/static/static-beta-launch-support.read-model';
import { GetBetaLaunchSupportUseCase } from '../../features/get-beta-launch-support/get-beta-launch-support.use-case';
import {
  BETA_LAUNCH_SUPPORT_READ_MODEL,
  type BetaLaunchSupportReadModelPort,
} from '../../ports';
import { BetaLaunchSupportController } from './beta-launch-support.controller';

@Module({
  controllers: [BetaLaunchSupportController],
  providers: [
    StaticBetaLaunchSupportReadModel,
    {
      provide: BETA_LAUNCH_SUPPORT_READ_MODEL,
      useExisting: StaticBetaLaunchSupportReadModel,
    },
    {
      provide: GetBetaLaunchSupportUseCase,
      useFactory: (readModel: BetaLaunchSupportReadModelPort) =>
        new GetBetaLaunchSupportUseCase(readModel),
      inject: [BETA_LAUNCH_SUPPORT_READ_MODEL],
    },
  ],
  exports: [GetBetaLaunchSupportUseCase, BETA_LAUNCH_SUPPORT_READ_MODEL],
})
export class LaunchRestModule {}
