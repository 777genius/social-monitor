import type { SourceBindingView } from '../../features/shared/source-binding-presenter';

export type ListSourceBindingsResponseDto = {
  readonly sourceBindings: readonly SourceBindingView[];
  readonly nextCursor?: string;
};
