import { z } from 'zod';

import {
  socialSourceAcquisitionModes,
  socialSourceCertificationLevels,
  socialSourceCredentialPolicies,
  socialSourceRiskLevels,
  socialSourceRuntimeAdapterPolicies,
} from '../../domain/value-objects/social-source-registry';
import { socialSourceCapabilityProfileInputSchema } from '../tools/social-research-tool-schemas';

export const socialSourceRegistryEntrySchema = z.object({
  sourceKey: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  capabilityProfile: socialSourceCapabilityProfileInputSchema,
  certification: z.object({
    level: z.enum(socialSourceCertificationLevels),
    readinessState:
      socialSourceCapabilityProfileInputSchema.shape.readiness.unwrap().shape
        .state,
    runtimeReadiness:
      socialSourceCapabilityProfileInputSchema.shape.readiness.unwrap().shape
        .runtimeReadiness,
    productionSafe: z.boolean(),
    acquisitionMode: z.enum(socialSourceAcquisitionModes),
    credentialPolicy: z.enum(socialSourceCredentialPolicies),
    runtimeAdapterPolicy: z.enum(socialSourceRuntimeAdapterPolicies),
    riskLevel: z.enum(socialSourceRiskLevels),
    approvalOwner: z.enum([
      'engineering',
      'product_and_legal',
      'custom_owner',
    ]),
    termsRequired: z.boolean(),
    liveEvidenceRequired: z.boolean(),
    rollbackRequired: z.boolean(),
    liveBetaBlocked: z.boolean(),
    liveBetaBlockers: z.array(z.string()),
  }),
});
