import type { JsonObject } from "@social-monitor/shared-kernel";
import type { ReaderValueQuotedPost } from "../../domain/reader-value/reader-value-source";
import { sha256 } from "./reader-value-source-snapshot";

/** Independent consumer of ingestion's closed x_quoted_post.v1 capture contract. */
export const readReaderValueQuotedContext = (metadata: JsonObject, providerMetadata: JsonObject,
  canonicalUrl: string): { readonly quotedContext?: "not_captured"; readonly quotedPost?: ReaderValueQuotedPost } => {
  if (providerMetadata.contentKind !== "quote") return {};
  const missing = { quotedContext: "not_captured" as const };
  const raw = metadata.quotedPost;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return missing;
  const q = raw as JsonObject;
  const projected = providerMetadata.quotedPost;
  if (projected !== undefined && (projected === null || typeof projected !== "object" ||
      Array.isArray(projected) || Object.keys(q).some(key =>
        (projected as JsonObject)[key] !== q[key]) || Object.keys(projected).length !== Object.keys(q).length)) return missing;
  if (Object.keys(q).sort().join() !== ["version", "parentTweetId", "tweetId", "canonicalUrl",
    "authorHandle", "publishedAt", "text", "bodySha256", "availableAt"].sort().join() ||
      q.version !== "x_quoted_post.v1" || typeof q.parentTweetId !== "string" ||
      !/^[1-9][0-9]{0,19}$/u.test(q.parentTweetId) || typeof q.tweetId !== "string" ||
      !/^[1-9][0-9]{0,19}$/u.test(q.tweetId) || q.parentTweetId === q.tweetId ||
      typeof q.authorHandle !== "string" || !/^[A-Za-z0-9_]{1,15}$/u.test(q.authorHandle) ||
      typeof q.text !== "string" || !q.text.trim() || Buffer.byteLength(q.text) > 256_000 ||
      q.bodySha256 !== sha256(q.text) || typeof q.publishedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(q.publishedAt) ||
      !Number.isFinite(Date.parse(q.publishedAt)) || typeof q.availableAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(q.availableAt) ||
      !Number.isFinite(Date.parse(q.availableAt)) || Date.parse(q.availableAt) < Date.parse(q.publishedAt)) return missing;
  let parent: URL;
  try { parent = new URL(canonicalUrl); } catch { return missing; }
  if (parent.protocol !== "https:" || !["x.com", "twitter.com"].includes(parent.hostname) ||
      !parent.pathname.endsWith(`/status/${q.parentTweetId}`) || parent.username || parent.password ||
      q.canonicalUrl !== `https://x.com/${q.authorHandle}/status/${q.tweetId}`) return missing;
  return { quotedPost: { tweetId: q.tweetId, canonicalUrl: q.canonicalUrl,
    authorHandle: q.authorHandle, publishedAt: q.publishedAt,
    availableAt: q.availableAt,
    body: q.text, bodySha256: String(q.bodySha256) } };
};
