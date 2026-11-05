/** Complete independent reviewer inputs, copied verbatim; synthetic, outside frozen gold. */
export const releaseIdentityReviewCases = [
  {
    "finding": "R1",
    "name": "third_party_independent_benchmark",
    "inputs": [
      {
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."
      },
      {
        "title": "Vela 7.3 coding benchmark results",
        "sourceText": "Orion released Vela 7.3 on September 1. Researchers at Vega Labs measured the model on 900 coding tasks. Their new benchmark contradicts the announcement: agentic coding accuracy falls vs its predecessor.",
        "bodyPreview": "Orion released Vela 7.3 on September 1. Researchers at Vega Labs measured the model on 900 coding tasks. Their new benchmark contradicts the announcement: agentic coding accuracy falls vs its predecessor."
      }
    ]
  },
  {
    "finding": "R1",
    "name": "passive_independent_benchmark",
    "inputs": [
      {
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."
      },
      {
        "title": "Vela 7.3 coding benchmark results",
        "sourceText": "Orion released Vela 7.3 on September 1. A fresh benchmark of coding workloads was run by Vega Labs using 900 tasks. These are new measurements after the announcement, showing a regression vs its predecessor.",
        "bodyPreview": "Orion released Vela 7.3 on September 1. A fresh benchmark of coding workloads was run by Vega Labs using 900 tasks. These are new measurements after the announcement, showing a regression vs its predecessor."
      }
    ]
  },
  {
    "finding": "R2",
    "name": "contradictory_body_target_without_launch_verb",
    "inputs": [
      {
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."
      },
      {
        "title": "Orion launches Vela 7.3 for coding compared to its predecessor",
        "sourceText": "Lyra 8.4 is now available for agentic coding workloads. Benchmarks improve vs Vela 7.3.",
        "bodyPreview": "Lyra 8.4 is now available for agentic coding workloads. Benchmarks improve vs Vela 7.3."
      }
    ]
  },
  {
    "finding": "R3",
    "name": "comma_joint_overlap",
    "inputs": [
      {
        "title": "Orion introduces Vela 7.3, Lyra 7.3 and Atlas 7.3 at lower cost",
        "sourceText": "Orion releases Vela 7.3, Lyra 7.3 and Atlas 7.3 on September 1. The new models improve coding workloads at lower cost.",
        "bodyPreview": "Orion releases Vela 7.3, Lyra 7.3 and Atlas 7.3 on September 1. The new models improve coding workloads at lower cost."
      },
      {
        "title": "Orion launches Vela 7.3, Lyra 7.4 and Atlas 7.4 compared to predecessors",
        "sourceText": "Orion releases Vela 7.3, Lyra 7.4 and Atlas 7.4 on September 1. New models improve coding workloads vs predecessors.",
        "bodyPreview": "Orion releases Vela 7.3, Lyra 7.4 and Atlas 7.4 on September 1. New models improve coding workloads vs predecessors."
      }
    ]
  },
  {
    "finding": "R4",
    "name": "different_date_anaphoric_detail",
    "inputs": [
      {
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."
      },
      {
        "title": "Orion launches Vela 7.3 for coding compared to its predecessor",
        "sourceText": "Orion releases Vela 7.3. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. It was released on August 1, 2026.",
        "bodyPreview": "Orion releases Vela 7.3. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. It was released on August 1, 2026."
      }
    ]
  },
  {
    "finding": "R4",
    "name": "different_date_named_passive",
    "inputs": [
      {
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."
      },
      {
        "title": "Orion launches Vela 7.3 for coding compared to its predecessor",
        "sourceText": "Orion releases Vela 7.3. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Vela 7.3 was released on August 1, 2026.",
        "bodyPreview": "Orion releases Vela 7.3. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Vela 7.3 was released on August 1, 2026."
      }
    ]
  },
  {
    "finding": "R4",
    "name": "preview_anaphoric_detail",
    "inputs": [
      {
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."
      },
      {
        "title": "Orion launches Vela 7.3 for coding compared to its predecessor",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. It is a beta preview, not a generally available model.",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. It is a beta preview, not a generally available model."
      }
    ]
  },
  {
    "finding": "R4",
    "name": "preview_named_subject",
    "inputs": [
      {
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."
      },
      {
        "title": "Orion launches Vela 7.3 for coding compared to its predecessor",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Vela 7.3 is in beta preview.",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Vela 7.3 is in beta preview."
      }
    ]
  }
] as const;

