export function validateExternalBetaCapacityAndExceptions({ contract, contractPath, violations }) {
  const envelope = contract.capacityEnvelope ?? {};
  for (const numericField of [
    'maxUsers',
    'maxTopicsPerWorkspace',
    'maxEnabledSourcesPerTopic',
    'maxManualScansPerWorkspacePerHour',
    'maxSummaryRequestsPerWorkspacePerHour',
    'maxQueueLagSeconds',
    'maxSummaryEstimatedCostUsdPerWorkspacePerDay',
    'maxDeliveryAttemptsPerWorkspacePerHour',
  ]) {
    if (!Number.isFinite(envelope[numericField]) || envelope[numericField] <= 0) {
      violations.push(`${contractPath}: capacityEnvelope.${numericField} must be positive`);
    }
  }

  for (const exception of contract.noGoExceptions ?? []) {
    if (exception.blocking !== true) {
      violations.push(`${contractPath}: noGoException "${exception.exceptionId}" must be blocking`);
    }
    for (const field of ['exceptionId', 'owner', 'exitCondition']) {
      if (typeof exception[field] !== 'string' || exception[field].trim().length === 0) {
        violations.push(`${contractPath}: noGoException must define ${field}`);
      }
    }
  }
}
