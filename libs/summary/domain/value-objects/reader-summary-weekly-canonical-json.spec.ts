import {
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
  readerSummaryWeeklyCanonicalJsonLimits,
  readerSummaryWeeklySha256,
} from "./reader-summary-weekly-canonical-json";

describe("reader summary weekly canonical JSON", () => {
  it("sorts keys, seals deterministic bytes and returns defensive byte copies", () => {
    const left = canonicalizeReaderSummaryWeeklyJson({
      z: [3, { y: true, x: "value" }],
      a: null,
    });
    const right = canonicalizeReaderSummaryWeeklyJson({
      a: null,
      z: [3, { x: "value", y: true }],
    });

    expect(left.json).toBe('{"a":null,"z":[3,{"x":"value","y":true}]}');
    expect(left.sha256).toBe(right.sha256);
    expect(left.sha256).toBe(readerSummaryWeeklySha256(left.toBytes()));
    const first = left.toBytes();
    first[0] = 0;
    expect(left.toBytes()[0]).toBe("{".charCodeAt(0));
    expect(Object.isFrozen(left)).toBe(true);
  });

  it("deep-freezes constructed output graphs", () => {
    const output = deepFreezeReaderSummaryWeekly({
      nested: [{ value: "sealed" }],
    });

    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.nested)).toBe(true);
    expect(Object.isFrozen(output.nested[0])).toBe(true);
  });

  it("preserves an own __proto__ field without prototype pollution", () => {
    const input: Record<string, unknown> = {};
    Object.defineProperty(input, "__proto__", {
      enumerable: true,
      value: { safe: true },
    });

    const canonical = canonicalizeReaderSummaryWeeklyJson(input);

    expect(canonical.json).toBe('{"__proto__":{"safe":true}}');
    expect(({} as Record<string, unknown>).safe).toBeUndefined();
  });

  it("rejects unknown and caller-supplied derived fields", () => {
    expect(() =>
      assertReaderSummaryWeeklyExactObject(
        { raw: "evidence", extra: true },
        ["raw"],
        "test input",
      ),
    ).toThrow("exactly raw");
    expect(() =>
      assertReaderSummaryWeeklyExactObject(
        { raw: "evidence", status: "verified" },
        ["raw"],
        "test input",
      ),
    ).toThrow('derived field "status"');
  });

  it.each([
    ["undefined", undefined],
    ["function", () => undefined],
    ["bigint", BigInt(1)],
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["negative zero", -0],
  ])("rejects non-JSON %s values", (_label, value) => {
    expect(() => canonicalizeReaderSummaryWeeklyJson({ value })).toThrow();
  });

  it("rejects accessors, symbol keys, proxies and custom prototypes", () => {
    const accessor = {};
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get: () => "unsafe",
    });
    const symbolKeyed = { value: "safe" } as Record<PropertyKey, unknown>;
    symbolKeyed[Symbol("hidden")] = "unsafe";
    const proxy = new Proxy({ value: "unsafe" }, {});
    const custom = Object.create({ inherited: true }) as Record<string, unknown>;
    custom.value = "unsafe";

    for (const value of [accessor, symbolKeyed, proxy, custom]) {
      expect(() => canonicalizeReaderSummaryWeeklyJson(value)).toThrow();
    }
  });

  it("rejects sparse and decorated arrays", () => {
    const sparse = Array<unknown>(2);
    sparse[1] = "present";
    const decorated = ["value"] as unknown[] & { extra?: string };
    decorated.extra = "unsafe";

    expect(() => canonicalizeReaderSummaryWeeklyJson(sparse)).toThrow(
      "dense data array",
    );
    expect(() => canonicalizeReaderSummaryWeeklyJson(decorated)).toThrow(
      "dense data array",
    );
  });

  it("rejects cycles and repeated object references", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const shared = { value: "same object" };

    expect(() => canonicalizeReaderSummaryWeeklyJson(cycle)).toThrow(
      "repeated or circular",
    );
    expect(() => canonicalizeReaderSummaryWeeklyJson([shared, shared])).toThrow(
      "repeated or circular",
    );
  });

  it("enforces the depth, string, array and object-key limits", () => {
    let deep: unknown = null;
    for (
      let index = 0;
      index <= readerSummaryWeeklyCanonicalJsonLimits.maxDepth;
      index += 1
    ) {
      deep = [deep];
    }
    const tooManyKeys = Object.fromEntries(
      Array.from(
        { length: readerSummaryWeeklyCanonicalJsonLimits.maxObjectKeys + 1 },
        (_, index) => [`key-${index}`, null],
      ),
    );

    expect(() => canonicalizeReaderSummaryWeeklyJson(deep)).toThrow(
      "depth limit",
    );
    expect(() =>
      canonicalizeReaderSummaryWeeklyJson(
        "x".repeat(readerSummaryWeeklyCanonicalJsonLimits.maxStringLength + 1),
      ),
    ).toThrow("string length limit");
    expect(() =>
      canonicalizeReaderSummaryWeeklyJson(
        Array.from({
          length:
            readerSummaryWeeklyCanonicalJsonLimits.maxArrayElements + 1,
        }),
      ),
    ).toThrow("array element limit");
    expect(() => canonicalizeReaderSummaryWeeklyJson(tooManyKeys)).toThrow(
      "object key limit",
    );
  });

  it("enforces total key, total array, node and byte limits", () => {
    const totalKeys = Array.from({ length: 65 }, (_, objectIndex) =>
      Object.fromEntries(
        Array.from({ length: 64 }, (_unused, keyIndex) => [
          `${objectIndex}-${keyIndex}`,
          null,
        ]),
      ),
    );
    const totalArrayElements = Array.from({ length: 17 }, () =>
      Array.from({ length: 256 }, () => null),
    );
    const tooManyNodes = Array.from({ length: 64 }, (_, objectIndex) =>
      Object.fromEntries(
        Array.from({ length: 47 }, (_unused, keyIndex) => [
          `${objectIndex}-${keyIndex}`,
          [null],
        ]),
      ),
    );
    const tooManyBytes = Array.from(
      { length: 65 },
      () => "x".repeat(readerSummaryWeeklyCanonicalJsonLimits.maxStringLength),
    );

    expect(() => canonicalizeReaderSummaryWeeklyJson(totalKeys)).toThrow(
      "total object key limit",
    );
    expect(() =>
      canonicalizeReaderSummaryWeeklyJson(totalArrayElements),
    ).toThrow("total array element limit");
    expect(() => canonicalizeReaderSummaryWeeklyJson(tooManyNodes)).toThrow(
      "JSON node limit",
    );
    expect(() => canonicalizeReaderSummaryWeeklyJson(tooManyBytes)).toThrow(
      "canonical byte limit",
    );
  });

  it("stops at the byte budget without normalizing an unbounded trailing graph", () => {
    let trailingGraphVisited = false;
    const trailingGraph = new Proxy({}, {
      getPrototypeOf: () => {
        trailingGraphVisited = true;
        return Object.prototype;
      },
    });
    const value = [
      ...Array.from(
        { length: 65 },
        () => "x".repeat(readerSummaryWeeklyCanonicalJsonLimits.maxStringLength),
      ),
      trailingGraph,
    ];

    expect(() => canonicalizeReaderSummaryWeeklyJson(value)).toThrow(
      "canonical byte limit",
    );
    expect(trailingGraphVisited).toBe(false);
  });
});
