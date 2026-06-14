import type { SourceBindingStatus } from '../../domain';

export type ChangeSourceBindingStatusResult = {
  readonly sourceBindingId: string;
  readonly status: SourceBindingStatus;
  readonly changed: boolean;
};
