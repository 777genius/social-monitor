import type { SocialSourceKey } from '../value-objects/social-search-intent';
import type {
  SocialSourceCapabilityProfile,
  SocialSourceRuntimeReadinessState,
} from '../value-objects/social-source-capability-profile';
import type {
  SocialSearchLane,
  SocialSearchPlanWarning,
} from '../value-objects/social-search-plan';

export type SocialSourceCapabilityFilterResult = {
  readonly lanes: readonly SocialSearchLane[];
  readonly warnings: readonly SocialSearchPlanWarning[];
};

export const filterLanesBySourceCapability = (
  sourceKey: SocialSourceKey,
  lanes: readonly SocialSearchLane[],
  capability: SocialSourceCapabilityProfile | undefined,
): SocialSourceCapabilityFilterResult => {
  if (capability === undefined) {
    return { lanes, warnings: [] };
  }

  const supportedLanes = lanes.filter((laneItem) =>
    supportsLane(capability, laneItem),
  );
  const droppedCount = lanes.length - supportedLanes.length;

  return {
    lanes: supportedLanes,
    warnings:
      droppedCount === 0
        ? []
        : [
            {
              code: 'unsupported_source_capability',
              sourceKey,
              message: `${sourceKey} skipped ${droppedCount} unsupported lane(s) for capability profile v${capability.version}`,
            },
          ],
  };
};

export const sourceCapabilityBySource = (
  capabilities: readonly SocialSourceCapabilityProfile[],
): ReadonlyMap<SocialSourceKey, SocialSourceCapabilityProfile> =>
  new Map(capabilities.map((profile) => [profile.sourceKey, profile]));

export const warningsForSourceReadiness = (
  sourceKey: SocialSourceKey,
  capability: SocialSourceCapabilityProfile | undefined,
  options: {
    readonly executionAllowedRuntimeReadiness?: readonly SocialSourceRuntimeReadinessState[];
    readonly warnWhenReadinessMissing?: boolean;
  } = {},
): readonly SocialSearchPlanWarning[] => {
  const allowedRuntimeReadiness = new Set(
    options.executionAllowedRuntimeReadiness ?? [
      'fixture_ready',
      'live_beta_ready',
    ],
  );

  if (capability?.readiness === undefined) {
    return options.warnWhenReadinessMissing === true
      ? [
          {
            code: 'source_readiness_missing',
            sourceKey,
            message: `${sourceKey} has no source readiness profile; execution policy may deny provider reads.`,
          },
        ]
      : [];
  }

  if (capability.readiness.state === 'rejected') {
    return [
      {
        code: 'source_runtime_not_ready',
        sourceKey,
        message: `${sourceKey} is rejected for social research execution.`,
      },
    ];
  }

  if (!allowedRuntimeReadiness.has(capability.readiness.runtimeReadiness)) {
    return [
      {
        code: 'source_runtime_not_ready',
        sourceKey,
        message: `${sourceKey} runtimeReadiness=${capability.readiness.runtimeReadiness}; execution policy may deny provider reads.`,
      },
    ];
  }

  return [];
};

const supportsLane = (
  capability: SocialSourceCapabilityProfile,
  laneItem: SocialSearchLane,
): boolean => {
  if (!capability.supportedOperations.includes(laneItem.operation)) {
    return false;
  }

  return (
    capability.supportedLaneKinds === undefined ||
    capability.supportedLaneKinds.includes(laneItem.kind)
  );
};
