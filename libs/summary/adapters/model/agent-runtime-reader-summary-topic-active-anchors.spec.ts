import { READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID } from "../../domain";
import {
  supportedAnchorsForActiveGroups,
} from "./agent-runtime-reader-summary-topic-active-anchors";
import {
  supportedAnchorsForActiveGroups as fromMembershipPolicy,
} from "./agent-runtime-reader-summary-topic-group-existing-admission";
import {
  supportedAnchorsForActiveGroups as fromLegacyPolicy,
} from "./agent-runtime-reader-summary-topic-group-consensus";

describe("active topic group anchor projection", () => {
  it("keeps both historical entrypoints on the exact specialist function", () => {
    expect(fromMembershipPolicy).toBe(supportedAnchorsForActiveGroups);
    expect(fromLegacyPolicy).toBe(supportedAnchorsForActiveGroups);
  });

  it("publishes only corroborated group anchors in stable group order without mutating evidence", () => {
    const labels = Object.freeze([
      Object.freeze({ nodeId: "n1", groupId: "group:acme" }),
      Object.freeze({ nodeId: "n2", groupId: "group:acme" }),
      Object.freeze({ nodeId: "n3", groupId: "group:solo" }),
      Object.freeze({ nodeId: "n4", groupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID }),
      Object.freeze({ nodeId: "n5" }),
    ]);
    const anchorsByNodeId = new Map<string, ReadonlySet<string>>([
      ["n1", new Set(["acme", "one"])],
      ["n2", new Set(["acme", "two"])],
      ["n3", new Set(["solo"])],
      ["n4", new Set(["acme"])],
      ["n5", new Set(["acme"])],
    ]);
    const explicitAnchorsByGroup = new Map<string, readonly string[]>([
      ["group:acme", Object.freeze(["Acme"])],
      ["group:solo", Object.freeze(["Solo"])],
    ]);
    const entries = [...supportedAnchorsForActiveGroups({
      nodeLabels: labels,
      anchorsByNodeId,
      explicitAnchorsByGroup,
    })];
    expect(entries).toEqual([
      ["group:acme", ["Acme"]],
      ["group:solo", []],
    ]);
    expect(labels.map((label) => label.groupId)).toEqual([
      "group:acme", "group:acme", "group:solo",
      READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID, undefined,
    ]);
    expect(anchorsByNodeId.get("n1")).toEqual(new Set(["acme", "one"]));
    expect(explicitAnchorsByGroup.get("group:acme")).toEqual(["Acme"]);
  });

  it("does not promote an explicit group name without two independent supporting nodes", () => {
    const groupId = "group:untrusted";
    const projected = supportedAnchorsForActiveGroups({
      nodeLabels: [{ nodeId: "one", groupId }, { nodeId: "two", groupId }],
      anchorsByNodeId: new Map<string, ReadonlySet<string>>([
        ["one", new Set(["alpha"])],
        ["two", new Set(["beta"])],
      ]),
      explicitAnchorsByGroup: new Map([[groupId, ["alpha", "beta"]]]),
    });
    expect(projected.get(groupId)).toEqual([]);
  });
});
