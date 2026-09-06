import { releaseEvidence } from "./story-release-event-identity.spec-support";

const leftText = "Orion introduces Vela 7.3 for coding at lower cost\nOrion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.";
const rightText = "Orion launches Vela 7.3 for coding compared to its predecessor\nOrion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks.";
const example = (name: string, text: string, mayMerge: boolean) => ({
  name, mayMerge, inputs: [releaseEvidence(leftText), releaseEvidence(text, "right", "x-twitter")],
});

/** Exact independent R10/R11 inputs, separate from all frozen evaluation data. */
export const releaseDescriptionReviewCases = [
  example("R10 model instrument with quantified workload",
    "Vela 7.3 coding benchmark results\nOrion released Vela 7.3 on September 1. Vega Labs ran the model for 12 hours on 900 coding tasks. Vega Labs found its responses less accurate than Orion reported.", false),
  example("R10 pronoun instrument with quantified workload",
    "Vela 7.3 coding benchmark results\nOrion released Vela 7.3 on September 1. Vega Labs ran it for 12 hours on 900 coding tasks. Vega Labs reports its responses less accurate than Orion claimed.", false),
  example("R11 uppercase incident remainder",
    `${rightText} Orion reports it is more accurate AND attackers stole customer records.`, false),
  example("R11 uppercase quota remainder",
    `${rightText} Orion reports it is more accurate AND Orion doubled the API quota for existing customers.`, false),
];

const lead = "Northstar launches Juniper 2.8 for coding compared to its predecessor\nNorthstar releases Juniper 2.8 on September 1. Juniper 2.8 improves coding workloads vs its predecessor.";
const adjacent = (name: string, detail: string, mayMerge: boolean) => ({
  name, detail, mayMerge, inputs: [
    releaseEvidence("Northstar introduces Juniper 2.8 for coding at lower cost\nNorthstar releases Juniper 2.8 on September 1. Juniper 2.8 has lower cost for coding workloads."),
    releaseEvidence(`${lead} ${detail}`, "right", "x-twitter"),
  ],
});

export const releaseDescriptionWorkloadCases = ["it", "the model"].flatMap((object) => [
  "for 12 hours on 275 coding tasks",
  "on 275 coding tasks for 12 hours",
  "for 30 minutes on 1,250 programming trials",
  "on 1,250 programming trials for 30 minutes",
  "for 1.5 hours on 275 coding tasks",
  "on 275 coding tasks",
].flatMap((workload) => [
  adjacent(`third-party ${object} ${workload}`,
    `Cedar Labs ran ${object} ${workload}. Cedar Labs found its responses less accurate than Northstar reported.`, false),
  adjacent(`third-party reported ${object} ${workload}`,
    `Cedar Labs ran ${object} ${workload}. Cedar Labs reports its responses less accurate than Northstar claimed.`, false),
  adjacent(`publisher ${object} ${workload}`,
    `Northstar ran ${object} ${workload}. Northstar reports its responses more accurate than its predecessor.`, true),
]));

export const releaseDescriptionConjunctionCases = ["and", "AND", "AnD", "aNd", ":", "—"].flatMap((join) => [
  ...["intruders stole customer records", "Northstar doubled the API quota for existing customers",
    "Intruders StOlE customer records", "Cedar probe an intrusion", "it was compromised"].map((remainder) =>
    adjacent(`explicit remainder ${join} ${remainder}`, `Northstar reports it is more accurate ${join} ${remainder}.`, false)),
  adjacent(`benign finite remainder ${join}`, `Northstar reports it is more accurate ${join} it costs less for coding workloads.`, true),
  adjacent(`benign comparative list ${join}`, `Northstar reports it is more accurate ${join} less verbose.`, true),
  adjacent(`benign output list ${join}`, `Cedar Labs found its responses more concise ${join} easier to follow.`, true),
  adjacent(`late incident ${join}`, `Northstar reports it is more accurate ${join} it costs less ${join} intruders stole customer records.`, false),
]);

export const releaseDescriptionAnecdoteCases = ["it", "the model"].flatMap((object) => ["12 hours", "30 minutes"].map((duration) =>
  adjacent(`benign usage ${object} ${duration}`, `Cedar ran ${object} unattended for ${duration} on a coding problem, where it corrected an issue, launched three experiments, and returned with results. Cedar Labs found its responses more concise and easier to follow.`, true)));

export const releaseDescriptionMetricListCases = [
  adjacent("colon introduces a descriptive metric list",
    "Science results are the headline: protein binders with 50% hit rate across 12 targets and 10x affinity vs the previous results.", true),
  adjacent("colon retains an explicit incident after a metric list",
    "Science results are the headline: protein binders with 50% hit rate across 12 targets. Intruders stole customer records.", false),
];

export const releaseDescriptionAttributedLeadCases = ["and", "AND", "AnD"].flatMap((join) => [
  { name: `attributed comparative lead ${join}`, mayMerge: true, inputs: [
    adjacent("left", "", true).inputs[0]!,
    releaseEvidence(`Juniper 2.8 coding compared to its predecessor\nJuniper 2.8 is cheaper, substantially stronger on coding benchmarks, ${join} apparently far less verbose (says Northstar). So far, sounds like a promising release.`, "right", "x-twitter"),
  ] },
  { name: `attributed lead retains incident ${join}`, mayMerge: false, inputs: [
    adjacent("left", "", true).inputs[0]!,
    releaseEvidence(`Juniper 2.8 coding compared to its predecessor\nJuniper 2.8 is cheaper ${join} intruders stole customer records (says Northstar). So far, sounds like a promising release.`, "right", "x-twitter"),
  ] },
]);
