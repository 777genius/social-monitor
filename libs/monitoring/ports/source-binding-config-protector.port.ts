export type SourceBindingConfigValue =
  | string
  | number
  | boolean
  | null
  | readonly SourceBindingConfigValue[]
  | { readonly [key: string]: SourceBindingConfigValue };

export type SourceBindingConfig = Readonly<Record<string, SourceBindingConfigValue>>;

export interface SourceBindingConfigProtectorPort {
  protect(config: SourceBindingConfig): Promise<SourceBindingConfig>;
}
