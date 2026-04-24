import { xdr, scValToNative } from "@stellar/stellar-sdk";

export interface DiffResult {
  key: string;
  keyDecoded?: string;
  oldValue: string | null;
  newValue: string | null;
  type: "added" | "modified" | "deleted";
  valueType?: string;
}

function tryDecodeScVal(base64: string): { display: string; type: string } {
  try {
    const val = xdr.ScVal.fromXDR(base64, "base64");
    const native = scValToNative(val);
    return {
      display: typeof native === "object" ? JSON.stringify(native) : String(native),
      type: val.switch().name,
    };
  } catch {
    return { display: base64, type: "raw" };
  }
}

function tryDecodeLedgerKey(base64: string): string {
  try {
    const key = xdr.LedgerKey.fromXDR(base64, "base64");
    const contractData = key.contractData?.();
    if (contractData) {
      const keyVal = contractData.key();
      const native = scValToNative(keyVal);
      return typeof native === "object" ? JSON.stringify(native) : String(native);
    }
    return base64.slice(0, 16) + "…";
  } catch {
    return base64.slice(0, 16) + "…";
  }
}

export function computeStateDiff(
  oldState: Record<string, string>,
  newState: Record<string, string>,
): DiffResult[] {
  const diffs: DiffResult[] = [];
  const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);

  allKeys.forEach((key) => {
    const oldVal = oldState[key];
    const newVal = newState[key];

    if (oldVal === newVal) return;

    const keyDecoded = tryDecodeLedgerKey(key);
    const newDecoded = newVal ? tryDecodeScVal(newVal) : null;
    const oldDecoded = oldVal ? tryDecodeScVal(oldVal) : null;

    const entry: DiffResult = {
      key,
      keyDecoded,
      oldValue: oldDecoded?.display ?? null,
      newValue: newDecoded?.display ?? null,
      type: !oldVal ? "added" : !newVal ? "deleted" : "modified",
      valueType: (newDecoded ?? oldDecoded)?.type,
    };

    diffs.push(entry);
  });

  return diffs;
}

export interface StorageSnapshot {
  label: string;
  takenAt: number;
  entries: Record<string, string>;
}

export function takeSnapshot(
  label: string,
  entries: Record<string, string>,
): StorageSnapshot {
  return { label, takenAt: Date.now(), entries: { ...entries } };
}

export function diffSnapshots(
  before: StorageSnapshot,
  after: StorageSnapshot,
): DiffResult[] {
  return computeStateDiff(before.entries, after.entries);
}

// ── FE-029: Workspace conflict detection utilities ────────────────────────────

import type { WorkspaceSnapshot } from "@/store/workspace-schema";

/** A human-readable summary of a single field conflict between local and remote. */
export interface WorkspaceFieldDiff {
  field: string;
  localValue: string;
  remoteValue: string;
}

/**
 * Produce a human-readable diff between two workspace snapshots.
 * Used to present conflict details to the user before they choose a merge strategy.
 */
export function diffWorkspaceSnapshots(
  local: WorkspaceSnapshot,
  remote: WorkspaceSnapshot,
): WorkspaceFieldDiff[] {
  const results: WorkspaceFieldDiff[] = [];

  const scalarFields: (keyof WorkspaceSnapshot)[] = ["name", "selectedNetwork"];
  for (const field of scalarFields) {
    const lv = String(local[field] ?? "");
    const rv = String(remote[field] ?? "");
    if (lv !== rv) {
      results.push({ field, localValue: lv, remoteValue: rv });
    }
  }

  const arrayFields: (keyof WorkspaceSnapshot)[] = ["contractIds", "savedCallIds"];
  for (const field of arrayFields) {
    const lv = JSON.stringify((local[field] as string[]).slice().sort());
    const rv = JSON.stringify((remote[field] as string[]).slice().sort());
    if (lv !== rv) {
      results.push({ field, localValue: lv, remoteValue: rv });
    }
  }

  const laRefs = JSON.stringify(local.artifactRefs.map((r) => `${r.kind}:${r.id}`).sort());
  const raRefs = JSON.stringify(remote.artifactRefs.map((r) => `${r.kind}:${r.id}`).sort());
  if (laRefs !== raRefs) {
    results.push({ field: "artifactRefs", localValue: laRefs, remoteValue: raRefs });
  }

  return results;
}
