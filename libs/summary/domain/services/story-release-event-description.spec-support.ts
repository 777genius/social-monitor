import { releaseEvidence } from "./story-release-event-identity.spec-support";

/** Synthetic attachment contrasts, never historical or frozen evaluation data. */
const left = releaseEvidence("Northstar introduces Juniper 2.8 for coding at lower cost\nNorthstar releases Juniper 2.8 on September 1. Juniper 2.8 has lower cost for coding workloads.");
const lead = "Northstar releases Juniper 2.8 on September 1. Juniper 2.8 improves coding workloads vs its predecessor.";
const example = (name: string, detail: string, mayMerge: boolean) => ({ name, mayMerge, inputs: [left,
  releaseEvidence(`Northstar launches Juniper 2.8 for coding compared to its predecessor\n${lead} ${detail}`, "right", "x-twitter"),
] });

const descriptions = [
  "Northstar says Juniper 2.8 is its most capable model for coding.",
  "Task-Bench 4.2: 61% vs. 32%. Juniper 2.8 is more efficient on coding tasks.",
  "Juniper 2.8 is cheaper, substantially stronger on coding workloads, and apparently far less verbose.",
  "Cedar reports equal accuracy with 18% fewer tokens.",
  "Cedar Labs found its responses more concise and easier to follow.",
  "Cedar says it solved a difficult coding problem.",
  "Cedar says it diagnosed a software crash that other models had failed to explain.",
  "Cedar ran it unattended for 12 hours on a coding problem, where it corrected an issue, launched three experiments, and returned with results.",
  "Cedar says it used half as many tokens as its predecessor.",
  "Cedar says it solved more coding problems and achieved \"excellent accuracy\" in internal testing.",
  "Juniper 2.8 designed a new component with 3x higher efficiency.",
  "Juniper 2.8 optimized its output, delivering 2.1x faster inference and estimated GPU cost savings of 15%.",
  "Custom GPU kernels giving up to 1.5x speedups on coding workloads.",
  "Science results are the headline: 44% success on coding tasks.",
  "Cache reads are now 65% cheaper. Cost is also coming down.",
  "Biology safeguards reportedly trigger 70% less often on benign questions.",
  "Safeguards loosened where they were noisy: 45% fewer interventions.",
  "Northstar also made its safeguards less restrictive for legitimate use.",
  "Atlas Console now runs on Juniper 2.8.",
  "Partner quotes (Cedar, Atlas) stress reliability and readable output.",
  "Defaults to High effort for coding tasks.",
  "There is no standardized score. It suggests they prioritize enterprise users.",
];
const conflicts = [
  "Intruders stole customer records.",
  "Cedar Labs executed 275 programming tasks on Juniper 2.8.",
  "Juniper 2.8 is still in beta preview.",
  "Juniper 2.8 was released on August 1.",
  "Northstar suspended access for existing customers.",
];
export const releaseDescriptionCases = [
  ...descriptions.map((detail) => example(`release context: ${detail}`, detail, true)),
  ...descriptions.flatMap((detail) => conflicts.map((conflict) =>
    example(`context retains subsequent conflict: ${detail} ${conflict}`, `${detail} ${conflict}`, false))),
  ...["and", "after", "because", "where", "that"].flatMap((join) => [
    "Cedar says it solved a coding problem",
    "Atlas Console now runs on Juniper 2.8",
    "Cedar ran it unattended for 12 hours on a coding problem",
    "Juniper 2.8 designed a new component with 3x higher efficiency",
  ].map((detail) => example(`context retains embedded incident: ${join} ${detail}`,
    `${detail} ${join} intruders stole customer records.`, false))),
  ...["and", "after", "where", "that", ","].flatMap((join) => [
    "Cedar cut the API quota for existing customers",
    "Cedar probe an intrusion",
    "it was compromised",
    "Juniper 2.8 was released on August 1",
    "Cedar performed 125 coding trials",
  ].map((conflict) => example(`descriptive prefix retains a finite assertion: ${join} ${conflict}`,
    `Cedar says it solved a coding problem ${join} ${conflict}.`, false))),
  ...["and cut the API quota", ", cut the API quota", "and stole customer records"].map((ending) =>
    example(`shared model subject retains completed action: ${ending}`,
      `Cedar says it solved a coding problem ${ending}.`, false)),
  example("parenthetical list retains an explicit incident",
    "The announcement includes safeguards (storage controls, intruders stole customer records).", false),
  ...["Stole customer records", "Attacked the coding service", "Steals customer records"].map((action) =>
    example(`mixed case finite predicate: ${action}`, `cedar ${action}.`, false)),
  ...["King stole customer records.", "cedar starts stealing customer records."].map((detail) =>
    example(`actor is not a participial fragment: ${detail}`, detail, false)),
  ...[
    "Cedar says it stole customer records.",
    "Cedar says it was compromised.",
    "Cedar Labs found a large regression in a new experiment.",
    "Customer records were copied from the service.",
    "Juniper 2.8 is under attack.",
    "Security requests were intercepted by intruders.",
    "Cedar Labs ran 275 coding tasks on Juniper 2.8.",
    "Atlas deployed a new integration with Juniper 2.8.",
    "Cedar says it solved a coding problem. It was stolen.",
    "Northstar says Juniper 2.8 is still in beta preview.",
  ].map((detail) => example(`explicit independent assertion: ${detail}`, detail, false)),
];
