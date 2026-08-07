import {
  buildReaderSummaryDailyTerminalSetReceipt,
  parseReaderSummaryDailyTerminalSetReceiptLine,
  readReaderSummaryDailyTerminalSetRows,
  readerSummaryDailyTerminalSetReceiptSchemaVersion,
  readerSummaryDailyTerminalSetReceiptTenantId,
  readerSummaryDailyTerminalSetReceiptWorkspaceId,
  type ReaderSummaryDailyTerminalSetRow,
} from "./reader-summary-daily-terminal-set-receipt";
import {
  canonicalInvalidProductRetrySetSha256,
  invalidProductRetryDates,
  invalidProductRetrySetToken,
} from "./reader-summary-daily-canonical-recovery-v4-invalid-product-retry-set";

const rows = (): ReaderSummaryDailyTerminalSetRow[] =>
  invalidProductRetryDates.map((requestedUtcDate, index) => ({
    requestedUtcDate,
    outcome: "UNAVAILABLE",
    reasonCode: "invalid_product",
    attemptOrdinal: "2",
    modelJobIdentity: (index + 1).toString(16).repeat(64),
    sourceAuthoritySha256: (index + 7).toString(16).repeat(64),
  }));

describe("reader summary daily terminal-set receipt", () => {
  it("emits only the exact six-terminal canonical receipt", () => {
    const terminals = rows();
    const receipt = buildReaderSummaryDailyTerminalSetReceipt(terminals);

    expect(receipt).toEqual({
      schemaVersion: readerSummaryDailyTerminalSetReceiptSchemaVersion,
      retrySetToken: invalidProductRetrySetToken,
      tenantId: readerSummaryDailyTerminalSetReceiptTenantId,
      workspaceId: readerSummaryDailyTerminalSetReceiptWorkspaceId,
      requestedUtcDates: invalidProductRetryDates,
      terminalCount: 6,
      terminalSetSha256: canonicalInvalidProductRetrySetSha256(terminals.map((row, index) => ({
        requestedUtcDate: invalidProductRetryDates[index]!,
        modelJobIdentity: row.modelJobIdentity,
        sourceAuthoritySha256: row.sourceAuthoritySha256,
      }))),
    });
    expect(Object.keys(receipt)).toEqual([
      "schemaVersion", "retrySetToken", "tenantId", "workspaceId",
      "requestedUtcDates", "terminalCount", "terminalSetSha256",
    ]);
  });

  it.each([
    ["missing", (value: ReaderSummaryDailyTerminalSetRow[]) => value.slice(1)],
    ["extra", (value: ReaderSummaryDailyTerminalSetRow[]) => [...value, value[0]!]],
    ["wrong date", (value: ReaderSummaryDailyTerminalSetRow[]) =>
      value.map((row, index) => index === 0 ? { ...row, requestedUtcDate: "2026-07-24" } : row)],
    ["wrong state", (value: ReaderSummaryDailyTerminalSetRow[]) =>
      value.map((row, index) => index === 0 ? { ...row, outcome: "FINALIZED" } : row)],
    ["wrong reason", (value: ReaderSummaryDailyTerminalSetRow[]) =>
      value.map((row, index) => index === 0 ? { ...row, reasonCode: "other" } : row)],
    ["wrong attempt", (value: ReaderSummaryDailyTerminalSetRow[]) =>
      value.map((row, index) => index === 0 ? { ...row, attemptOrdinal: "02" } : row)],
    ["wrong model hash", (value: ReaderSummaryDailyTerminalSetRow[]) =>
      value.map((row, index) => index === 0 ? { ...row, modelJobIdentity: "A".repeat(64) } : row)],
    ["wrong authority hash", (value: ReaderSummaryDailyTerminalSetRow[]) =>
      value.map((row, index) => index === 0
        ? { ...row, sourceAuthoritySha256: "f".repeat(63) } : row)],
  ])("fails closed for %s authority", (_label, mutate) => {
    expect(() => buildReaderSummaryDailyTerminalSetReceipt(mutate(rows())))
      .toThrow(/terminal/i);
  });

  it("uses only the fixed terminal projection and exact receipt scope", async () => {
    const query = jest.fn(async () => ({ rows: rows() }));

    await expect(readReaderSummaryDailyTerminalSetRows({ query })).resolves.toEqual(rows());

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain('read_reader_summary_daily_canonical_recovery_v4_terminals');
    expect(sql).toContain("ORDER BY terminal.requested_utc_date");
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|CALL)\b/u);
    expect(values).toEqual([
      readerSummaryDailyTerminalSetReceiptTenantId,
      readerSummaryDailyTerminalSetReceiptWorkspaceId,
      invalidProductRetryDates,
    ]);
  });

  it.each([
    ["duplicate key", (line: string) => line.replace(
      '{"schemaVersion":',
      '{"schemaVersion":"reader_summary.daily_terminal_set_receipt.v1","schemaVersion":',
    )],
    ["missing key", (line: string) => line.replace(/,"terminalCount":6/u, "")],
    ["wrong date", (line: string) => line.replace("2026-07-25", "2026-07-24")],
    ["wrong state value", (line: string) => line.replace(
      "reader_summary.daily_terminal_set_receipt.v1",
      "reader_summary.daily_terminal_set_receipt.v2",
    )],
    ["wrong reason value", (line: string) => line.replace(
      "invalid-product-retry-set-v1", "other-retry-set",
    )],
    ["wrong attempt value", (line: string) => line.replace(
      '"terminalCount":6', '"terminalCount":7',
    )],
    ["wrong hash", (line: string) => line.replace(
      /[0-9a-f]{64}(?="\}\n$)/u, "A".repeat(64),
    )],
    ["extra key", (line: string) => line.replace(/\}\n$/u, ',"extra":true}\n')],
    ["extra output", (line: string) => `${line}docker output\n`],
  ])("rejects %s in the captured line", (_label, mutate) => {
    const line = `${JSON.stringify(buildReaderSummaryDailyTerminalSetReceipt(rows()))}\n`;
    expect(() => parseReaderSummaryDailyTerminalSetReceiptLine(mutate(line)))
      .toThrow(/receipt/i);
  });

  it("accepts exactly one compact canonical seven-key JSON line", () => {
    const receipt = buildReaderSummaryDailyTerminalSetReceipt(rows());
    const line = `${JSON.stringify(receipt)}\n`;

    expect(parseReaderSummaryDailyTerminalSetReceiptLine(line)).toEqual(receipt);
  });
});