/** Complete residual reviewer inputs and controls; never part of frozen gold. */
export const releaseIdentityResidualCases = [
  { name: "passive_adverb_independent_benchmark", mayMerge: false, inputs: [
    {"title": "Orion introduces Vela 7.3 for coding at lower cost", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."},
    {"title": "Vela 7.3 coding benchmark results", "sourceText": "Orion released Vela 7.3 on September 1. A fresh benchmark of Vela 7.3 was independently run by Vega Labs using 900 coding tasks. These are new measurements after the announcement, showing a regression vs its predecessor.", "bodyPreview": "Orion released Vela 7.3 on September 1. A fresh benchmark of Vela 7.3 was independently run by Vega Labs using 900 coding tasks. These are new measurements after the announcement, showing a regression vs its predecessor."},
  ] },
  { name: "passive_measurements_made", mayMerge: false, inputs: [
    {"title": "Orion introduces Vela 7.3 for coding at lower cost", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."},
    {"title": "Vela 7.3 coding benchmark results", "sourceText": "Orion released Vela 7.3 on September 1. Fresh measurements of Vela 7.3 were made by Vega Labs using 900 coding tasks. The new benchmark contradicts the announcement: agentic coding accuracy falls vs its predecessor.", "bodyPreview": "Orion released Vela 7.3 on September 1. Fresh measurements of Vela 7.3 were made by Vega Labs using 900 coding tasks. The new benchmark contradicts the announcement: agentic coding accuracy falls vs its predecessor."},
  ] },
  { name: "anaphoric_still_preview", mayMerge: false, inputs: [
    {"title": "Orion introduces Vela 7.3 for coding at lower cost", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."},
    {"title": "Orion launches Vela 7.3 for coding compared to its predecessor", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. It is still in beta preview.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. It is still in beta preview."},
  ] },
  { name: "named_still_preview", mayMerge: false, inputs: [
    {"title": "Orion introduces Vela 7.3 for coding at lower cost", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."},
    {"title": "Orion launches Vela 7.3 for coding compared to its predecessor", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Vela 7.3 is still in beta preview.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Vela 7.3 is still in beta preview."},
  ] },
  { name: "passive_already_released", mayMerge: false, inputs: [
    {"title": "Orion introduces Vela 7.3 for coding at lower cost", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."},
    {"title": "Orion launches Vela 7.3 for coding compared to its predecessor", "sourceText": "Orion releases Vela 7.3. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Vela 7.3 was already released on August 1, 2026.", "bodyPreview": "Orion releases Vela 7.3. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Vela 7.3 was already released on August 1, 2026."},
  ] },
  { name: "anaphoric_already_released", mayMerge: false, inputs: [
    {"title": "Orion introduces Vela 7.3 for coding at lower cost", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."},
    {"title": "Orion launches Vela 7.3 for coding compared to its predecessor", "sourceText": "Orion releases Vela 7.3. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. It was already released on August 1, 2026.", "bodyPreview": "Orion releases Vela 7.3. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. It was already released on August 1, 2026."},
  ] },
  { name: "independent_decimal_test_control", mayMerge: false, inputs: [
    {"title": "Orion introduces Vela 7.3 for coding at lower cost", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."},
    {"title": "Vela 7.3 coding benchmark results", "sourceText": "Orion released Vela 7.3 on September 1. A fresh benchmark of Vela 7.3 was run by Vega Labs using 900 coding tasks. These are new measurements after the announcement, showing a regression vs its predecessor.", "bodyPreview": "Orion released Vela 7.3 on September 1. A fresh benchmark of Vela 7.3 was run by Vega Labs using 900 coding tasks. These are new measurements after the announcement, showing a regression vs its predecessor."},
  ] },
  { name: "publisher_decimal_test_control", mayMerge: true, inputs: [
    {"title": "Orion introduces Vela 7.3 for coding at lower cost", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."},
    {"title": "Vela 7.3 coding benchmark results", "sourceText": "Orion released Vela 7.3 on September 1. A fresh benchmark of Vela 7.3 was run by Orion using 900 coding tasks. The announcement describes the model results vs its predecessor.", "bodyPreview": "Orion released Vela 7.3 on September 1. A fresh benchmark of Vela 7.3 was run by Orion using 900 coding tasks. The announcement describes the model results vs its predecessor."},
  ] },
  { name: "anaphoric_simple_preview_control", mayMerge: false, inputs: [
    {"title": "Orion introduces Vela 7.3 for coding at lower cost", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."},
    {"title": "Orion launches Vela 7.3 for coding compared to its predecessor", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. It is in beta preview.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. It is in beta preview."},
  ] },
  { name: "named_simple_preview_control", mayMerge: false, inputs: [
    {"title": "Orion introduces Vela 7.3 for coding at lower cost", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."},
    {"title": "Orion launches Vela 7.3 for coding compared to its predecessor", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Vela 7.3 is in beta preview.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Vela 7.3 is in beta preview."},
  ] },
  { name: "generic_positive_control", mayMerge: true, inputs: [
    {"title": "Orion introduces Vela 7.3 for coding at lower cost", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks."},
    {"title": "Orion launches Vela 7.3 for coding compared to its predecessor", "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks.", "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks."},
  ] },
] as const;
