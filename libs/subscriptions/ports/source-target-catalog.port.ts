import type { SourceTargetKind } from '../domain';

export type SourceTargetDescriptor = {
  readonly providerKey: string;
  readonly targetKind: SourceTargetKind;
  readonly targetValue: string;
  readonly normalizedKey: string;
  readonly config: Readonly<Record<string, unknown>>;
};

export type SourceTargetValidationResult =
  | { readonly ok: true; readonly descriptor: SourceTargetDescriptor }
  | { readonly ok: false; readonly reason: string };

export interface SourceTargetCatalogPort {
  validateTarget(params: {
    readonly providerKey: string;
    readonly targetKind: string;
    readonly targetValue: string;
    readonly config: Readonly<Record<string, unknown>>;
  }): SourceTargetValidationResult;
}
