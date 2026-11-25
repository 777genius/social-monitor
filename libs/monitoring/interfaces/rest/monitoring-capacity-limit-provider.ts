import {
  defaultMonitoringCapacityLimits,
  type MonitoringCapacityLimits,
} from "../../features/shared/monitoring-capacity-limits";

export const resolveMonitoringCapacityLimits = (
  env: NodeJS.ProcessEnv,
): Required<MonitoringCapacityLimits> => ({
  maxInterestsPerWorkspace:
    parseOptionalPositiveInteger(env.MONITORING_MAX_INTERESTS_PER_WORKSPACE) ??
    defaultMonitoringCapacityLimits.maxInterestsPerWorkspace,
  maxEnabledSourcesPerInterest:
    parseOptionalPositiveInteger(
      env.MONITORING_MAX_ENABLED_SOURCES_PER_INTEREST,
    ) ?? defaultMonitoringCapacityLimits.maxEnabledSourcesPerInterest,
});

export const parseOptionalPositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
