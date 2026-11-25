import { DomainError } from "@social-monitor/shared-kernel";

import type {
  ReadReaderSummaryWeeklyProjectionQuery,
  ReaderSummaryWeeklyProjectionRead,
  ReaderSummaryWeeklyProjectionReaderPort,
} from "../../ports/reader-summary-weekly-projection-reader.port";

export class UnavailableReaderSummaryWeeklyProjectionReader
  implements ReaderSummaryWeeklyProjectionReaderPort
{
  async read(
    query: ReadReaderSummaryWeeklyProjectionQuery,
  ): Promise<ReaderSummaryWeeklyProjectionRead> {
    void query;
    throw new DomainError(
      "external.dependency_unavailable",
      "Reader summary weekly projection requires Prisma persistence",
    );
  }
}
