import type { Provider } from "@nestjs/common";

import {
  createStoryRelationProofAuthority,
  type StoryRelationProofAuthority,
} from "../../domain/services/story-relation-proof-authority";

export type { StoryRelationProofAuthority } from
  "../../domain/services/story-relation-proof-authority";

export const READER_SUMMARY_STORY_RELATION_PROOF_AUTHORITY = Symbol(
  "READER_SUMMARY_STORY_RELATION_PROOF_AUTHORITY",
);

export const readerSummaryStoryRelationProofAuthorityProvider: Provider = {
  provide: READER_SUMMARY_STORY_RELATION_PROOF_AUTHORITY,
  useFactory: (): StoryRelationProofAuthority =>
    createStoryRelationProofAuthority(),
};
