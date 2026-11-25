import { z } from 'zod';

import { socialResearchToolDefinitions } from './social-research-tool-schemas';

export type SocialResearchToolJsonSchema = Readonly<Record<string, unknown>>;

export const buildSocialResearchToolJsonSchemas = (): Readonly<
  Record<string, SocialResearchToolJsonSchema>
> =>
  Object.fromEntries(
    socialResearchToolDefinitions.map((definition) => [
      definition.name,
      z.toJSONSchema(definition.inputSchema) as SocialResearchToolJsonSchema,
    ]),
  );
