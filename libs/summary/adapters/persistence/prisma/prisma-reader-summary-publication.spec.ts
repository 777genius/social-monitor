import type { ReaderSummaryPublicationCommand } from "../../../ports";
import * as publicationProof from "../reader-summary-publication-proof";
import { PrismaReaderSummaryPublication } from "./prisma-reader-summary-publication";
import type { PrismaSummaryClient } from "./prisma-summary-client";

describe("PrismaReaderSummaryPublication", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rolls back before publication when the transaction guard rejects the dataset", async () => {
    const command = {} as ReaderSummaryPublicationCommand;
    const visibleArtifactIds: string[] = [];
    const readyEventIds: string[] = [];
    const publicationQuery = jest.fn(async () => {
      visibleArtifactIds.push("reader-summary-artifact");
      readyEventIds.push("reader-summary-ready-event");
      return [
        {
          outcome: "published",
          publication_id: "reader-summary-artifact",
          report_sha256: "a".repeat(64),
          proof_sha256: "b".repeat(64),
        },
      ];
    });
    const transactionClient = { $queryRaw: publicationQuery };
    const transaction = jest.fn(
      async (
        operation: (client: typeof transactionClient) => Promise<unknown>,
      ) => operation(transactionClient),
    );
    const guard = jest.fn(async () => {
      throw new Error("Reader summary dataset changed at before_publication");
    });
    jest
      .spyOn(publicationProof, "buildReaderSummaryPublicationPayload")
      .mockReturnValue({
        readerSummaryArtifactId: "reader-summary-artifact",
        reportSha256: "a".repeat(64),
        proofSha256: "b".repeat(64),
      } as ReturnType<
        typeof publicationProof.buildReaderSummaryPublicationPayload
      >);
    const publication = new PrismaReaderSummaryPublication(
      {
        $transaction: transaction,
        $queryRaw: publicationQuery,
      } as unknown as PrismaSummaryClient,
      guard,
    );

    await expect(publication.publish(command)).rejects.toThrow(
      "Reader summary dataset changed at before_publication",
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(guard).toHaveBeenCalledWith(transactionClient, command);
    expect(publicationQuery).not.toHaveBeenCalled();
    expect(visibleArtifactIds).toEqual([]);
    expect(readyEventIds).toEqual([]);
  });
});
