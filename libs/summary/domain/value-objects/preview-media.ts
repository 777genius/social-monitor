export type PreviewMediaKind = "image" | "video";

export type PreviewMedia = {
  readonly kind: PreviewMediaKind;
  readonly url: string;
  readonly sourceUrl?: string;
  readonly altText?: string;
};
