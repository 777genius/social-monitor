import { Module } from "@nestjs/common";
import { resolvePostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";

import { PrismaMonitoringConnection } from "../../adapters/persistence/prisma/prisma-monitoring-connection";
import type { PrismaMonitoringClient } from "../../adapters/persistence/prisma/prisma-monitoring-client";
import {
  MONITORING_PERSISTENCE_MODE,
  MONITORING_PRISMA_CLIENT,
  type MonitoringPersistenceMode,
  monitoringPersistenceModeProvider,
} from "./monitoring-provider-tokens";

@Module({
  providers: [
    monitoringPersistenceModeProvider,
    {
      provide: MONITORING_PRISMA_CLIENT,
      useFactory: async (
        mode: MonitoringPersistenceMode,
      ): Promise<PrismaMonitoringClient | null> =>
        mode === "prisma"
          ? PrismaMonitoringConnection.create(
              resolvePostgresRuntimePoolConfig(process.env),
            )
          : null,
      inject: [MONITORING_PERSISTENCE_MODE],
    },
  ],
  exports: [MONITORING_PERSISTENCE_MODE, MONITORING_PRISMA_CLIENT],
})
export class MonitoringPrismaClientModule {}
