import {
  mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertFlutterV3FixtureFresh, canonicalizeSqlRestTransport } from
  "./reader-summary-v3-postgres-flutter-fixture";

const fixturePath = "apps/frontend/features/summaries/test/fixtures/" +
  "reader_post_promotion_v3_sql_readback.json";
const dartFixturePath = "apps/frontend/features/summaries/test/support/" +
  "reader_post_promotion_v3_sql_readback_fixture.dart";

describe("reader summary V3 Flutter SQL fixture", () => {
  it("canonicalizes dynamic SQL identities and reseals dependent digests", () => {
    const expected = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
    const dynamic = JSON.parse(JSON.stringify(expected).replaceAll(
      "00000000-0000-4000-8000-000000000001",
      "d9013aa0-e3f0-4a61-8a5c-988d11d01fd4",
    )) as unknown;

    expect(canonicalizeSqlRestTransport(dynamic)).toEqual(expected);
  });

  it.each([
    ["provider", (card: Record<string, unknown>) => {
      card.providerKey = "reddit";
    }],
    ["assessment id", (card: Record<string, unknown>) => {
      const attestation = promotionAttestation(card);
      const assessment = requiredRecord(attestation.assessment);
      assessment.assessmentId = "00000000-0000-4000-8000-000000000099";
    }],
    ["headline", (card: Record<string, unknown>) => {
      const headline = requiredRecord(card.displayHeadline);
      headline.text = "Mutated independently transported headline";
    }],
    ["attestation field", (card: Record<string, unknown>) => {
      promotionAttestation(card).storyId = "mutated-story";
    }],
  ] as const)(
    "rejects a mismatched independently transported %s",
    (_, mutate) => {
      const transport = JSON.parse(readFileSync(fixturePath, "utf8")) as
        Record<string, unknown>;
      mutate(topCard(transport));

      expect(() => canonicalizeSqlRestTransport(transport)).toThrow(
        /disagrees with canonical payload/u,
      );
    },
  );

  it("asserts freshness without rewriting source and rejects stale transport", () => {
    const before = readFileSync(fixturePath, "utf8");
    const transport = JSON.parse(before) as Record<string, unknown>;

    assertFlutterV3FixtureFresh(transport);
    expect(readFileSync(fixturePath, "utf8")).toBe(before);

    const stale = structuredClone(transport);
    stale.headline = "Stale synthetic headline";
    expect(() => assertFlutterV3FixtureFresh(stale)).toThrow(/fixture is stale/u);
    expect(readFileSync(fixturePath, "utf8")).toBe(before);
  });

  it("rejects stale Dart bytes without writes and explicitly regenerates both", () => {
    const directory = mkdtempSync(join(tmpdir(), "reader-summary-v3-flutter-"));
    const jsonPath = join(directory, "fixture.json");
    const dartPath = join(directory, "fixture.dart");
    const jsonBefore = readFileSync(fixturePath, "utf8");
    const staleDart = `${readFileSync(dartFixturePath, "utf8")}// stale\n`;
    writeFileSync(jsonPath, jsonBefore, "utf8");
    writeFileSync(dartPath, staleDart, "utf8");

    try {
      expect(() => assertFlutterV3FixtureFresh(JSON.parse(jsonBefore), {
        jsonFixturePath: jsonPath,
        dartFixturePath: dartPath,
        write: false,
      })).toThrow(/Dart support fixture is stale/u);
      expect(readFileSync(jsonPath, "utf8")).toBe(jsonBefore);
      expect(readFileSync(dartPath, "utf8")).toBe(staleDart);

      writeFileSync(jsonPath, "{}\n", "utf8");
      assertFlutterV3FixtureFresh(JSON.parse(jsonBefore), {
        jsonFixturePath: jsonPath,
        dartFixturePath: dartPath,
        write: true,
      });
      expect(readFileSync(jsonPath, "utf8")).toBe(jsonBefore);
      expect(readFileSync(dartPath, "utf8")).toBe(
        readFileSync(dartFixturePath, "utf8"),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

const topCard = (transport: Record<string, unknown>): Record<string, unknown> => {
  const brief = requiredRecord(transport.readerBrief);
  const cards = brief.topReads;
  if (!Array.isArray(cards) || cards.length === 0) throw new Error("fixture");
  return requiredRecord(cards[0]);
};

const promotionAttestation = (
  card: Record<string, unknown>,
): Record<string, unknown> => requiredRecord(card.promotionAttestation);

const requiredRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("fixture");
  }
  return value as Record<string, unknown>;
};
