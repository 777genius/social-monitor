import {
  isSensitiveKey,
  type JsonObject,
  redactSensitiveRecord,
  redactSensitiveText,
} from "@social-monitor/shared-kernel";

import type { FetchedConversationUnit, FetchedSourceItem } from "../../ports";

export const sanitizeFetchedSourceItem = (
  item: FetchedSourceItem,
): FetchedSourceItem => ({
  ...item,
  externalId: redactSensitiveText(item.externalId),
  canonicalUrl: sanitizeFetchedSourceUrl(item.canonicalUrl),
  title: redactSensitiveText(item.title),
  body: redactSensitiveText(item.body),
  authorHandle:
    item.authorHandle === undefined
      ? undefined
      : redactSensitiveText(item.authorHandle),
  metadata:
    item.metadata === undefined
      ? undefined
      : (redactSensitiveRecord(item.metadata) as JsonObject),
});

export const sanitizeFetchedConversationUnit = (
  unit: FetchedConversationUnit,
): FetchedConversationUnit => ({
  ...unit,
  rootExternalId: redactSensitiveText(unit.rootExternalId),
  rootProviderItemId: redactSensitiveText(unit.rootProviderItemId),
  providerUnitId: redactSensitiveText(unit.providerUnitId),
  canonicalUrl: sanitizeFetchedSourceUrl(unit.canonicalUrl),
  body: redactSensitiveText(unit.body),
  authorHandle:
    unit.authorHandle === undefined
      ? undefined
      : redactSensitiveText(unit.authorHandle),
  threadExternalId: redactSensitiveText(unit.threadExternalId),
  parentProviderUnitId:
    unit.parentProviderUnitId === undefined
      ? undefined
      : redactSensitiveText(unit.parentProviderUnitId),
  metadata:
    unit.metadata === undefined
      ? undefined
      : (redactSensitiveRecord(unit.metadata) as JsonObject),
});

export const sanitizeSourceWarnings = (
  warnings: readonly string[] | undefined,
): readonly string[] => [
  ...new Set(
    (warnings ?? [])
      .map((warning) => redactSensitiveText(warning).trim())
      .filter((warning) => warning.length > 0),
  ),
];

const sanitizeFetchedSourceUrl = (value: string): string => {
  const redacted = redactSensitiveText(value);

  try {
    const parsed = new URL(redacted);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";

    for (const key of [...parsed.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        parsed.searchParams.delete(key);
      }
    }

    return parsed.toString();
  } catch {
    return redacted;
  }
};
