import type { JsonObject } from "@social-monitor/shared-kernel";

/** Retain the first genuine acquisition only for the identical attributed quote. */
export const preserveQuotedPostAvailability = <T extends { readonly metadata?: JsonObject }>(
  incoming: T, existing: { readonly metadata?: JsonObject },
): T => {
  const next = object(incoming.metadata?.quotedPost), prior = object(existing.metadata?.quotedPost);
  if (next?.version !== "x_quoted_post.v1" || prior?.version !== next.version ||
      typeof next.availableAt !== "string" || typeof prior.availableAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(next.availableAt) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(prior.availableAt) ||
      !Number.isFinite(Date.parse(next.availableAt)) || !Number.isFinite(Date.parse(prior.availableAt)) ||
      typeof prior.publishedAt !== "string" || Date.parse(prior.availableAt) < Date.parse(prior.publishedAt) ||
      Date.parse(prior.availableAt) > Date.parse(next.availableAt) ||
      Object.keys(next).length !== Object.keys(prior).length ||
      Object.keys(next).some(key => key !== "availableAt" && next[key] !== prior[key])) return incoming;
  return { ...incoming, metadata: { ...incoming.metadata, quotedPost: { ...next, availableAt: prior.availableAt } } };
};

const object = (value: unknown): JsonObject | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
