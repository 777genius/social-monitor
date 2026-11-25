import type { JsonObject, JsonValue } from "@social-monitor/shared-kernel";

type FeedProjectionMetadataSnapshots = {
  readonly interestQuerySnapshot: {
    readonly interestId: string;
    readonly query: string;
  };
  readonly sourceBindingSnapshot: {
    readonly sourceBindingId: string;
    readonly providerKey: string;
    readonly sourceQuery: {
      readonly mode: string;
      readonly query: string;
    };
  };
  readonly workspaceScopeSnapshot: {
    readonly tenantId: string;
    readonly workspaceId: string;
  };
};

type FeedProjectionIntegrityCommand = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly snapshots: FeedProjectionMetadataSnapshots;
};

type FeedProjectionSourceItemSnapshot = {
  readonly sourceBindingId: string;
};

const defaultPreviewCharacters = 280;
const enrichedArticleEvidenceCharacters = 4_000;

export const feedBodyPreviewForProjection = (input: {
  readonly body: string;
  readonly providerMetadata?: JsonObject;
}): string => {
  const limit =
    articleContentStatus(input.providerMetadata) === "enriched"
      ? enrichedArticleEvidenceCharacters
      : defaultPreviewCharacters;

  return input.body.slice(0, limit);
};

export const feedProviderMetadataForProjection = (input: {
  readonly providerMetadata?: JsonObject;
  readonly snapshots: FeedProjectionMetadataSnapshots;
}): JsonObject => ({
  ...(input.providerMetadata ?? {}),
  interestQuerySnapshot: {
    interestId: input.snapshots.interestQuerySnapshot.interestId,
    query: input.snapshots.interestQuerySnapshot.query,
  },
  sourceBindingSnapshot: {
    sourceBindingId: input.snapshots.sourceBindingSnapshot.sourceBindingId,
    providerKey: input.snapshots.sourceBindingSnapshot.providerKey,
    sourceQuery: {
      mode: input.snapshots.sourceBindingSnapshot.sourceQuery.mode,
      query: input.snapshots.sourceBindingSnapshot.sourceQuery.query,
    },
  },
  workspaceScopeSnapshot: {
    tenantId: String(input.snapshots.workspaceScopeSnapshot.tenantId),
    workspaceId: String(input.snapshots.workspaceScopeSnapshot.workspaceId),
  },
});

export const assertFeedProjectionCommandIntegrity = (
  command: FeedProjectionIntegrityCommand,
): void => {
  if (
    command.interestId !== command.snapshots.interestQuerySnapshot.interestId
  ) {
    throw new Error(
      "Feed projection interest snapshot does not match command interest",
    );
  }

  if (command.snapshots.interestQuerySnapshot.query.trim().length === 0) {
    throw new Error(
      "Feed projection interest query snapshot must be non-empty",
    );
  }

  if (
    command.sourceBindingId !==
    command.snapshots.sourceBindingSnapshot.sourceBindingId
  ) {
    throw new Error(
      "Feed projection source binding snapshot does not match command source binding",
    );
  }

  if (
    command.providerKey !== command.snapshots.sourceBindingSnapshot.providerKey
  ) {
    throw new Error(
      "Feed projection source binding snapshot does not match command provider",
    );
  }

  if (
    command.snapshots.sourceBindingSnapshot.sourceQuery.query.trim().length ===
    0
  ) {
    throw new Error("Feed projection source query snapshot must be non-empty");
  }

  if (
    String(command.tenantId) !==
    String(command.snapshots.workspaceScopeSnapshot.tenantId)
  ) {
    throw new Error(
      "Feed projection workspace snapshot does not match command tenant",
    );
  }

  if (
    String(command.workspaceId) !==
    String(command.snapshots.workspaceScopeSnapshot.workspaceId)
  ) {
    throw new Error(
      "Feed projection workspace snapshot does not match command workspace",
    );
  }
};

export const assertFeedProjectionSourceItemBinding = (
  command: Pick<FeedProjectionIntegrityCommand, "sourceBindingId">,
  snapshot: FeedProjectionSourceItemSnapshot,
): void => {
  if (snapshot.sourceBindingId !== command.sourceBindingId) {
    throw new Error(
      "Feed projection source item binding does not match command source binding",
    );
  }
};

const articleContentStatus = (
  metadata: JsonObject | undefined,
): string | undefined => {
  const articleContent = metadata?.articleContent;
  if (
    typeof articleContent !== "object" ||
    articleContent === null ||
    Array.isArray(articleContent)
  ) {
    return undefined;
  }

  const status: JsonValue | undefined = (
    articleContent as Readonly<Record<string, JsonValue>>
  ).status;

  return typeof status === "string" ? status : undefined;
};
