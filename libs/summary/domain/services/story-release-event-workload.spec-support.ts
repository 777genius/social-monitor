import { releaseEvidence } from "./story-release-event-identity.spec-support";

const left = "Orion introduces Vela 7.3 for coding at lower cost\nOrion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.";
const example = (name: string, detail: string, mayMerge: boolean) => ({
  name, detail, mayMerge, inputs: [releaseEvidence(left), releaseEvidence(
    `Vela 7.3 coding benchmark results\nOrion released Vela 7.3 on September 1. ${detail}`,
    "right", "x-twitter",
  )],
});

/** Independent R10 residual plus adjacent forms of the same counted workload. */
const workloads = [
  "for 12 hours on a 900-task coding workload",
  "for 12 hours on 900-task coding workloads",
  "for 12 hours on 900 coding prompts",
  "for 12 hours on 900 coding tasks",
  "for 12 hours on 900 coding test cases",
  "for 12 hours on a workload of 900 coding tasks",
  "for12hours on a900-task coding workload",
  "for 12hours on a 900 - task coding workload",
  "for 1.5 hours on a 1,250-prompt coding workload",
  "for 30 minutes on 275 programming prompts",
  "on a 275-task coding workload for 30 minutes",
  "on 275 coding prompts",
];
export const releaseQuantifiedWorkloadCases = ["the model", "it"].flatMap((object) =>
  workloads.flatMap((workload) => [
    example(`R10 third-party ${object} ${workload}`,
      `Vega Labs ran ${object} ${workload}. Vega Labs found its responses less accurate than Orion reported.`, false),
    example(`R10 publisher ${object} ${workload}`,
      `Orion ran ${object} ${workload}. Orion reports its responses more accurate than its predecessor.`, true),
  ]));

export const releaseWorkloadRemainderCases = ["it", "the model"].flatMap((object) => [
  ...["", "a coding problem across 900 prompts", "a coding problem with unbound context",
    "a 900-item coding batch", "a coding problem on a 275-task workload"].map((workload) =>
    example(`incomplete or unbound workload ${object}: ${workload}`,
      `Vega Labs ran ${object} for 12 hours on ${workload}. Vega Labs found its responses less accurate than Orion reported.`, false)),
  example(`benign complete problem ${object}`,
    `Vega ran ${object} unattended for 12 hours on a coding problem, where it corrected an issue, launched three experiments, and returned with results.`, true),
  example(`benign ML problem ${object}`,
    `Vega ran ${object} unattended for 38 hours on an ML problem, where it corrected an issue, launched six experiments overnight, and returned with results and next steps.`, true),
  example(`benign clause retains subsequent workload ${object}`,
    `Vega ran ${object} unattended for 12 hours on a coding problem and Vega Labs ran ${object} for 12 hours on a 900-task coding workload.`, false),
]);
export const releaseWorkloadCases = [...releaseQuantifiedWorkloadCases, ...releaseWorkloadRemainderCases];
