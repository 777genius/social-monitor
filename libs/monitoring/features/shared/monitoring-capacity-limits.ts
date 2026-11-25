export type MonitoringCapacityLimits = {
  readonly maxInterestsPerWorkspace?: number;
  readonly maxEnabledSourcesPerInterest?: number;
};

export const defaultMonitoringCapacityLimits: Required<MonitoringCapacityLimits> =
  {
    maxInterestsPerWorkspace: 10,
    maxEnabledSourcesPerInterest: 5,
  };
