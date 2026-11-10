import { buildGroundedTopicCohorts } from "./agent-runtime-reader-summary-cohort-grouping";

describe("grounded topic cohort assignment boundary", () => {
  it("assigns overlapping nodes to the strongest supported anchor once", () => {
    const cohorts = buildGroundedTopicCohorts(
      ["n0", "n1", "n2", "n3"],
      new Map([
        ["n0", new Set(["alpha", "beta"])],
        ["n1", new Set(["alpha"])],
        ["n2", new Set(["beta"])],
        ["n3", new Set(["beta"])],
      ]),
    );

    expect(cohorts).toEqual([
      { groupId: "group:beta", label: "Beta", sharedAnchor: "beta",
        nodeIds: ["n0", "n2", "n3"], anchors: ["beta"] },
    ]);
  });

  it("orders equally supported disjoint cohorts by original node order", () => {
    const cohorts = buildGroundedTopicCohorts(
      ["n0", "n1", "n2", "n3"],
      new Map([
        ["n0", new Set(["zeta"])], ["n1", new Set(["zeta"])],
        ["n2", new Set(["alpha"])], ["n3", new Set(["alpha"])],
      ]),
    );
    expect(cohorts.map((cohort) => cohort.groupId)).toEqual([
      "group:zeta", "group:alpha",
    ]);
    expect(cohorts.map((cohort) => cohort.nodeIds)).toEqual([
      ["n0", "n1"], ["n2", "n3"],
    ]);
  });

  it("breaks fully overlapping ties lexically without assigning twice", () => {
    const cohorts = buildGroundedTopicCohorts(
      ["n0", "n1"],
      new Map([
        ["n0", new Set(["zeta", "alpha"])],
        ["n1", new Set(["zeta", "alpha"])],
      ]),
    );
    expect(cohorts.map((cohort) => cohort.groupId)).toEqual(["group:alpha"]);
    expect(cohorts[0]?.nodeIds).toEqual(["n0", "n1"]);
  });

  it("keeps unsupported singletons ungrouped and derives the stable slug", () => {
    const cohorts = buildGroundedTopicCohorts(
      ["n0", "n1", "n2"],
      new Map([
        ["n0", new Set(["c++", "unique"])],
        ["n1", new Set(["c++"])],
        ["n2", new Set(["other"])],
      ]),
    );
    expect(cohorts).toEqual([
      { groupId: "group:c", label: "C++", sharedAnchor: "c++",
        nodeIds: ["n0", "n1"], anchors: ["c++"] },
    ]);
  });

  it("does not create a group from missing or absent anchors", () => {
    expect(buildGroundedTopicCohorts(["n0", "n1"], new Map())).toEqual([]);
  });
});
