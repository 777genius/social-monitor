export type MonitoringCapacityLimits = {
  readonly maxTopicsPerWorkspace?: number;
  readonly maxEnabledSourcesPerTopic?: number;
};

export const defaultMonitoringCapacityLimits: Required<MonitoringCapacityLimits> = {
  maxTopicsPerWorkspace: 10,
  maxEnabledSourcesPerTopic: 4,
};
