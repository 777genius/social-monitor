import { rawOwnKeyIssues } from "./story-relation-response-own-keys";

const schema = {
  additionalProperties: false,
  properties: {
    decisions: {
      items: {
        additionalProperties: false,
        properties: { leftFeedItemId: {}, sameStory: {} },
      },
    },
  },
};

it("rejects unknown own keys at the envelope and each decision in input order", () => {
  const raw = JSON.parse(
    '{"decisions":[{"leftFeedItemId":"a","sameStory":true,"__proto__":"hidden"},' +
    '{"leftFeedItemId":"b","sameStory":false,"extra":"redact"}],"__proto__":"root-secret"}',
  );
  const before = JSON.stringify(raw);

  expect(rawOwnKeyIssues(raw, schema)).toEqual([
    { code: "unrecognized_keys", path: [], keys: ["__proto__"] },
    { code: "unrecognized_keys", path: ["decisions", 0], keys: ["__proto__"] },
    { code: "unrecognized_keys", path: ["decisions", 1], keys: ["extra"] },
  ]);
  expect(JSON.stringify(raw)).toBe(before);
});

it("does not reject future keys when additionalProperties is not explicitly false", () => {
  const raw = { decisions: [{ leftFeedItemId: "a", additional: "synthetic" }], extra: 1 };
  expect(rawOwnKeyIssues(raw, { ...schema, additionalProperties: true })).toEqual([
    { code: "unrecognized_keys", path: ["decisions", 0], keys: ["additional"] },
  ]);
  expect(rawOwnKeyIssues(raw, {
    ...schema,
    properties: { decisions: { items: { additionalProperties: true, properties: {} } } },
  })).toEqual([{ code: "unrecognized_keys", path: [], keys: ["extra"] }]);
});

it("inspects only declared object and decisions boundaries, not unrelated nested data", () => {
  const raw = { decisions: [null, [], { leftFeedItemId: "a" }], metadata: { unknown: true } };
  expect(rawOwnKeyIssues(raw, {
    ...schema,
    properties: { decisions: schema.properties.decisions, metadata: {} },
  })).toEqual([]);
  expect(rawOwnKeyIssues(raw, { additionalProperties: false, properties: {} })).toEqual([
    { code: "unrecognized_keys", path: [], keys: ["decisions", "metadata"] },
  ]);
  expect(rawOwnKeyIssues(null, schema)).toEqual([]);
  expect(rawOwnKeyIssues([], schema)).toEqual([]);
});
