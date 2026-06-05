import type { SourceProfileEntry } from '../../features/list-source-profiles/list-source-profiles.result';

export type SourceProfileDto = SourceProfileEntry;

export type ListSourceProfilesResponseDto = {
  readonly sources: readonly SourceProfileDto[];
};
