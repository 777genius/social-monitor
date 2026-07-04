import {
  builtInSocialSourceKeys,
  socialCommunityListings,
  socialSearchDepths,
  socialSearchGoals,
  socialSearchWindowPresets,
} from '../../domain/value-objects/social-search-intent';
import {
  socialSourceContentUnits,
  socialSourceCursorModels,
  socialSourceQuotaModels,
  socialSourceReadinessStates,
  socialSourceRuntimeReadinessStates,
} from '../../domain/value-objects/social-source-capability-profile';
import {
  socialSourceAcquisitionModes,
  socialSourceCertificationLevels,
  socialSourceCredentialPolicies,
  socialSourceRiskLevels,
  socialSourceRuntimeAdapterPolicies,
} from '../../domain/value-objects/social-source-registry';
import { socialItemQualitySignals } from '../../domain/policies/social-item-quality-policy';
import { socialRankingRecipeKinds } from '../../domain/policies/social-item-ranker';
import {
  semanticQueryLaneKinds,
  socialQueryPhraseModes,
  socialQueryStrategyRecipeKinds,
} from '../../domain/policies/social-query-strategy';
import { socialAccountLaneRecipeSelectors } from '../../domain/policies/social-source-lane-recipes';
import { socialResearchRequestPresetIds } from '../../application/social-research-request';
import {
  socialSearchLaneKinds,
  socialSearchLaneOperations,
  socialSearchPlanWarningCodes,
} from '../../domain/value-objects/social-search-plan';

export const socialResearchSourceVocabulary = {
  sourceKeyExtensibility: 'open_string',
  builtInSourceKeys: builtInSocialSourceKeys,
  depths: socialSearchDepths,
  goals: socialSearchGoals,
  windowPresets: socialSearchWindowPresets,
  communityListings: socialCommunityListings,
  laneKinds: socialSearchLaneKinds,
  laneOperations: socialSearchLaneOperations,
  contentUnits: socialSourceContentUnits,
  cursorModels: socialSourceCursorModels,
  quotaModels: socialSourceQuotaModels,
  acquisitionModes: socialSourceAcquisitionModes,
  credentialPolicies: socialSourceCredentialPolicies,
  runtimeAdapterPolicies: socialSourceRuntimeAdapterPolicies,
  certificationLevels: socialSourceCertificationLevels,
  sourceRiskLevels: socialSourceRiskLevels,
  readinessStates: socialSourceReadinessStates,
  runtimeReadinessStates: socialSourceRuntimeReadinessStates,
  planWarningCodes: socialSearchPlanWarningCodes,
  requestPresets: socialResearchRequestPresetIds,
  queryStrategyRecipeKinds: socialQueryStrategyRecipeKinds,
  rankingRecipeKinds: socialRankingRecipeKinds,
  qualitySignals: socialItemQualitySignals,
  queryPhraseModes: socialQueryPhraseModes,
  semanticQueryLaneKinds,
  accountLaneRecipeSelectors: socialAccountLaneRecipeSelectors,
  customLaneStrategyContract: 'SocialSourceLaneStrategy',
} as const;
