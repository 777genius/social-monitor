export interface ApiKeyHasherPort {
  hash(secret: string): Promise<string>;
  verify(params: { readonly secret: string; readonly hash: string }): Promise<boolean>;
}
