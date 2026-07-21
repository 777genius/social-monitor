import { fingerprint } from "./yesterday-social-replay-support";

type ScanPolicyTargetRow = {
  readonly sourceBindingId: string;
  readonly scanPolicyId: string | null;
  readonly providerKey: string;
};

export const requireScanPolicyTargets = <TRow extends ScanPolicyTargetRow>(
  rows: readonly TRow[],
): readonly (Omit<TRow, "scanPolicyId"> & {
  readonly scanPolicyId: string;
})[] =>
  rows.map((row) => {
    if (row.scanPolicyId === null || row.scanPolicyId.trim().length === 0) {
      throw new Error(
        `Enabled production collection target has no scan policy: provider=${row.providerKey} sourceBindingFingerprint=${fingerprint(row.sourceBindingId)}`,
      );
    }

    return { ...row, scanPolicyId: row.scanPolicyId };
  });
