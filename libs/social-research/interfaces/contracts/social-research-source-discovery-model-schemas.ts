import { z } from 'zod';

import { socialSourceRegistryEntrySchema } from './social-research-source-registry-model-schemas';

export const socialSourceRegistryEntryListSchema = z.array(
  socialSourceRegistryEntrySchema,
);

export const socialSourceReadinessExplanationSchema = z.object({
  source: socialSourceRegistryEntrySchema,
  canPlan: z.boolean(),
  canExecuteWithDefaultPolicy: z.boolean(),
  summary: z.string().trim().min(1),
  reasons: z.array(z.string().trim().min(1)),
  warnings: z.array(z.string().trim().min(1)),
});
