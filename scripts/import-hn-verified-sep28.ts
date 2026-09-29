/** Separate one-day campaign entrypoint. It never invokes the Sep20-27 journal. */
import { readOperatorArtifacts, parseOperatorArgs, runVerifiedHnOperator,
  type OperatorRequest } from "./import-hn-verified-remainder";
import { planVerifiedHnRemainder, verifiedHnPlanReceipt } from "./recover-hn-verified-remainder";

export async function planSep28Operator(request: Pick<OperatorRequest, "inputRoot" | "pinsPath">) {
  const artifacts = await readOperatorArtifacts({ ...request, campaign: "sep28" });
  return verifiedHnPlanReceipt(planVerifiedHnRemainder(artifacts));
}

if (require.main === module) {
  // The collection role expires within 30 minutes. An interrupted run keeps its started
  // journal and requires manual reconciliation before another invocation.
  const deadline = setTimeout(() => {
    process.stderr.write("REFUSED_OR_UNCERTAIN\n");
    process.exit(124);
  }, 20 * 60 * 1000);
  deadline.unref();
  void (async () => {
    const args = process.argv.slice(2);
    if (args[0] === "--plan-only" && args.length === 5 && args[1] === "--input-root" && args[3] === "--pins") {
      const receipt = await planSep28Operator({ inputRoot: args[2]!, pinsPath: args[4]! });
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
      return;
    }
    const request = parseOperatorArgs(args, "sep28");
    const receipt = await runVerifiedHnOperator(request, process.env.DATABASE_URL ?? "");
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  })().catch(() => {
    process.stderr.write("REFUSED_OR_UNCERTAIN\n");
    process.exitCode = 2;
  });
}
