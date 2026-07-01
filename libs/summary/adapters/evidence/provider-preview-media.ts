import {
  validateOutboundUrl,
  type JsonObject,
} from "@social-monitor/shared-kernel";

import type { PreviewMedia } from "../../domain";

type ProviderPreviewMediaInput = {
  readonly providerKey: string;
  readonly providerMetadata?: JsonObject;
  readonly title?: string;
  readonly canonicalUrl?: string;
};

export const previewMediaFromProviderMetadata = (
  input: ProviderPreviewMediaInput,
): PreviewMedia | undefined => {
  const metadata = input.providerMetadata;
  if (metadata === undefined) {
    return undefined;
  }

  const providerKey = input.providerKey.toLowerCase();
  if (providerKey === "x-twitter" || providerKey === "twitter") {
    return xPreviewMedia(metadata, input);
  }

  if (providerKey === "reddit") {
    return redditPreviewMedia(metadata, input);
  }

  if (providerKey === "rss") {
    return rssPreviewMedia(metadata, input);
  }

  return undefined;
};

const xPreviewMedia = (
  metadata: JsonObject,
  input: ProviderPreviewMediaInput,
): PreviewMedia | undefined => {
  const mediaUrl = firstSafeUrl(readStringArray(metadata.mediaUrls));
  if (mediaUrl === undefined) {
    return undefined;
  }

  return {
    kind: "image",
    url: mediaUrl,
    sourceUrl: safePreviewUrl(input.canonicalUrl),
    altText: previewAltText(input.title, "X/Twitter post image"),
  };
};

const redditPreviewMedia = (
  metadata: JsonObject,
  input: ProviderPreviewMediaInput,
): PreviewMedia | undefined => {
  const imageUrl = firstSafeUrl([
    readString(metadata.previewImageUrl),
    readString(metadata.thumbnailUrl),
    imageUrlFromLinkedPost(metadata),
  ]);
  if (imageUrl === undefined) {
    return undefined;
  }

  return {
    kind: readBoolean(metadata.isVideo) === true ? "video" : "image",
    url: imageUrl,
    sourceUrl: safePreviewUrl(
      input.canonicalUrl ?? readString(metadata.linkedUrl),
    ),
    altText: previewAltText(input.title, "Reddit post preview"),
  };
};

const rssPreviewMedia = (
  metadata: JsonObject,
  input: ProviderPreviewMediaInput,
): PreviewMedia | undefined => {
  const thumbnailUrl = firstSafeUrl([
    readString(metadata.mediaThumbnailUrl),
    imageContentUrl(metadata),
    imageEnclosureUrl(metadata),
  ]);
  if (thumbnailUrl === undefined) {
    return undefined;
  }

  const videoSourceUrl =
    isVideoType(readString(metadata.mediaContentType)) ||
    isVideoType(readString(metadata.enclosureType))
      ? firstSafeUrl([
          readString(metadata.mediaContentUrl),
          readString(metadata.enclosureUrl),
        ])
      : undefined;

  return {
    kind: videoSourceUrl === undefined ? "image" : "video",
    url: thumbnailUrl,
    sourceUrl: videoSourceUrl ?? safePreviewUrl(input.canonicalUrl),
    altText: previewAltText(input.title, "RSS item preview"),
  };
};

const imageUrlFromLinkedPost = (metadata: JsonObject): string | undefined => {
  const linkedUrl = readString(metadata.linkedUrl);
  if (linkedUrl === undefined) {
    return undefined;
  }

  const postHint = readString(metadata.postHint)?.toLowerCase();
  return postHint === "image" || looksLikeImageUrl(linkedUrl)
    ? linkedUrl
    : undefined;
};

const imageContentUrl = (metadata: JsonObject): string | undefined => {
  const contentUrl = readString(metadata.mediaContentUrl);
  if (contentUrl === undefined) {
    return undefined;
  }

  return isImageType(readString(metadata.mediaContentType)) ||
    looksLikeImageUrl(contentUrl)
    ? contentUrl
    : undefined;
};

const imageEnclosureUrl = (metadata: JsonObject): string | undefined => {
  const enclosureUrl = readString(metadata.enclosureUrl);
  if (enclosureUrl === undefined) {
    return undefined;
  }

  return isImageType(readString(metadata.enclosureType)) ||
    looksLikeImageUrl(enclosureUrl)
    ? enclosureUrl
    : undefined;
};

const firstSafeUrl = (
  values: readonly (string | undefined)[],
): string | undefined => {
  for (const value of values) {
    const safeUrl = safePreviewUrl(value);
    if (safeUrl !== undefined) {
      return safeUrl;
    }
  }

  return undefined;
};

const safePreviewUrl = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  const validated = validateOutboundUrl(trimmed, {
    label: "Preview media URL",
    allowedProtocols: ["https:", "http:"],
  });
  if (!validated.ok) {
    return undefined;
  }

  if (
    validated.url.username.trim().length > 0 ||
    validated.url.password.trim().length > 0
  ) {
    return undefined;
  }

  return validated.url.toString();
};

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const readBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const readStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];

const isImageType = (value: string | undefined): boolean =>
  value?.toLowerCase().startsWith("image/") === true;

const isVideoType = (value: string | undefined): boolean =>
  value?.toLowerCase().startsWith("video/") === true;

const looksLikeImageUrl = (value: string): boolean => {
  try {
    const path = new URL(value).pathname.toLowerCase();
    return /\.(avif|gif|jpe?g|png|webp)$/.test(path);
  } catch {
    return false;
  }
};

const previewAltText = (
  title: string | undefined,
  fallback: string,
): string => {
  const text = title?.trim();
  return text === undefined || text.length === 0 ? fallback : text;
};
