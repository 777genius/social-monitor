import type { DeploymentPostgresBudgetConfiguration } from './postgres-runtime-pool-budget';

export function productionBudgetFixture(): DeploymentPostgresBudgetConfiguration {
  return {
    providerCapacityFacts: {
      serverMaxConnections: 25,
      superuserReservedConnections: 3,
      reservedConnections: 0,
      roleConnectionLimit: -1,
      databaseConnectionLimit: -1,
      externalConnectionOccupancy: 0,
      stoppedRuntimeConnectionOccupancy: 0,
      capturePhase: 'post-old-container-stop-pre-new-start',
    },
    runtimes: [
      topology('api-gateway', 2),
      topology('ingestion-worker', 2),
      topology('intelligence-worker', 2),
      topology('delivery-service', 1),
      topology('event-relay', 1),
      topology('daily-runner', 2),
    ],
    replacementOverlapConnections: 0,
  };
}

function topology(
  processId: DeploymentPostgresBudgetConfiguration['runtimes'][number]['processId'],
  poolMax: DeploymentPostgresBudgetConfiguration['runtimes'][number]['poolMax'],
): DeploymentPostgresBudgetConfiguration['runtimes'][number] {
  return {
    processId,
    poolMin: 0,
    poolMax,
    replicas: 1,
  };
}
