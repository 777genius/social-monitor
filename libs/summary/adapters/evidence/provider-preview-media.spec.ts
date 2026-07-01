import { previewMediaFromProviderMetadata } from "./provider-preview-media";

describe("previewMediaFromProviderMetadata", () => {
  it("uses X/Twitter media URLs as image previews", () => {
    expect(
      previewMediaFromProviderMetadata({
        providerKey: "x-twitter",
        canonicalUrl: "https://x.com/example/status/1",
        title: "Launch image post",
        providerMetadata: {
          kind: "x_post",
          mediaUrls: ["https://pbs.twimg.com/media/example.jpg"],
        },
      }),
    ).toEqual({
      kind: "image",
      url: "https://pbs.twimg.com/media/example.jpg",
      sourceUrl: "https://x.com/example/status/1",
      altText: "Launch image post",
    });
  });

  it("uses Reddit preview images before listing thumbnails", () => {
    expect(
      previewMediaFromProviderMetadata({
        providerKey: "reddit",
        canonicalUrl: "https://www.reddit.com/r/example/comments/1/post/",
        title: "Reddit image post",
        providerMetadata: {
          kind: "reddit_post",
          previewImageUrl: "https://preview.redd.it/image.png",
          thumbnailUrl: "https://b.thumbs.redditmedia.com/thumb.jpg",
          postHint: "image",
        },
      }),
    ).toEqual({
      kind: "image",
      url: "https://preview.redd.it/image.png",
      sourceUrl: "https://www.reddit.com/r/example/comments/1/post/",
      altText: "Reddit image post",
    });
  });

  it("uses RSS thumbnails as video poster previews when video media exists", () => {
    expect(
      previewMediaFromProviderMetadata({
        providerKey: "rss",
        canonicalUrl: "https://example.test/story",
        title: "RSS video post",
        providerMetadata: {
          kind: "rss_item",
          mediaThumbnailUrl: "https://cdn.example.test/poster.webp",
          enclosureUrl: "https://cdn.example.test/video.mp4",
          enclosureType: "video/mp4",
        },
      }),
    ).toEqual({
      kind: "video",
      url: "https://cdn.example.test/poster.webp",
      sourceUrl: "https://cdn.example.test/video.mp4",
      altText: "RSS video post",
    });
  });

  it("rejects local, credentialed and non-http media URLs", () => {
    expect(
      previewMediaFromProviderMetadata({
        providerKey: "x-twitter",
        providerMetadata: {
          kind: "x_post",
          mediaUrls: [
            "http://127.0.0.1/image.jpg",
            "https://user:pass@example.test/private.jpg",
            "file:///tmp/image.jpg",
          ],
        },
      }),
    ).toBeUndefined();
  });
});
