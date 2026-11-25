import type { SourceBindingView } from '../shared/source-binding-presenter';

export type ListSourceBindingsResult = {
  readonly sourceBindings: readonly SourceBindingView[];
  readonly nextCursor?: string;
};
